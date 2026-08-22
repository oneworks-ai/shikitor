# RFC 0002: Diff rendering performance

- Status: Implemented
- Date: 2026-08-22
- Owners: Shikitor maintainers
- Target: `@shikitor/core` (`plugins/diff`, `plugins/line-widgets`,
  `plugins/code-folding`, all-DOM renderer) and the Playground benchmark

## Summary

The editable diff plugin kept the RFC 0001 architecture — the textarea is the
only source of truth and the baseline is projected next to it — but every
keystroke re-serialized the whole document through `codeToHtml()`, rebuilt the
complete gutter, and drove three plugins through O(n²) DOM lookups and
interleaved layout reads. In a 1,000-line unified diff a single keystroke took
~780 ms to paint; Monaco, CodeMirror and Pierre paint the same edit in one
frame.

This RFC keeps the editing authority and the plugin model unchanged and makes
the projection incremental:

- the all-DOM renderer patches only changed line elements for plugin-owned
  projections instead of replacing `output.innerHTML`, and appends or trims the
  full gutter instead of rebuilding it;
- `line-widgets` and `code-folding` run one O(n) pass per frame with indexed
  lookups, batch their layout reads, and cache geometry;
- the diff view diffs its own decorations against the elements it already
  decorated, virtualizes the split-view original column, tokenizes the
  baseline with the shared Shiki engine, and ignores DOM mutations it caused;
- the Playground benchmark gains a headless driver, a CPU profiler, and a
  working Pierre engine so the numbers below are reproducible.

## Competitive context

Survey of the editors and diff viewers Shikitor is measured against (public
data collected 2026-08-22; weekly downloads from the npm API, sizes from
bundlephobia unless noted):

| Library | Editing surface | Rendering model | Highlighting | Editable diff | Extensibility | Size (min / gzip) | Weekly downloads |
| --- | --- | --- | --- | --- | --- | ---: | ---: |
| Shikitor `@shikitor/core` 1.0 | native `<textarea>` is the document | token DOM or less-DOM paint; plugin projections keep one element per line | Shiki 4 TextMate grammars, JS regex engine, shared incremental tokenizer, optional Worker | unified/split, accept/reject hunks, collapse unchanged | Cordis plugin runtime (services, events, scoped disposal) | ~262 KB gzip in the Playground build incl. grammars used | n/a (0.5 k) |
| Monaco 0.56 (+ DiffEditor) | hidden textarea / EditContext, custom view lines | viewport-virtualized view model | Monarch (TextMate via `@shikijs/monaco`) | both sides, revert arrows, hide unchanged | providers, widgets; no plugin system | ~1 MB gzip + workers | 7.3 M |
| CodeMirror 6 (+ `@codemirror/merge`) | `contenteditable` | viewport-virtualized | Lezer incremental parser | side-by-side and unified, accept/reject | facets/extensions | 87 KB gzip (merge incl. deps) | 8.6 M (1.5 M merge) |
| Pierre `@pierre/diffs` 1.3 | static HTML; `contenteditable` overlay in edit mode | per-line hast cached, serialized once, CSS subgrid rows, render-range windows, `CodeView` virtualizer | Shiki in a worker pool with LRU cache | edit mode (piece table, custom caret/selection) | options, annotations, callbacks | 174 KB gzip | 2.2 M |
| Ace 1.44 | hidden textarea, VirtualRenderer | viewport-virtualized | own modes | `createDiffView` (2025) / ace-diff | ext modules | 126 KB gzip | 1.2 M |
| diff2html, react-diff-view, react-diff-viewer(-continued), `@git-diff-view/react` | none (read-only) | static tables / rows, no virtualization (git-diff-view: optional worker) | highlight.js / Prism / Shiki | no | render props | 13–51 KB gzip | 0.06–0.7 M |

Where Shikitor is structurally different:

