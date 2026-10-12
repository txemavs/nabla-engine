import { readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Remove only packed GLBs from the generated game, never authored sources.
const output = fileURLToPath(new URL('../game-dist/', import.meta.url))
const index = JSON.parse(await readFile(path.join(output, 'packs/index.json'), 'utf8'))
for (const url of Object.keys(index.entries)) {
  const target = path.resolve(output, '.' + url)
  if (!target.startsWith(output) || !target.endsWith('.glb')) {
    throw new Error(`Invalid packed output path: ${url}`)
  }
  await unlink(target)
}
console.log(`Published ${Object.keys(index.entries).length} GLBs inside the pack only`)
