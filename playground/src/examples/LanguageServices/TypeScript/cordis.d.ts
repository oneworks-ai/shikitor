import type {} from '@shikitor/core'

declare module 'cordis' {
  interface Context {
    shikitorTypeScript: import('./client').LanguageServiceClient
  }

  interface Events {
    'shikitor/typescript-updated'(snapshot: import('./client').LanguageServiceSnapshot): void
    'shikitor/typescript-definition'(definition: import('./client').LanguageDefinition): void
  }
}