- Editing semantics are the browser's: IME composition, undo/redo, clipboard,
  spellcheck, form participation, mobile keyboards and accessibility come
  from the textarea. Monaco moved to EditContext for IME, CodeMirror and
  Pierre's edit mode reimplement them over `contenteditable`.
- Textarea-native operations are orders of magnitude cheaper than
  document-model equivalents (RFC 0001: raw value read 0.03 µs, selection
  update 0.28 µs, 5,000-line replace 5.6 ms).
- Shiki-native highlighting shares the grammars and themes of the Shiki
  ecosystem; the JS regex engine avoids WASM; less-DOM mode can paint syntax
  without per-token DOM and is positioned for OpaqueRange/CSS Highlights.
- Cordis gives plugins dependency injection, typed services and scoped
  disposal; the diff plugin itself composes line-widgets and code-folding.

Where it is structurally weaker, and what this RFC does about it:

- The single native text flow cannot host layout changes (folding, block
  widgets, split-diff alignment), so those are projections over the
  textarea. Projections used to force the serialized full-document render on
  every keystroke; this RFC makes them incremental but keeps one element per
  line while layout-changing plugins are active.
- TextMate tokenization is slower than Monarch/Lezer; this RFC does not
  change that, it stops re-tokenizing and re-serializing the unchanged
  document.
- Pierre's diff numbers come from a static render that touches only the
  lines an edit changes; matching that on top of a textarea needs the
  patching and observer discipline described below.

Benchmark comparability notes: the Pierre adapter uses the non-virtualized
`FileDiff` without a worker pool and the `@pierre/diffs/edit` editor, with
`collapsedContextThreshold: 8`; Shikitor uses `collapseUnchanged: {context:
2, minimum: 8}`, so rendered row counts differ slightly. All engines receive
the same generated input, edits are programmatic appends, and the Shikitor
edit includes the textarea's own inner-editor rebuild for a programmatic
`setRangeText` (~1,000 text nodes and `<br>`s re-inserted per edit in
Chrome), which real typing does not pay.

## Baseline measurements

Production Playground build, headless desktop Chrome (`playground/scripts/run-benchmark.mjs`),
diff suite, unified view, 5 % changed lines, 20 append-and-paint iterations,
third of three runs. DOM counts include each engine's complete subtree.

| Engine | Cold mount | Warm mount | Edit P50 | Edit P95 | Scroll | DOM elements |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Shikitor diff (before) | 385.1 ms | 821.0 ms | 781.5 ms | 849.6 ms | 24.8 ms | 68,593 |
| Monaco 0.56 DiffEditor | 59.3 ms | 16.4 ms | 16.6 ms | 17.8 ms | 15.0 ms | 1,373 |
| CodeMirror 6 MergeView | 30.1 ms | 19.5 ms | 16.6 ms | 18.7 ms | 17.8 ms | 834 |
| Pierre 1.3.1 editable diff | 604.8 ms | 299.9 ms | 16.4 ms | 17.8 ms | 13.9 ms | 11,959 |

Same configuration at 5,000 lines (10 iterations, median of two runs; all
engines, same dataset):

| Engine | Cold mount | Warm mount | Edit P50 | Edit P95 | Scroll | DOM elements |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Shikitor diff (before) | 10,661 ms | 17,169 ms | 19,399 ms | 20,267 ms | 88.1 ms | 398,210 |
| Monaco 0.56 DiffEditor | 95.2 ms | 17.4 ms | 16.7 ms | 35.8 ms | 15.5 ms | 4,543 |
| CodeMirror 6 MergeView | 75.6 ms | 56.1 ms | 16.7 ms | 18.1 ms | 16.7 ms | 615 |
| Pierre 1.3.1 editable diff | 2,700 ms | 1,450 ms | 16.6 ms | 477.6 ms | 16.7 ms | 60,359 |

Split view, 1,000 lines (20 iterations, median of two runs): Shikitor edit
P50 354.5 ms with 53,574 elements; Monaco, CodeMirror and Pierre 16.7 ms with
642, 753 and 21,286 elements.

