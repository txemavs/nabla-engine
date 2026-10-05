import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readVehiclePresetSources } from '../dist/catalog/vehicles/preset-source.js'
import { readWeaponPresetSources } from '../dist/catalog/weapons/weapon-source.js'

// TypeScript emits worker modules as .js but preserves URL string literals.
// The source keeps .ts for Vite; distributed consumers must resolve emitted files.
const root = new URL('../dist/', import.meta.url)
for (const entry of fs.readdirSync(root, { recursive: true })) {
  if (!entry.endsWith('.js')) continue
  const url = new URL(entry.split(path.sep).join('/'), root)
  const source = fs.readFileSync(url, 'utf8')
  const output = source.replace(
    /new URL\((['"])(\.\/[^'"]+)\.ts\1, import\.meta\.url\)/g,
    'new URL($1$2.js$1, import.meta.url)',
  )
  if (output !== source) fs.writeFileSync(url, output)
}

// Package consumers cannot rely on source-tree Vite globs inside node_modules.
// Ship stock catalog data as ordinary ESM, without local custom files or absolute paths.
const packageRoot = fileURLToPath(new URL('../', import.meta.url))
for (const [file, name, sources] of [
  [
    'catalog/vehicles/preset-source.browser.js',
    'readVehiclePresetSources',
    readVehiclePresetSources(),
  ],
  [
    'catalog/weapons/weapon-source.browser.js',
    'readWeaponPresetSources',
    readWeaponPresetSources(),
  ],
]) {
  const stock = sources
    .map((source) => ({
      ...source,
      file: path.relative(packageRoot, source.file).split(path.sep).join('/'),
    }))
    .filter((source) => source.file.startsWith('assets/library/'))
  fs.writeFileSync(
    new URL(file, root),
    `// Generated stock catalog. Do not edit.\nexport function ${name}() { return ${JSON.stringify(stock)} }\n`,
  )
}
