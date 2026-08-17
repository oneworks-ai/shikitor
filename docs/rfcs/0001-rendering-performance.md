# RFC 0001: Rendering performance and less-DOM mode

- Status: Implemented
- Date: 2026-08-16
- Owners: Shikitor maintainers
- Target: `@shikitor/core` and the Playground benchmark

## Summary

Shikitor will keep the native `<textarea>` as the authoritative editing
surface while separating syntax analysis from visual rendering. It will offer
two explicit rendering modes:

- `all-dom`: render visible Shiki tokens as ordinary DOM and preserve the
  complete plugin and projection feature set through a compatibility path.
- `less-dom`: paint syntax without token DOM. OpaqueRange paints the native
  textarea when available; other capable browsers prefer a viewport-sized
  canvas, with a single mirrored text-node range bridge or SVG paint as
  compatibility fallbacks. Sparse DOM islands remain available for visual
  features that cannot be expressed as highlights.

`auto` selects `less-dom` only when the browser and active feature set support
it, otherwise it falls back to `all-dom` without changing the raw value or
editing semantics.

The implementation also upgrades Shiki, shares one language engine across
editor instances, optionally moves grammar work to a dedicated Worker, makes
tokenization incremental by grammar-state block, patches changed DOM lines
instead of replacing the whole highlighted document, and adds independent
benchmark modes for both Shikitor renderers.

## Motivation

The existing renderer calls `codeToHtml()` for the full document after every
value change and commits the result through `output.innerHTML`. A 1,000-line
editor benchmark produces roughly 21,000 DOM elements and takes close to one
second for an append operation, while Monaco and CodeMirror render a small
viewport and complete the equivalent operation around a frame boundary.

The current architecture has important strengths that must remain:

- the textarea value is the only source of truth;
- native input, IME, clipboard and undo semantics are retained;
- plugins may project source ranges without mutating the raw value;
- pointer, caret and selection geometry can be composed by plugins.

The performance work therefore changes syntax and view maintenance, not the
editing authority.

## Goals

1. Upgrade the workspace to one current Shiki version.
2. Avoid full-document tokenization when edits affect a stable suffix.
3. Keep ordinary token DOM in `all-dom` mode without scaling it to the full
   document.
4. Make per-token syntax DOM optional in browsers that support Custom Highlights.
5. Keep raw-value, selection, input and plugin semantics compatible.
6. Measure `Shikitor [less dom]` and `Shikitor [all dom]` independently against
   Monaco, CodeMirror and applicable diff viewers.
7. Make fallback and the renderer actually selected observable.
8. Measure cold and warm mount separately, together with compressed and decoded
   SDK resources that affect first use.
9. Separate interactive readiness and visible input paint from complete syntax
   readiness, and measure operations where a native textarea has a structural
   advantage: raw-value reads, selection updates and whole-document replacement.

## Non-goals

- Replacing the textarea with `contenteditable`.
- Reimplementing the browser's editing, IME or undo stack.
- Claiming that CSS Highlights can perform layout, insert images or collapse
  source ranges.
- Making every existing projection plugin native-highlight capable in the
  first implementation.
- Treating one in-page development run as a laboratory-grade benchmark.

## Public API

`ShikitorOptions` gains:

```ts
type ShikitorRenderMode = 'auto' | 'less-dom' | 'all-dom'

interface ShikitorOptions {
  /** @default 'auto' */
  renderMode?: ShikitorRenderMode
}
```

The root element publishes the effective mode through:

```html
<div class="shikitor" data-shikitor-render-mode="less-dom">
```

This reflects the active backend after capability resolution, not only the
requested option.

## Rendering requirements

Visual work is classified by its effect on native textarea layout:

| Requirement | Examples | Backend |
| --- | --- | --- |
| Paint | syntax color, diagnostic background, underline | CSS Highlights |
| Overlay | icon, caret-anchored popup, non-flow marker | sparse positioned DOM |
| Projection | compressed Markdown, folding, block widget, diff row | projected DOM |

`less-dom` handles paint directly. Sparse overlays may be layered on it when
they do not change text flow. Projection features require an affected-line
island or, until that island supports the feature, an `all-dom` fallback.