The baseline was measured on a production build of `master` with only the
Playground build fixes applied, served from a separate worktree, so the
"before" and "after" numbers come from the same harness, machine and
browser.

### Where the time went

CPU profile of the edit loop (dev build, 1,000 lines, 8 keystrokes,
`playground/scripts/profile-diff.mjs`, sampling every 100 µs):

| Inclusive share | Hot path | Cause |
| ---: | --- | --- |
| 53 % | `line-widgets` `render` → `syncHeight` | one forced layout per widget: `getBoundingClientRect` of every widget, then `renderCursor` and `renderSelection`, for every widget (O(w²) layouts) |
| 20 % | `code-folding` geometry helpers via the cursor geometry layer | `widgetHeightBeforeLine` re-queried and re-measured every widget on every call; `visibleRow` scanned all ranges per line |
| 17 % | `querySelector` (self) | per-row `[data-line="N"]` lookups in the diff view, line widgets and code folding: O(n) each, O(n²) per pass |
| 14 % | `_getCursorAbsolutePosition` | measured a span containing `'\n'.repeat(line)` appended to `document.body` on every call |
| 11 % | `codeToHtml` + `output.innerHTML` | any plugin disabled the token snapshot path, so the whole document was re-tokenized, serialized and re-parsed per keystroke, and the full gutter was rebuilt |
| 8 % | diff view `renderOriginalRows` | the hidden original column was rebuilt in unified view too |
| 9 % | `code-folding` `render` | full sweeps with per-range queries |

Two Playground defects also distorted comparisons and are fixed here: the
production build externalized `shiki` to a CDN `shiki@^1.2.0` import map while
bundling Shiki 4.4.3 elsewhere, and the lockfile resolved part of the Shiki
family through a registry-qualified key so two copies of
`@shikijs/vscode-textmate` shipped; Pierre's editor crashed with
`Cannot read properties of null (reading 'compileAG')` because grammar state
from one copy reached a grammar from the other.

## Goals

1. Edit-to-paint latency in the diff suite within a small constant factor of
   one frame for 1,000-line documents, and bounded by the number of changed
   lines rather than the document length.
2. Keep the complete line DOM that projection plugins rely on, without
   rebuilding it on every keystroke.
3. Split view original column cost bounded by the viewport, and current-side
   token DOM bounded by the viewport even while folding and widgets are
   active.
4. One Shiki engine for both sides of the diff.
5. Reproducible numbers: headless benchmark driver, profiler, and a working
   Pierre comparison.

## Non-goals

- Replacing the textarea or introducing a private document model.
- Replacing the per-line element contract plugins rely on; lazy
  materialization keeps one element per line and virtualizes content only.
- Changing the diff algorithm.

## Design

### Incremental full line projection (core)

`canVirtualizeAllDom()` still decides when the viewport-only renderer is safe.
A new `needsHtmlProjection()` separates features that are expressed through
Shiki's HTML renderer (decorations, exact-range highlights, inline
replacements) from plugins that merely require complete line elements.
Plugin-only projections now take the token snapshot path: the renderer keeps
one `.shikitor-output-line` per source line but

- on value change mirrors the document by comparing rendered line sources
  with the new document head and tail (`resolveLinePatch`), replacing only the
  changed middle block and renumbering shifted tail elements;
- on token snapshots replaces lines whose source changed and patches, in
  place, lines whose source is unchanged but whose paint differs
  (`tokenizedLinesEquivalent`); an in-place patch keeps the element, its
  classes and its position, so line-structure observers stay quiet, and it
  dispatches a bubbling `LINE_PATCH_EVENT` so plugins that decorate inside a
  line (diff inline markers, fold placeholders) restore that one line.

The full gutter keeps its elements and only appends or removes the
line-count delta. Unchanged lines therefore keep their identity across
keystrokes, plugin decorations on them survive, and mutation observers see
only the changed lines.

### Lazy line materialization (projection islands)

