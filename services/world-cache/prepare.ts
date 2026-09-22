/** Server CLI: uses the same scene and mesh generation as the map worker. */
import { readFile, mkdir, rename, writeFile, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'
import * as Lerc from 'lerc'
import { createRealWorld, type WorldExtract } from '../../src/real-world.js'
import { tileCoordinate, EARTH_RADIUS } from '../../src/geography.js'
import { prepareMapGeometry } from '../../playground/map-geometry.js'
const [input, output, key, base] = process.argv.slice(2)
if (!input || !output || !/^-?\d+_-?\d+$/.test(key) || !base)
  throw Error('Expected input output key cache-base')
const extract = JSON.parse(await readFile(input, 'utf8')) as WorldExtract
const origin = extract.origin
const [ox, oz] = key.split('_').map((n) => Number(n) * 1200)
const require = createRequire(import.meta.url)
await Lerc.load({ locateFile: () => require.resolve('lerc/lerc-wasm.wasm') })
const samples = Array.from({ length: 14641 }, (_, i) => {
  const x = ox + (i % 121) * 10 - 600,
    z = oz + Math.floor(i / 121) * 10 - 600
  return tileCoordinate(
    origin.latitude - ((z / EARTH_RADIUS) * 180) / Math.PI,
    origin.longitude +
      ((x / (EARTH_RADIUS * Math.cos((origin.latitude * Math.PI) / 180))) * 180) / Math.PI,
    12,
  )
})
const rasters = new Map<string, Lerc.LercData>()
for (const sample of samples) {
  const x = Math.floor(sample.x),
    y = Math.floor(sample.y),
    id = `${x}/${y}`
  if (rasters.has(id)) continue
  const response = await fetch(`${base}/elevation/12/${y}/${x}`, {
    signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) throw Error(`Elevation HTTP ${response.status}`)
  rasters.set(id, Lerc.decode(await response.arrayBuffer()))
}
extract.terrain.heights = samples.map((p) => {
  const d = rasters.get(`${Math.floor(p.x)}/${Math.floor(p.y)}`)!
  const u = (p.x % 1) * (d.width - 1),
    v = (p.y % 1) * (d.height - 1),
    x = Math.floor(u),
    y = Math.floor(v),
    fx = u - x,
    fz = v - y
  const pixel = (dx: number, dz: number) => {
    const i = Math.min(d.height - 1, y + dz) * d.width + Math.min(d.width - 1, x + dx),
      n = d.pixels[0][i]
    if ((d.mask && !d.mask[i]) || !Number.isFinite(n) || n === d.noDataValues?.[0])
      throw Error('Incomplete elevation')
    return n
  }
  return (
    Math.round(
      ((1 - fx) * (1 - fz) * pixel(0, 0) +
        fx * (1 - fz) * pixel(1, 0) +
        (1 - fx) * fz * pixel(0, 1) +
        fx * fz * pixel(1, 1) -
        origin.altitude) *
        1000,
    ) / 1000
  )
})
const entities = createRealWorld(extract, { offset: [ox, oz], tileId: key }).entities.filter(
  (e) => e.kind !== 'spawn' && e.kind !== 'vehicle',
)
const geometry = prepareMapGeometry(entities)
const encode = (a: Float32Array | Uint32Array) =>
  Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64')
const wire = Object.fromEntries(
  Object.entries(geometry).map(([id, g]) => [
    id,
    {
      position: encode(g.position),
      normal: encode(g.normal),
      ...(g.index ? { index: encode(g.index) } : {}),
      ...(g.color ? { color: encode(g.color) } : {}),
    },
  ]),
)
const result = JSON.stringify({
  version: 5,
  origin,
  key,
  retrievedAt: extract.source.retrievedAt,
  entities,
  geometry: wire,
})
if (Buffer.byteLength(result) > 48 * 1024 * 1024) throw Error('Prepared zone exceeds size limit')
await mkdir(dirname(output), { recursive: true })
const temporary = `${output}.${process.pid}.tmp`
try {
  await writeFile(temporary, result, { mode: 0o644 })
  await rename(temporary, output)
} finally {
  await unlink(temporary).catch(() => {})
}
console.log(JSON.stringify({ entities: entities.length, bytes: Buffer.byteLength(result) }))
