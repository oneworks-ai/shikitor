export * from './base'
export * from './context'
export { create } from './creator'
export * from './editor'
export * from './input'
export * from './plugin'
export type { PrepareShikitorSyntaxOptions } from './syntaxRuntime'
export { prepareShikitorSyntax } from './syntaxRuntime'
export type {
  ShikitorSyntaxWorker,
  ShikitorSyntaxWorkerSession,
  SyntaxWorkerPhaseProfile,
  SyntaxWorkerProfile
} from './syntaxWorker'
export {
  createShikitorSyntaxWorker
} from './syntaxWorker'

// Line projection primitives shared with plugins that decorate or mirror
// line DOM. Plugins import them from the package entry so published plugin
// bundles share one module instance with the editor core.
export {
  createTokenLine,
  createTokenLineChildren,
  LINE_PATCH_EVENT,
  VIRTUAL_LINE_ATTRIBUTE
} from './creator/controlled/allDomRenderer'
export { setCursorGeometry } from './creator/controlled/cursorGeometry'
export type { DocumentLines } from './creator/controlled/documentLines'
export { createDocumentLines } from './creator/controlled/documentLines'
export { createIncrementalHighlighter } from './creator/controlled/incrementalHighlighter'
export type { TokenizedLine, TokenSnapshot } from './creator/controlled/tokenSnapshot'
export { tokenizedLineAt } from './creator/controlled/tokenSnapshot'
