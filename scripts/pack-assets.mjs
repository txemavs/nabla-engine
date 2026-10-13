import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

// Independent lossless blocks preserve authored rigs, extras, vertex precision and textures.
export async function packAssets(root, output) {
  const files = (await readdir(root, { recursive: true }))
    .filter((file) => file.endsWith('.glb'))
    .sort()
  const entries = {}
  const blocks = []
  let offset = 0
  let originalBytes = 0
  for (const file of files) {
    const source = await readFile(path.join(root, file))
    const compressed = gzipSync(source, { level: 9 })
    if (!gunzipSync(compressed).equals(source)) throw new Error(`Pack verification failed: ${file}`)
    entries['/library/' + file.split(path.sep).join('/')] = {
      offset,
      length: compressed.length,
      decodedLength: source.length,
      sha256: createHash('sha256').update(source).digest('hex'),
    }
    blocks.push(compressed)
    offset += compressed.length
    originalBytes += source.length
  }
  const bytes = Buffer.concat(blocks)
  const hash = createHash('sha256').update(bytes).digest('hex')
  const filename = `assets.${hash.slice(0, 20)}.pak`
  await mkdir(output, { recursive: true })
  await writeFile(path.join(output, filename), bytes)
  await writeFile(
    path.join(output, 'index.json'),
    JSON.stringify({ version: 1, url: `/packs/${filename}`, size: bytes.length, entries }),
  )
  return { files: files.length, originalBytes, packedBytes: bytes.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  console.log(await packAssets(path.join(root, 'assets/library'), path.join(root, 'assets/packs')))
}
