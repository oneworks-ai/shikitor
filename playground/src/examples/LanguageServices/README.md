# Language services playground

This module keeps language intelligence separate from the Code Editor UX
examples. It is intentionally organized around a transport-neutral client and a
Cordis-managed adapter lifecycle.

## Current TypeScript demo

The browser demo uses TypeScript's real `LanguageService` API over a virtual
single-file host. TypeScript describes a language service as a long-lived
compilation context whose host owns files, versions, and `ScriptSnapshot`s. The
demo therefore updates a document version on every Shikitor change and disposes
the service with its Cordis plugin fiber.

For deterministic Vite development, the classic browser runtime is copied from
`typescript@5.4.3/lib/typescript.js` to
`playground/public/vendor/typescript-5.4.3.js`. Application code only imports
TypeScript types; the adapter reads the runtime exposed by that script. When the
dependency is upgraded, refresh this generated vendor asset from the same
installed package version.

The active chain is:

1. Shikitor owns text, cursor, and editor events.
2. A Cordis plugin owns the language-service client and exposes it as the
   `shikitorTypeScript` service.
3. The browser TypeScript adapter supplies diagnostics, hover, and completion
   results.
4. Shikitor's existing completion provider renders TypeScript completion
   entries without TypeScript-specific logic in core.

The generic boundary lives in `TypeScript/client.ts`; only
`typescript-adapter.ts` imports the TypeScript package.

## LSP relationship and future adapters

This demo is not a full Language Server Protocol transport. LSP standardizes
JSON-RPC messages between an editor/client and a language server, commonly
running in another process. The browser TypeScript adapter calls the in-process
TypeScript `LanguageService` directly so the playground can prove real language
intelligence without a server deployment.

A production adapter can keep the same `LanguageServiceClient` boundary and
replace the implementation with either:

- a Web Worker client, keeping TypeScript analysis off the UI thread;
- a JSON-RPC LSP client over WebSocket, MessagePort, or a native bridge;
- a server-side adapter that translates LSP diagnostics, hover, and completion
  responses to the playground-neutral result types.

Cordis remains responsible for capability injection, activation order, event
subscriptions, and disposal regardless of transport.

Primary references:

- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- [TypeScript: Using the Language Service API](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API)
- [TypeScript standalone server](https://github.com/microsoft/TypeScript/wiki/Standalone-Server-%28tsserver%29)
