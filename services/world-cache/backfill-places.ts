/** Add labels to existing manifests without rebuilding or touching their GLBs. */
import { glob, readFile, writeFile, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { planetPlaces } from '../../src/planet-places.js'
import { validatePlanetTileSource } from '../../src/planet-tile.js'
const root = process.argv[2]
if (!root) throw Error('Usage: backfill-places.js prepared-root')
let updated = 0,
  skipped = 0,
  failed = 0
for await (const relative of glob('z/*/*/*/manifest.json', { cwd: root })) {
  const path = join(root, relative)
  try {
    const original = await readFile(path, 'utf8')
    const manifest = JSON.parse(original)
    if (Array.isArray(manifest.places)) {
      skipped++
      continue
    }
    if (!/^source-[a-f0-9]{16}\.json$/.test(manifest.source?.path))
      throw Error('Invalid source path')
    const bytes = await readFile(join(dirname(path), manifest.source.path))
    if (createHash('sha256').update(bytes).digest('hex') !== manifest.source.sha256)
      throw Error('Source checksum mismatch')
    const source = JSON.parse(bytes.toString('utf8'))
    validatePlanetTileSource(source)
    manifest.places = planetPlaces(source)
    if ((await readFile(path, 'utf8')) !== original) {
      skipped++
      continue
    }
    const temporary = path + '.places.tmp'
    await writeFile(temporary, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o644 })
    await rename(temporary, path)
    updated++
  } catch {
    failed++
  }
}
console.log(JSON.stringify({ updated, skipped, failed }))
if (failed) process.exitCode = 1
