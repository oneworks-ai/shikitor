export interface FileIconMatch {
  getClass(colourIndex?: number): string
}

export interface FileIconDatabase {
  matchName(name: string, directory?: boolean): FileIconMatch | null
  matchPath(path: string, directory?: boolean): FileIconMatch | null
}

export const db: FileIconDatabase
export const iconClasses: readonly string[]
export function getClass(name: string, match?: FileIconMatch | null): string | null
export function getClassWithColor(name: string, match?: FileIconMatch | null): string | null
