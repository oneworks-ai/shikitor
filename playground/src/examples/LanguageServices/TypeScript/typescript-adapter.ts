import type * as TypeScript from 'typescript'

import type {
  DiagnosticSeverity,
  LanguageCompletion,
  LanguageDiagnostic,
  LanguageHover,
  LanguageServiceClient,
  LanguageServiceSnapshot
} from './client'

const fileName = '/workspace/index.ts'

function displayParts(parts?: readonly TypeScript.SymbolDisplayPart[]) {
  return parts?.map(part => part.text).join('') ?? ''
}

function diagnosticSeverity(
  category: TypeScript.DiagnosticCategory,
  ts: typeof TypeScript
): DiagnosticSeverity {
  switch (category) {
    case ts.DiagnosticCategory.Error:
      return 'error'
    case ts.DiagnosticCategory.Warning:
      return 'warning'
    case ts.DiagnosticCategory.Suggestion:
      return 'hint'
    default:
      return 'info'
  }
}

export function createTypeScriptLanguageService(
  initialValue: string,
  runtime = (globalThis as typeof globalThis & { ts?: typeof TypeScript }).ts
): LanguageServiceClient {
  if (!runtime) throw new Error('The TypeScript browser runtime was not loaded')
  const ts = runtime
  let value = initialValue
  let documentVersion = 0
  let disposed = false

  const host: TypeScript.LanguageServiceHost = {
    getCompilationSettings: () => ({
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      noLib: true,
      allowNonTsExtensions: true
    }),
    getScriptFileNames: () => [fileName],
    getScriptVersion: requested => requested === fileName ? String(documentVersion) : '0',
    getScriptSnapshot: requested => requested === fileName
      ? ts.ScriptSnapshot.fromString(value)
      : undefined,
    getCurrentDirectory: () => '/workspace',
    getDefaultLibFileName: () => '/workspace/lib.d.ts',
    fileExists: requested => requested === fileName,
    readFile: requested => requested === fileName ? value : undefined,
    readDirectory: () => [],
    directoryExists: directory => directory === '/' || directory === '/workspace',
    getDirectories: () => [],
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n'
  }
  const service = ts.createLanguageService(host, ts.createDocumentRegistry())

  function assertActive() {
    if (disposed) throw new Error('TypeScript language service has been disposed')
  }

  function getDiagnostics(): LanguageDiagnostic[] {
    assertActive()
    const sourceFile = service.getProgram()?.getSourceFile(fileName)
    return [
      ...service.getSyntacticDiagnostics(fileName),
      ...service.getSemanticDiagnostics(fileName)
    ].flatMap(diagnostic => {
      if (!sourceFile || diagnostic.start === undefined) return []
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(diagnostic.start)
      return [{
        code: diagnostic.code,
        severity: diagnosticSeverity(diagnostic.category, ts),
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        start: diagnostic.start,
        length: diagnostic.length ?? 1,
        line: line + 1,
        character: character + 1
      }]
    })
  }

  function getHover(position: number): LanguageHover | undefined {
    assertActive()
    const offset = Math.max(0, Math.min(position, value.length))
    const quickInfo = service.getQuickInfoAtPosition(fileName, offset)
      ?? (offset > 0 ? service.getQuickInfoAtPosition(fileName, offset - 1) : undefined)
    if (!quickInfo) return
    return {
      start: quickInfo.textSpan.start,
      length: quickInfo.textSpan.length,
      signature: displayParts(quickInfo.displayParts),
      documentation: displayParts(quickInfo.documentation) || undefined
    }
  }

  function getCompletions(position: number, limit = 12): LanguageCompletion[] {
    assertActive()
    const offset = Math.max(0, Math.min(position, value.length))
    return service.getCompletionsAtPosition(fileName, offset, {
      includeCompletionsForModuleExports: false,
      includeCompletionsWithInsertText: true
    })?.entries.slice(0, limit).map(entry => ({
      label: entry.name,
      kind: entry.kind,
      detail: entry.kindModifiers || entry.source,
      insertText: entry.insertText
    })) ?? []
  }

  const client: LanguageServiceClient = {
    languageId: 'typescript',
    runtimeVersion: ts.version,
    updateDocument(nextValue) {
      assertActive()
      if (nextValue === value) return
      value = nextValue
      documentVersion += 1
    },
    getDiagnostics,
    getHover,
    getCompletions,
    inspect(position): LanguageServiceSnapshot {
      const completions = value[position - 1] === '.' ? getCompletions(position) : []
      return {
        diagnostics: getDiagnostics(),
        hover: getHover(position),
        completions,
        documentVersion,
        runtimeVersion: ts.version
      }
    },
    [Symbol.dispose]() {
      if (disposed) return
      disposed = true
      service.dispose()
    }
  }
  return client
}