## Architecture

### Shared incremental tokenizer

Both renderers consume the same themed token model. The tokenizer:

1. lazily creates one page-level Shiki highlighter and dynamically loads each
   requested language and theme once;
2. scans newline offsets once into a shared document index without eagerly
   allocating one string per line;
3. materializes source strings only for the viewport or current background
   block, then records themed tokens and ending grammar state;
4. finds the first changed line on update;
5. restarts from the nearest grammar checkpoint;
6. reuses unchanged blocks when both source and grammar state converge;
7. keeps bounded, exact-source token snapshots for later editor instances.

Small documents retain per-line checkpoints. Documents over 128 lines are
tokenized in 64-line blocks on the main-thread fallback. The Worker publishes
the first 32 lines and then continues in 256-line blocks, reducing highlighter
crossings without delaying visible syntax. Both paths preserve line-local
offsets and grammar state. The shared exact-source LRU is limited to eight
entries and an estimated 16 MB, and only matches the exact language, theme and
raw value. Theme or language changes invalidate local reuse.

Tokenization remains interruptible through the latest-render generation check;
stale results never commit.

### Optional syntax Worker

Applications can create one shared `ShikitorSyntaxWorker` and inject it through
the third `create()` argument. The Worker owns grammar loading, initial
tokenization and incremental suffix work; if it is unavailable or fails, the
same editor instance automatically continues with the main-thread tokenizer.

The main realm and Worker exchange a 32-line viewport snapshot first. Neither
the cold path nor that first message allocates placeholder objects for the
remaining document. Worker messages omit duplicated source strings; the main
realm rehydrates them from the shared line index. The final message contains
only the suffix beginning at `changedFrom`, rather than cloning the entire
token document after every edit. Exact warm snapshots are kept in
the main realm so a second editor can paint immediately. A background seed
reconnects that snapshot to the Worker's grammar state before the next changed
value is analyzed. Repeated renders of an unchanged value stay inside the
session cache and do not cross the Worker boundary.

`preload(theme, language)` loads the requested Shiki assets in the Worker before
mount. `reset()` clears grammar and token state for isolated cold benchmarks;
normal application mounts retain the bounded cache. The standard Worker entry
is exported as `@shikitor/core/workers/tokenization`, while Worker construction
remains bundler-owned so UMD and non-Vite consumers are not coupled to an
internal URL convention.

### `all-dom`

`all-dom` retains the existing output shape required by plugins:

```html
<pre>
  <code class="shikitor-output-lines">
    <span class="shikitor-output-line" data-line="1">...</span>
  </code>
</pre>
```

For a plain editor, the renderer creates token spans only for the visible range
plus overscan and moves that window with the textarea scroll position. Token
spans preserve the existing classes and offset metadata, but total live nodes
follow viewport size rather than document length. The gutter uses the same
window. Rendering paths that require Shiki decorations, source projection, or
plugins keep the complete compatibility HTML and gutter projection until their
DOM-island implementation exists.

### `less-dom`

`less-dom` uses Shiki token offsets without serializing token HTML:

1. group tokens by paint style;
2. create live ranges with `textarea.createValueRange(start, end)` when
   OpaqueRange is available;
3. otherwise draw only visible tokens into one viewport-sized canvas;
4. when Canvas 2D is unavailable, keep one mirrored text node and create DOM
   ranges over that node;
5. register those ranges in `CSS.highlights` and generate scoped
   `::highlight(name)` rules;
6. when neither native ranges, canvas nor Custom Highlights are available,
   draw visible rows into one SVG background;
7. update only the changed lines' range membership or visible viewport rows.

The textarea remains the authoritative interactive surface in both variants.
With OpaqueRange it also owns visible text paint. The compatibility bridge
keeps the textarea transparent above one mirrored text node, but never creates
per-line or per-token elements. Selection, scrolling, IME and accessibility
remain native textarea behaviors.

The viewport-paint backend redraws the visible viewport on scroll and resize. It does
not rasterize the full document, matching the viewport-paint strategy used by
long-lived editors while keeping the raw textarea as the editing authority.

