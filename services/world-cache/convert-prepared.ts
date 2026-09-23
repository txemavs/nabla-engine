/** Add binary sidecars to existing JSON artifacts without contacting a provider. */
import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { encodePreparedBinary } from '../../src/prepared-binary.js'
const paths = process.argv.slice(2)
if (!paths.length) throw Error('Usage: convert-prepared.js <zone.json> ...')
for (const path of paths) {
  if (!path.endsWith('.json')) throw Error('Expected .json artifact')
  const { geometry, ...metadata } = JSON.parse(await readFile(path, 'utf8'))
  if (metadata.version !== 5 || !geometry) throw Error('Expected prepared version 5')
  const buffers = Object.fromEntries(
    Object.entries(geometry as Record<string, Record<string, string>>).map(([id, fields]) => [
      id,
      Object.fromEntries(
        Object.entries(fields).map(([name, encoded]) => {
          const bytes = Buffer.from(encoded, 'base64')
          return [name, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)]
        }),
      ),
    ]),
  )
  const binary = encodePreparedBinary(metadata, buffers),
    target = path.replace(/\.json$/, '.bin'),
    temporary = `${target}.${process.pid}.tmp`
  try {
    await writeFile(temporary, new Uint8Array(binary), { mode: 0o644 })
    await rename(temporary, target)
  } finally {
    await unlink(temporary).catch(() => {})
  }
  console.log(JSON.stringify({ target, bytes: binary.byteLength }))
}
