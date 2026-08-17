import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const packageRoot = resolve(import.meta.dirname, '..')
const dist = resolve(packageRoot, 'dist')
const entry = resolve(dist, 'client.js')
const files = await readdir(dist, { withFileTypes: true })
const javascriptChunks = files
  .filter(file => file.isFile() && /\.(?:c|m)?js$/u.test(file.name))
  .map(file => file.name)
  .sort()

if (javascriptChunks.length !== 1 || javascriptChunks[0] !== 'client.js') {
  throw new Error(
    `DSH client bundle must contain only dist/client.js; found: ${javascriptChunks.join(', ') || '(none)'}`,
  )
}

const source = await readFile(entry, 'utf8')
if (!source.includes('window.__ModuleLoader__.load')) {
  throw new Error('dist/client.js does not register with window.__ModuleLoader__')
}
if (/\brequire\(\s*['"]\.{1,2}\//u.test(source)) {
  throw new Error('dist/client.js contains a relative require() that DSH cannot resolve')
}
