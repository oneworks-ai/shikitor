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
