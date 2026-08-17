# Shikitor 1.0.0

Shikitor 1.0.0 is the first stable release of the editor workspace and its DeepSeek Harness integration.

## Highlights

- Publishes `@shikitor/core`, `@shikitor/react`, and `dsh-shikitor` together at version 1.0.0.
- Adds a reusable input/editor core with keyboard, pointer, completion, popup, selection-toolbox, code-style, bracket, and symmetry plugins.
- Adds a DSH message-sender surface with session (`#`), file and plugin (`@`), skill (`$`), and command (`/`) discovery.
- Adds a workspace file editor with a lazy file tree, breadcrumbs, syntax highlighting, configurable file icons, and automatic or manual saving.
- Exposes the Cordis `ctx.shikitor` service so DSH plugins can contribute sender/editor plugins and file-icon rules.
- Includes Simplified Chinese and English interfaces, light/dark appearance controls, and a documented public client type entry.

## Compatibility

- `dsh-shikitor` supports the DeepSeek Harness 0.1 release line from
  0.1.0-rc.5 up to, but not including, 0.2.0.
- The published packages require modern browsers; `dsh-shikitor` requires Node.js 22.19 or newer for its host side.