Plugins that change layout (folding hides lines, widgets insert block rows)
rely on one element per source line, but they do not need every element to
carry token DOM. The projection therefore keeps a one-line placeholder
(`data-shikitor-virtual`, a single space text node, same line box height)
for every line and materializes token content only for the lines around
the scrolled viewport plus overscan. The window follows the flow layout
itself: visible (non-hidden) line elements are located by `offsetTop` with
a binary search (`resolveMaterializationWindow`), so hidden lines and widget
rows inserted by plugins are respected without a private layout model.
The window is refreshed on scroll, resize, value/snapshot changes and
whenever the line container's size changes (one `ResizeObserver`).
Materializing a line dispatches `LINE_PATCH_EVENT`, so the diff view re-keys
that line and code folding re-renders when the line carries fold DOM; lines
leaving the window drop back to placeholders. Element count becomes
O(lines + window × tokens): 6.9 k instead of 26.9 k at 1,000 lines, and the
remaining style and layout work no longer grows with the document.

Edited lines are patched in place as well (element, attributes and
position survive; plugins receive `LINE_PATCH_EVENT`), so a keystroke is a
content change rather than a line-structure mutation. That lets the plugins
skip their passes: code folding keeps its DOM when ranges, collapsed state,
line count and line structure are unchanged (`foldRenderSignature`);
line-widgets keeps its regions and only refreshes widget contents when the
widget list and line structure are unchanged (`sameLineWidgetLayout`); the
diff view keeps its line maps while the structure is unchanged and, on a
model update, decorates only lines whose row key changed; and typing inside
an added or modified row updates that row directly
(`updateDiffModelForLineEdit`) instead of re-running the Myers diff over the
whole document (context-line and structural edits still take the full
diff). Removed-row widgets render their cloned baseline line only while
their anchor line is materialized.

Two more costs scaled with the document through inherited CSS properties
rather than DOM size, and are removed: the caret position variables
(`--shikitor-cursor-t/l`) were written on the editor root, so every caret
move restyled every descendant — they are now written on the
`.shikitor-cursors` layer through `setCursorGeometry` (all in-repo writers,
including line-widgets, code-folding and inline-replacements, go through it;
`dsh-shikitor`'s own root writes keep working because the cursor elements
inherit the nearest value); and the plaintext fallback colors on the output
(`color` inherits) were rewritten on every keystroke — they are now applied
once. The fold-pending class uses `opacity` instead of inherited
`visibility`.

