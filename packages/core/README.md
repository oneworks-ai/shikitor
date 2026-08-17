# Shikitor Core

The core of Shikitor, a simple and lightweight editor by [Shiki](https://shiki.matsu.io/).

![img.png](.resource/img.png)

## What is Shikitor?

A simple and lightweight editor based on [Shiki](https://shiki.matsu.io/), which extends your textarea elements, provides a series of configurable options and plugins, allows you to break free from the limitations of the browser's native API to achieve more functions, and even becomes a tool like Monaco.

## Installation

```bash
npm install @shikitor/core
# If you are using pnpm
pnpm install @shikitor/core
```

## Mounting

`create()` accepts either a container or an existing textarea:

```ts
import { create } from '@shikitor/core'

const textarea = document.querySelector('textarea')!
const editor = await create(textarea, {
  language: 'markdown',
  onChange(value) {
    updateHostDraft(value)
  },
})
```

When passed a textarea, Shikitor keeps that exact element as the input and
adds only a sibling rendering layer. The host remains responsible for the
textarea value, attributes and event handlers. Disposing the editor removes
the rendering layer and restores the host DOM:

```ts
editor[Symbol.dispose]()
```

Use `editor.inputElement` when a plugin needs the active textarea; it works for
both container-created and host-owned inputs.

## Rendering modes

`renderMode` selects how syntax tokens are painted:

- `auto` (default) uses `less-dom` when the browser can paint a compact
  viewport. It paints the textarea with OpaqueRange when available, otherwise
  it prefers a viewport-sized canvas. A single mirrored text-node range bridge
  and SVG paint remain compatibility fallbacks. It falls back to `all-dom`
  when an active plugin, decoration, or inline replacement needs projected
  elements.
- `less-dom` represents token colors with ranges instead of token elements.
  OpaqueRange keeps the textarea as the only text surface; the compatibility
  bridge adds one mirrored text node, and viewport paint adds at most one node.
  Neither creates per-token or per-line elements.
- `all-dom` uses ordinary token elements for every visible line, with an
  overscanned viewport instead of a document-sized token tree. Features that
  own projected line DOM (plugins, decorations, and inline replacements) keep
  the complete compatibility projection until they support virtual islands.

The effective strategy is published as `data-shikitor-render-mode` on the `.shikitor`
root. Requesting `less-dom` is capability-safe: unsupported browsers use
`all-dom` without changing the editor value or interaction model.

Editor instances on the same page share one lazily loaded Shiki highlighter.
Documents up to 128 lines and 32 KiB stay on the main thread to avoid worker
startup and serialization costs. Larger documents use the supplied syntax
worker, publish the first grammar-state block, and finish the remaining blocks
in the background. Later edits restart from the nearest cached checkpoint. The
selected lane is published as `data-shikitor-syntax-lane` on the editor root.

In `less-dom`, interaction readiness is independent from syntax readiness.
Mounts and edits synchronously expose a readable plaintext viewport backed by
the native textarea; the latest asynchronous token snapshot replaces it when
ready. Stale token jobs never commit, so a slow highlight pass cannot overwrite
newer input.

### Syntax worker

Hosts can move grammar initialization and tokenization off the main thread by
passing a shared syntax worker through the non-reactive create options. The
worker is optional; Shikitor automatically keeps the main-thread highlighter as
a compatibility fallback.

```ts
import {
  create,
  createShikitorSyntaxWorker,
  prepareShikitorSyntax
} from '@shikitor/core'
import TokenizationWorker from '@shikitor/core/workers/tokenization?worker'

const syntaxWorker = createShikitorSyntaxWorker(new TokenizationWorker())
await Promise.all([
  prepareShikitorSyntax({ language: 'typescript', theme: 'github-light' }),
  syntaxWorker.preload('github-light', 'typescript')
])

const editor = await create(element, {
  language: 'typescript',
  theme: 'github-light',
  value: source
}, { syntaxWorker })

// Dispose editors first, then terminate the shared worker with:
syntaxWorker.dispose()
```

Both preparation calls perform a representative token pass. Schedule them
during an idle or route-prefetch window when startup latency matters. Pass
`prewarm: false` to `prepareShikitorSyntax` when only resetting shared state;
normal cold mounts load the required grammar on demand.

The `?worker` suffix above is Vite syntax; use the equivalent Worker entry
loader from your bundler. A worker service may be shared by many editors. It
keeps an eight-entry, 16 MB LRU of exact token snapshots, sends only the first
viewport or changed suffix across the worker boundary, and preserves the
original textarea value as the authoritative document.

## Plugins

The plugin runtime is powered by [Cordis](https://github.com/cordiverse/cordis). Define native Cordis plugins with `definePlugin()`, inject the editor as `ctx.shikitor`, and listen to editor lifecycle events through the `shikitor/*` namespace. The editor context is available as `shikitor.context` for dynamic plugin installation, services, nested plugins, and effect cleanup.

Plugins that require configuration are passed as `[plugin, config]` tuples in `ShikitorOptions.plugins`.

### Inline replacements

Use the inline-replacements plugin when a source range should render as a wider
icon or image slot without changing the textarea value. The plugin maps pointer
hits, the visual caret, and selection rectangles to the replacement width, so
copy and submitted values continue to use the original source text.

```ts
import { create } from '@shikitor/core'
import inlineReplacements from '@shikitor/core/plugins/inline-replacements'

await create(document.querySelector('#editor')!, {
  value: '#frontend-review',
  plugins: [inlineReplacements],
  inlineReplacements: [{
    start: 0,
    end: 1,
    inlineSize: '1em',
    properties: {
      class: 'session-icon',
      'data-icon': 'preview'
    }
  }]
})
```

The wrapper receives `.shikitor-inline-replacement`; use the supplied class,
data attributes, and a pseudo-element or background image to draw the visual.
Set `interaction: 'atomic'` when the complete source range should behave as one
editing unit: pointer hits, caret movement, Shift selection, and deletion then
stop only at the range boundaries. The default `mapped` interaction preserves
source-level caret stops. `blockSize` can be set separately when a replacement
is wider than it is tall.

### Editable diffs

The diff plugin keeps the editor `value` as the authoritative working copy and
projects a separate `original` baseline into unified or split review rows.
Deleted rows never enter the textarea, so normal typing, selection, clipboard,
undo, syntax highlighting, and other Shikitor plugins continue to operate on
the working copy.

```ts
import { create } from '@shikitor/core'
import diffPlugin from '@shikitor/core/plugins/diff'
import '@shikitor/core/plugins/diff.css'

const editor = await create(document.querySelector('#editor')!, {
  value: 'export const mode = "split"',
  language: 'typescript',
  plugins: [[diffPlugin, {
    original: 'export const mode = "unified"',
    view: 'split',
    inline: 'word',
    hunkActions: true,
    collapseUnchanged: { context: 2, minimum: 6 }
  }]]
})

const diff = editor.context.shikitorDiff
diff.setView('unified')
await diff.rejectHunk(diff.model.hunks[0].id)
```

`inline` accepts `word`, `character`, or `none`. The controller exposes the
current model and statistics, `setOriginal()`, `setView()`, `acceptHunk()`,
`rejectHunk()`, `acceptAll()`, and `rejectAll()`. Accepting updates the in-memory
baseline; rejecting edits the working copy through Shikitor. Persistence to a
file, Git index, or remote review system remains the host application's
responsibility.

Set `collapseUnchanged` to `true` or provide `{ context, minimum, label }` to
replace long unchanged ranges with an expandable context row. The textarea
still retains the complete working-copy source, while pointer, keyboard,
selection, and scroll geometry follow the folded visual document.