Mount and input do not wait for whole-document tokenization. Before the first
token snapshot, the native textarea paints its own plaintext directly; no
canvas/SVG fallback splits the full value, reads computed font metrics or draws
before the first interactive frame. The asynchronous viewport result then
activates the selected paint backend only if it still belongs to the latest
value. This keeps the input readable and editable without pretending syntax is
already ready.

Line numbers use the same virtual viewport window as the renderer rather than a
5,000-line text node or one element per document line. Current-line paint uses
one editor-level layer instead of per-line DOM.

OpaqueRanges are disconnected, bridge ranges are removed, and highlight
registry entries are deleted on mode changes and disposal.

### Sparse DOM and projection islands

Sparse overlays are positioned from OpaqueRange geometry. Purely visual
overlays use `pointer-events: none`; interactive overlays explicitly restore
focus and selection to the textarea after handling an action.

An overlay cannot change the textarea's text flow. Replacing one character with
an equal-width icon is safe as an overlay. Compressing a Markdown link or
folding physical rows changes layout and therefore needs a projection island.

The first release falls back to `all-dom` whenever active decorations, inline
replacements or plugins require projected DOM. A later RFC may define the
plugin capability declaration and affected-line island lifecycle.

## Capability resolution

`less-dom` requires all of the following:

- CSS Custom Highlights, a 2D canvas context, or SVG viewport paint;
- no active layout projection, Shiki decoration or plugin that depends on the
  token DOM.

`HTMLTextAreaElement.prototype.createValueRange` selects the preferred native
paint variant. Without it, Canvas 2D is preferred because its cost follows the
viewport rather than the document's token count. The single-text-node Custom
Highlight bridge and SVG viewport paint remain compatibility fallbacks instead
of forcing full token DOM.

Resolution behavior:

| Requested | Capable | Effective |
| --- | --- | --- |
| `auto` | yes | `less-dom` |
| `auto` | no | `all-dom` |
| `less-dom` | yes | `less-dom` |
| `less-dom` | no | `all-dom` |
| `all-dom` | any | `all-dom` |

Fallback is observable through `data-shikitor-render-mode`. It is not an error,
because compatibility is more important than forcing a partially functional
view.

## Shiki upgrade

All direct Shiki packages in core and Playground move to Shiki 4.4.3.
Deprecated `getHighlighter` usage moves to the supported
creation API. Core uses Shiki's JavaScript regular-expression engine instead of
shipping Oniguruma WASM; the same TextMate grammars and theme data remain lazy
loaded. The upgrade must preserve language/theme public types and core bundle
output.

The renderer consumes token data instead of relying on serialized HTML for the
fast paths. The shared highlighter lives for the page module lifetime; editor
disposal releases editor-local tokens and paint resources without repeatedly
destroying and rebuilding the language engine.

## Benchmark design

The in-page benchmark exposes two independently measured Shikitor modes as a
top-level option:

- `Shikitor [less dom]`
- `Shikitor [all dom]`

Only the selected Shikitor mode is shown in a run, where it acts as the neutral
baseline for Monaco, Monaco with the same Shiki TextMate tokenizer, CodeMirror
and Pierre. The `Monaco + Shiki` row separates tokenizer cost from editor-view
cost instead of comparing Shikitor's TextMate grammar only with Monaco's built-in
tokenizer. Every comparable competitor cell
shows its lower-is-better percentage delta from that baseline; lower values are
green and higher values are red. The engines receive identical generated input,
theme, dimensions, edit count and paint waits. The less-DOM adapter verifies the
effective root data attribute. If the runtime lacks CSS Custom Highlights, the result is reported as
unsupported rather than silently measuring the full-DOM fallback. The root
also reports whether less-DOM used `opaque-range` or `range-bridge`.

Metrics are:

- lazy module load;
- cold first-instance interactive mount to two paints;
- warm second-instance interactive mount to two paints after disposing the first view;
- viewport and complete-document lexical syntax readiness from the same
  isolated cold-mount start;
- viewport and complete-document readiness from a second mount that retains
  the engine and exact-source token cache;