The scroll offset variables (`--shikitor-scroll-t/l`, `--shikitor-offset-x/y`)
had the same shape: written on the root on every scroll frame, inherited by
every line and token, consumed only by the caret layer, popups and selection
overlays. `setProjectionScroll` now writes them on elements that opt in with
the `shikitor-follows-scroll` class (the cursor layer, popups through
`applyProjectionScrollTo`, code folding's selection layer), moves the full
line projection with a `transform` on its `<pre>` instead of `scrollTop`
(which also makes the widget case consistent), keeps the root variables only
for the small less-DOM, viewport-virtual and serialized-HTML projections, and
stores the visual horizontal offset in a data attribute instead of a root
custom property. Core, code folding and inline replacements route their
writes through the helper. Scroll-to-paint at 5,000 lines (dev build, 400
steps) went from 67 ms to 16.7 ms per step; at 1,000 lines from 22 ms to
16.7 ms (`playground/scripts/scroll-diff.mjs`).

Two pre-existing defects surfaced once scrolled editing was exercised and
are fixed alongside: the line-widgets stylesheet made the output
`overflow: visible` (so `scrollTop` could not scroll the projection while
widgets were active) — the projection now follows the synchronized scroll
offsets through a transform, and code folding measures the projection's
layout size instead of `scrollHeight`; and the textarea's widget padding
could exceed the editor height, letting the browser's caret reveal scroll
the editor's clip boxes — the padding now covers only what the source text
does not and never grows the textarea past its container.

The edit path also stops forcing synchronous style and layout flushes:
caret geometry measures one line box and adds `line × lineBox` instead of a
span containing the document prefix, reuses one measuring element, and reads
computed font properties at most once per frame and once per second; the
caret overlay is positioned in an animation frame; selection sync no longer
reads the document selection while the textarea is focused; the content
offset and viewport geometry are sampled on resize/scroll instead of inside
the render pass; theme custom properties are written only when they change;
and the line-highlight layer skips its measurement pass when no highlights
are configured. `RawTextHelper` indexes line starts so position and line
lookups are O(log n) instead of splitting the text per call.

### Plugin passes

`line-widgets` indexes lines once per pass, mounts widgets (reusing regions
and spacers by widget id when anchor and presentation are unchanged), then
performs one read pass (region heights, gutter width, caret geometry,
selection) and one write pass; a single shared `ResizeObserver` batches
resize notifications; `widgetHeightBeforeLine` is answered from cached
prefix sums; caret updates from cursor changes are coalesced into a frame.
`code-folding` indexes lines once, precomputes a hidden-line index with
prefix sums for `isLineHidden`/`visibleRow`, caches widget measurements per
frame, reconciles placeholders, wrappers and presentation attributes
idempotently (unchanged collapsed regions cost no DOM writes), reads the
caret geometry before its writes, and re-renders when a patched line carries
fold DOM. Both observers ignore cloned baseline lines (`[data-line]` only).

### Diff view

The view decorates current lines by comparing a per-element key (row kind,
hunk, inline ranges) with what it applied before, cleaning and re-applying
only changed elements; a line patched in place is re-keyed through
`LINE_PATCH_EVENT`. Its mutation observer ignores subtree changes that do
not add or remove real line elements (its own markers, widgets, fold
placeholders) and watches `hidden`/`data-fold-presentation` for split-view
alignment. The original column renders only the rows within the scrolled
viewport plus overscan (`resolveOriginalWindow`) on an absolutely positioned
row layer, and nothing in unified view, where scroll offsets are not even
read. The baseline is tokenized by the shared incremental highlighter;
original line elements are built lazily per line and cloned, and removed-row
widgets skip re-rendering when their content key is unchanged.

### Benchmark infrastructure

- `playground/scripts/run-benchmark.mjs` drives the Playground benchmark page
  headlessly (Chrome via Playwright), seeds a run, survives the page reloads
  between engines, filters engines, repeats runs and exports JSON.
- `playground/scripts/profile-diff.mjs` samples the main thread with the
  DevTools profiler while an adapter performs edits and prints self/inclusive
  time per function.
- `playground/scripts/capture-diff.mjs` captures screenshots and DOM health
  of the diff demo.
- The Playground bundles one Shiki 4.4.3 (no CDN import map) and aliases
  `@shikijs/vscode-textmate` to the copy Shiki itself uses.

## Evaluation

### Production benchmark

Same harness, machine and browser as the baseline; production build of this
branch; medians across runs (3 runs at 1,000 lines unified, 2 runs
otherwise). "Before" values are the baseline medians from the section above.

| Configuration | Engine | Cold mount | Warm mount | Edit P50 | Edit P95 | Scroll | DOM elements |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 lines, unified | Shikitor diff before | 385.1 ms | 859.4 ms | 726.6 ms | 774.4 ms | 24.8 ms | 68,593 |
| | **Shikitor diff after** | **219.9 ms** | **88.1 ms** | **33.4 ms** | **42.8 ms** | **20.8 ms** | **44,566** |
| | Monaco 0.56 DiffEditor | 56.0 ms | 16.5 ms | 16.6 ms | 17.5 ms | 16.6 ms | 1,373 |
| | CodeMirror 6 MergeView | 31.0 ms | 17.0 ms | 16.7 ms | 17.8 ms | 14.9 ms | 834 |
| | Pierre 1.3.1 editable diff | 606.2 ms | 300.1 ms | 16.7 ms | 18.7 ms | 15.2 ms | 11,959 |
| 1,000 lines, split | Shikitor diff before | 168.5 ms | 540.2 ms | 358.2 ms | 382.9 ms | 25.3 ms | 53,574 |
| | **Shikitor diff after** | **149.3 ms** | **89.1 ms** | **33.3 ms** | **43.0 ms** | **17.2 ms** | **29,153** |
| | Monaco 0.56 DiffEditor | 52.7 ms | 17.0 ms | 16.7 ms | 17.6 ms | 15.2 ms | 642 |
| | CodeMirror 6 MergeView | 27.5 ms | 15.0 ms | 16.4 ms | 18.0 ms | 15.1 ms | 753 |
| | Pierre 1.3.1 editable diff | 643.0 ms | 325.3 ms | 16.6 ms | 17.7 ms | 16.7 ms | 21,286 |
| 5,000 lines, unified | Shikitor diff before | 10,661 ms | 17,169 ms | 19,399 ms | 20,267 ms | 88.1 ms | 398,210 |
| | **Shikitor diff after** | **422.7 ms** | **477.7 ms** | **159.3 ms** | **234.4 ms** | **40.0 ms** | **285,482** |
| | Monaco 0.56 DiffEditor | 80.0 ms | 16.9 ms | 16.6 ms | 36.1 ms | 15.7 ms | 4,543 |
| | CodeMirror 6 MergeView | 72.4 ms | 56.0 ms | 16.6 ms | 17.8 ms | 15.5 ms | 834 |
| | Pierre 1.3.1 editable diff | 2,496 ms | 1,365 ms | 16.7 ms | 463.1 ms | 16.6 ms | 60,359 |

Those rows measured the incremental projection with every line still
carrying token DOM. The final state — lazy line materialization, scoped
caret and scroll variables, in-place keystroke patches with skipped plugin
passes, incremental diff decoration and model updates, windowed widget
content, and focused edits applied through the editing engine — measured
with the same harness:

| Configuration | Engine | Cold mount | Warm mount | Edit P50 | Edit P95 | Scroll | DOM elements | Memory Δ |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 lines, unified | **Shikitor diff (final)** | **198.8 ms** | **39.5 ms** | **16.7 ms** | **24.9 ms** | **16.7 ms** | **10,904** | **23.9 MB** |
| | Monaco / CodeMirror / Pierre | 51.4 / 30.4 / 591.2 ms | 17.2 / 16.6 / 275.1 ms | 16.7 / 16.7 / 16.7 ms | 17.5 / 18.1 / 17.4 ms | 16.6 / 16.4 / 16.2 ms | 1,373 / 834 / 11,959 | 95.1 / 6.6 / 19.0 MB |
| 1,000 lines, split | **Shikitor diff (final)** | **141.8 ms** | **39.2 ms** | **16.7 ms** | **24.5 ms** | **16.8 ms** | **8,208** | **23.6 MB** |
| | Monaco / CodeMirror / Pierre | 50.6 / 28.3 / 638.7 ms | 17.6 / 16.9 / 329.9 ms | 16.7 / 16.7 / 16.6 ms | 17.8 / 17.1 / 18.3 ms | 16.6 / 15.6 / 16.4 ms | 642 / 753 / 21,286 | 83.0 / 6.2 / 22.2 MB |
| 5,000 lines, unified | **Shikitor diff (final)** | **294.1 ms** | **195.1 ms** | **25.0 ms** | **110.7 ms** | **19.6 ms** | **60,951** | **56.8 MB** |
| | Monaco / CodeMirror / Pierre | 58.6 / 73.3 / 2,472 ms | 16.4 / 55.1 / 1,337 ms | 16.6 / 16.4 / 16.7 ms | 34.2 / 18.4 / 452.7 ms | 15.8 / 16.6 / 15.8 ms | 4,543 / 834 / 60,359 | 102.5 / 10.3 / 71.2 MB |

At 1,000 lines the diff editor paints an edit and a scroll step in one frame
in both views, the same as Monaco's DiffEditor, CodeMirror's MergeView and
Pierre (edit P50 16.7 ms against a baseline of 727 ms unified and 358 ms
split), warm-mounts in ~40 ms (baseline 859/540 ms) and uses 24 MB of
application memory (Monaco 95 MB). At 5,000 lines the edit is 25 ms
(baseline 19.4 s, 776× faster; 159 ms after the first incremental round), the
scroll step 20 ms (baseline 88 ms) and the warm mount 195 ms (baseline
17.2 s). The diff editor runs its syntax work on the Worker lane
(`all-dom/worker`) like plain editors, because the token snapshot path is
used instead of the main-thread `codeToHtml` fallback. DOM counts are taken
after the benchmark's whole-document replacement, which turns a quarter of
the lines into modified rows; removed-row widgets now carry cloned code only
inside the materialized window, so the count is dominated by the gutter and
per-line placeholders (one element per line is the contract plugins keep).

What remains at 5,000 lines, per keystroke in the dev build (~33 ms):
~8 ms of style recalculation and 4 ms of layout for the few forced flushes
that plugins still need, and ~16 ms of JavaScript: the widget content
refresh loop, the diff view's key comparison and the window bookkeeping are
O(changed) but the diff model's single-line detection still scans the text
once, and context-line or structural edits take the full Myers pass. Cold
mount at 1,000 lines is dominated by lazily loading the TypeScript grammar
into the shared engine on the first instance; Pierre's cold mount includes
its own Shiki initialization.

### Edit loop after the change

CPU profile of the same dev-build edit loop as above (1,000 lines, 8
keystrokes): edit P50 fell from ~800 ms to ~17 ms. What remains per
keystroke, from the performance trace (`playground/scripts/trace-diff.mjs`):
about 4 ms of style recalculation, 2 ms of layout, 2 ms of paint and ~5 ms
of JavaScript. `codeToHtml`, `output.innerHTML`, per-row `querySelector`,
per-widget layout reads, the fold and widget sweeps, the Myers diff and the
textarea's inner-editor rebuild no longer appear on a keystroke inside a
change: a focused editor applies `setRangeText` through the browser's
editing engine, so Chrome patches its internal text instead of re-inserting
one text node and `<br>` per line.

## Acceptance criteria

- Diff demo renders unified and split views, fold placeholders, removed-row
  widgets, inline markers and hunk actions identically; typing, undo, accept
  and reject keep working.
- `npx vitest run packages/core/tests` passes; new pure-function tests cover
  line patching, token equivalence, diff view windows, widget geometry and
  fold indexes.
- Benchmark edit P50 for the 1,000-line diff improves by more than an order
  of magnitude against the baseline above on the same machine (achieved:
  one frame), and DOM count no longer scales with the document length while
  the viewport is stationary (token DOM is bounded by the viewport window).

## Risks and mitigations

- **Stale plugin decorations on kept lines:** the diff view re-keys every
  line each pass; folding and widgets still sweep all lines, so correctness
  does not depend on observer coverage.
- **Token `position:` class drift on shifted lines:** unchanged elements keep
  their token metadata classes after a line shift; nothing consumes them and
  the next tokenization of those lines refreshes them.
- **Measurement semantics of `_getCursorAbsolutePosition`:** the single-line
  measurement assumes preceding lines are plain line boxes, which holds for
  the textarea's `wrap="off"` layout; wrapped text in the caret line is still
  measured directly.
- **Benchmark environment:** numbers come from one machine and headless
  Chrome; the driver exports environment metadata with each run.
- **Remaining growth with document length:** gutter lines keep their number
  elements for every line, the fold sweep and the widget layout check still
  visit every line element when the structure changes, and context-line or
  structural edits re-run the Myers diff; all are O(n) with small constants
  and did not show in the final profiles at 5,000 lines.
