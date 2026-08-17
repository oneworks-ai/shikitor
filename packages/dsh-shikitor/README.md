# dsh-shikitor

Minimal Shikitor integration for the DeepSeek Harness web client. It contributes:

- a Shikitor rendering and plugin layer attached to DSH's native sender textarea;
- a session-backed file editor in the `conversation.view` tab ring;
- a Cordis `ctx.shikitor` service that other client plugins can extend.

The attached sender keeps DSH's command and reference pipeline as the data and
execution owner, while Shikitor renders every discovery shortcut:

- `#` lists the same sessions shown in the sidebar;
- `@` lists workspace files alongside DSH's existing Cordis plugin and
  subagent sources;
- `$` lists the session's merged skill catalog (`.agents`, `.codex`, `.claude`,
  `.oo`, and plugin providers) and inserts DSH's executable `/skill-name` form;
- `/` mirrors DSH's command and skill sources; accepting an item is routed
  back through DSH's original pick transaction so command claims and execution
  semantics remain intact.

DSH's built-in trigger menu stays mounted as the state machine behind the
adapter but is hidden while the Shikitor sender mode is active. Switching back
to the native sender restores DSH's original renderer and keyboard behavior.
The mode switch is included only in development bundles built with
`pnpm --filter dsh-shikitor build:dev`; production bundles retain a hidden DOM
anchor for textarea attachment without exposing the switch to users.

Completion menus support pointer selection, Arrow Up/Down, Enter/Tab, and
Escape. File scans are performed by the bundle's host half against the
session cwd, ignore generated dependency trees, and return a bounded catalog.
Accepted file references keep an absolute titled Markdown link as their draft
source while rendering only the filename. Cmd-click (Ctrl-click on Windows or
Linux) opens the referenced workspace file in the Shikitor editor tab.

Skill discovery covers `<projectRoot>/{.agents,.codex,.claude,.oo}/skills` and
the matching directories under the user's home. Project entries win duplicate
names from home entries. Discovery is registered through DSH's `ctx.skills`
provider interface, so `$`, `/`, model catalogs, and skill body loading share
the same entries and invocation policy.

The package is an external DSH bundle. It lives in Shikitor so DeepSeek Harness
does not need source changes. DSH continues to own the composer, textarea,
draft state, keyboard policy, sender controls and their existing extension
points; the sender contribution uses `conversation.input.right` only as its
attachment lifecycle and mode-switch entry.

## Register a surface plugin

```ts
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import mySenderPlugin from './my-sender-plugin.ts'

export const inject = ['shikitor']

export function apply(ctx: ClientContext) {
  ctx.effect(
    () => ctx.shikitor.register('sender', mySenderPlugin),
    'my-plugin: Shikitor sender contribution',
  )
}
```

Use `sender` for message-composer behavior and `editor` for file-editor behavior.
Register the same Shikitor plugin on both surfaces when they should share it.

## Register a file icon rule

```ts
export const inject = ['shikitor']

export function apply(ctx: ClientContext) {
  return ctx.shikitor.registerFileIcon({
    extensions: ['vue', 'svelte'],
    icon: 'vue-icon medium-green',
    color: '#41b883',
    priority: 100,
  })
}
```

The default filename mapping, glyphs, fonts, and colors come from
[Atom File Icons](https://github.com/file-icons/atom) through its pinned browser
adapter. Rules can match `extensions`, exact `fileNames`, or a custom `match`
function. Their `icon` may be an Atom File Icons class list or a DOM renderer.
Higher `priority` wins; equally ranked rules prefer the most recently
registered contribution. The disposer removes only that plugin's rule.

General settings also expose browser-persisted path rules. Each rule accepts a
glob (`*` within one path segment, `**` across folders) and can select any Atom
glyph or an image. Image sources may be HTTP(S)/data URLs, workspace-relative
paths, or absolute paths inside the current workspace. Workspace images are
read by the host with traversal, file-type, and 1 MiB size checks. Later user
rules win. Plugins can observe the same effective registry through
`fileIconRules`; the editable rules are exposed separately through
`configuredFileIconRules` and `configureFileIconRules()`.

The localized DSH Editor settings page uses the same tab and popup-menu
patterns as the host. Its General tab owns the shared color scheme,
highlight-theme family, cursor shape, and file-icon policy. Sender and File
editor inherit that appearance until their first surface-specific change;
`resetSurface()` removes the override and resumes live inheritance. Editor-only
line/current-line controls remain on the File editor tab. These browser-local
preferences are also available through `ctx.shikitor.appearance`,
`resolveAppearance()`, and `configureAppearance()`.

Opened files are read-only with respect to the host filesystem for now: edits
stay in the session-local browser document until a save contract is added.