- same-origin SDK resource count, transfer, compressed body and decoded body
  sizes from import through cold readiness;
- repeated append to visible paint, P50 and P95; pending syntax is awaited
  outside the input sample before later phases;
- full scroll to two paints;
- average raw-value read and programmatic selection-update cost;
- whole-document replacement acknowledgement cost;
- DOM element count;
- application-memory estimate delta from `measureUserAgentSpecificMemory`,
  including the page, DOM and dedicated workers when cross-origin isolation is
  available; unsupported environments report no value instead of falling back
  to the legacy main-thread heap API.

The report records the requested and effective renderer, including the
less-DOM paint backend. Decisions should use repeated production-build runs
and compare distributions, not one sample.

## Evaluation

The Worker-enabled implementation was evaluated in desktop Chromium with a production
Playground build, a deterministic 5,000-line TypeScript document and five
append-and-paint samples per engine. Each Shikitor mode was measured in a fresh
page run. The table is the final raw validation run;
the preceding runs were directionally consistent, but performance decisions
must still compare repeated distributions on the target hardware. Each input
metric is already a percentile of that run's five samples.

| Engine | Module | Cold interactive | Warm interactive | Cold viewport | Cold full | Warm viewport | Warm full | SDK compressed / decoded | Input P50 | Input P95 | Scroll | DOM elements | App memory Δ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Shikitor `less-dom/canvas/worker` | 51.9 ms | 60.5 ms | 58.2 ms | 213.2 ms | 525.9 ms | 66.3 ms | 83.6 ms | 261.6 KB / 804.7 KB | 52.7 ms | 149.8 ms | 5.23 ms | 51 | +31.97 MB |
| Shikitor `all-dom/worker` | 40.4 ms | 57.6 ms | 50.4 ms | 228.7 ms | 476.7 ms | 58.4 ms | 74.3 ms | 261.6 KB / 804.7 KB | 58.4 ms | 159.2 ms | 13.7 ms | 471 | +26.71 MB |
| Monaco 0.56 built-in tokenizer | 177.6 ms | 43.6 ms | 18.5 ms | 64.2 ms | 111.1 ms | 33.9 ms | 72.2 ms | 1.01 MB / 3.96 MB | 16.5 ms | 17.2 ms | 16.8 ms | 267 | +88.81 MB |
| Monaco 0.56 + Shiki 4.4 TextMate | 3.32 ms | 58.1 ms | 17.7 ms | 159.2 ms | 772.3 ms | 33.6 ms | 622.4 ms | 285.8 KB / 1.08 MB | 16.5 ms | 16.8 ms | 15.9 ms | 341 | +32.38 MB |
| CodeMirror 6 | 42.3 ms | 16.2 ms | 18.8 ms | 32.5 ms | 132.5 ms | 33.8 ms | 125.3 ms | 173.6 KB / 518.7 KB | 16.7 ms | 16.8 ms | 16.7 ms | 374 | +2.16 MB |

The textarea-native operations expose a different part of the architecture:

| Engine | Raw value read | Selection update | Replace 5,000 lines | Native textarea |
| --- | ---: | ---: | ---: | --- |
| Shikitor `less-dom` | 0.03 µs | 0.28 µs | 5.61 ms | yes |
| Shikitor `all-dom` | 0.02 µs | 0.19 µs | 5.73 ms | yes |
| Monaco 0.56 | 0.30 µs | 502.5 µs | 4.88 ms | no |
| Monaco 0.56 + Shiki | 0.80 µs | 559.9 µs | 9.56 ms | no |
| CodeMirror 6 | 43.1 µs | 1.09 ms | 37.1 ms | no |

Each run shows one selected Shikitor mode as the comparison baseline. SDK size
still reports resources newly observed by that run, so a later mode can inherit
the browser's module cache; use a fresh page context when cold payload size is
the decision metric. JSON export retains `transferSize`, `encodedBodySize`,
`decodedBodySize` and the resource count for deeper inspection.

