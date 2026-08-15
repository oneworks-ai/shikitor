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