The exact token snapshot, Worker and synchronous plaintext fallback make the
editor interactive before Shiki finishes. Module preparation plus cold
interactive mount is 112.4 ms for less-DOM versus Monaco's 221.2 ms, while the native textarea keeps
raw-value reads, selection updates and full-document replacement substantially
cheaper. These are architectural advantages rather than a composite score:
Monaco and CodeMirror translate those operations through document/view models.

Compared with the pre-Worker RFC sample, less-DOM cold viewport syntax falls
from 538.7 ms to 213.2 ms and cold full syntax from 791.1 ms to 525.9 ms. The
second less-DOM mount reuses the exact snapshot and reaches full syntax in
83.6 ms. The Shikitor payload remains roughly one quarter of Monaco's compressed
payload, and less-DOM keeps 51 live elements versus Monaco's 267. All-DOM is
also viewport virtualized: it keeps 471 live elements rather than projecting
all 5,000 lines.

The same report keeps the losses visible. Shikitor's TextMate grammar remains
slower than Monaco's built-in tokenizer and CodeMirror's Lezer parser: cold
full syntax is 525.9 ms for less-DOM and 476.7 ms for all-DOM, versus 111.1 ms
and 132.5 ms. The tokenizer-controlled comparison changes the conclusion:
Monaco with the same Shiki 4.4 TextMate grammar takes 772.3 ms cold and 622.4 ms
warm, so Shikitor's block tokenizer, Worker transport and exact snapshot cache
are materially faster than the direct Monaco/Shiki composition. Warm
mount and generic input paint also remain faster in the mature editors. Worker
offload protects main-thread interaction but does not make TextMate grammar
execution itself cheaper. Monaco
0.56 is forced through its pinned runtime tokenization service and CodeMirror
through public `forceParsing`, so deferred competitor work is no longer
mislabeled as complete. A CSS Highlights bridge was also tried as the preferred
fallback, but creating full-document DOM Range sets exceeded the benchmark
timeout in this runtime, so Canvas remains the bounded default. The in-page
benchmark displays raw runs and exports its environment instead of presenting
these values as universal machine-independent scores.

## Acceptance criteria

### Correctness

- raw value, copy/paste and submission match between modes;
- normal typing, selection, IME-compatible `input` updates and undo remain
  native;
- theme and language changes repaint without stale commits;
- line numbers, scrolling and current-line geometry stay aligned;
- unsupported browsers and projection features fall back to `all-dom`;
- disposal removes highlight registry entries and generated styles.

### Performance

For the 1,000-line plain-editor case on the same Chromium runtime:

- `all-dom` edit P50 must materially improve over the pre-RFC baseline;
- `less-dom` must create substantially fewer DOM elements than `all-dom`;
- `less-dom` edit P50 must be lower than `all-dom` or the result must identify
  the remaining tokenizer/paint bottleneck;
- no mode may regress scroll correctness or leave stale syntax visible.

No fixed cross-machine millisecond threshold is part of the public contract.

## Risks and mitigations

- **OpaqueRange availability:** capability detection, then range bridge or
  viewport paint; browsers without any paint primitive use `all-dom`.
- **Highlight property limits:** use only supported paint properties; projected
  typography remains DOM rendered.
- **Global highlight registry collisions:** generate per-editor names and clean
  them up on disposal.
- **Grammar edits invalidating later lines:** propagate tokenization until the
  cached grammar state converges.
- **Shared snapshot memory:** use an eight-entry LRU with an estimated 16 MB
  ceiling; editor-local caches are still released on disposal.
- **Worker or bundler incompatibility:** keep Worker creation injectable and
  fall back to the main-thread tokenizer after a runtime failure.
- **JavaScript regex compatibility:** retain full-document and multiline
  grammar-equivalence tests across block boundaries.
- **Plugin reliance on token nodes:** conservative fallback in the first
  release.
- **Benchmark bias:** expose unsupported/fallback state and retain competitors'
  native virtualization rather than normalizing away their advantage.

## Rollout

1. Land the RFC and Shiki upgrade.
2. Add the shared incremental token model and optimized `all-dom` renderer.
3. Add `less-dom`, capability resolution and cleanup.
4. Add independent benchmark engines and regression tests.
5. Keep `all-dom` as an explicit escape hatch while `auto` gathers runtime
   evidence.
