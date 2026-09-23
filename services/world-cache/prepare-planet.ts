import { batchPlanetMeshes } from './planet-batches.js'
/** Native planet publisher: source features -> elevation -> independent terrain/building GLBs. */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import * as Lerc from 'lerc'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import {
  mapTileBounds,
  mapTileFilename,
  mapTileId,
  mapTilePath,
  mapTileSample,
} from '../../src/map-tiles.js'
import { tileCoordinate } from '../../src/geography.js'
import { validatePlanetTileSource, type PlanetTileSource } from '../../src/planet-tile.js'
import { planetTileAsset } from './planet-geometry.js'

class BlobReader {
  result: ArrayBuffer | null = null
  onloadend?: () => void
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer
      this.onloadend?.()
    })
  }
}
Object.assign(globalThis, { FileReader: BlobReader })
const [input, output, elevationBase] = process.argv.slice(2)
if (!input || !output)
  throw Error('Usage: prepare-planet.js source.json output-root [elevation-base]')
const inputBytes = await readFile(input)
if (inputBytes.byteLength > 64 * 1024 * 1024) throw Error('Oversized planet source')
const source = JSON.parse(inputBytes.toString('utf8')) as PlanetTileSource
// All structural checks run before any network access. An empty elevation array is
// the explicit request to fetch heights, never a flat-ground fallback.
const segments = source.elevation?.segments
const pending = Array.isArray(source.elevation?.heights) && source.elevation.heights.length === 0
if (pending) {
  if (![32, 64, 128].includes(segments)) throw Error('Invalid elevation sample count')
  validatePlanetTileSource({
    ...source,
    elevation: { ...source.elevation, heights: Array((segments + 1) ** 2).fill(0) },
  })
  if (!elevationBase || !/^https?:\/\//.test(elevationBase))
    throw Error('Elevation provider required')
  const require = createRequire(import.meta.url)
  await Lerc.load({ locateFile: () => require.resolve('lerc/lerc-wasm.wasm') })
  // A single provider zoom for all three detail levels makes shared samples identical.
  const zoom = 12
  const rasters = new Map<string, Lerc.LercData>()
  source.elevation.heights = []
  for (let row = 0; row <= segments; row++)
    for (let col = 0; col <= segments; col++) {
      const geo = mapTileSample(source.tile, col, row, segments)
      const p = tileCoordinate(geo.latitude, geo.longitude, zoom)
      const n = 2 ** zoom
      const x = ((Math.floor(p.x) % n) + n) % n
      const y = Math.max(0, Math.min(n - 1, Math.floor(p.y)))
      const key = `${zoom}/${y}/${x}`
      if (!rasters.has(key)) {
        const response = await fetch(`${elevationBase.replace(/\/$/, '')}/${key}`, {
          signal: AbortSignal.timeout(60000),
        })
        if (!response.ok) throw Error(`Elevation HTTP ${response.status}`)
        const bytes = await response.arrayBuffer()
        if (bytes.byteLength > 16 * 1024 * 1024) throw Error('Oversized elevation raster')
        rasters.set(key, Lerc.decode(bytes))
      }
      const d = rasters.get(key)!
      const u = (p.x - Math.floor(p.x)) * (d.width - 1)
      const v = Math.max(0, Math.min(1, p.y - y)) * (d.height - 1)
      const ix = Math.floor(u),
        iy = Math.floor(v),
        fx = u - ix,
        fy = v - iy
      const pixel = (dx: number, dy: number) => {
        const i = Math.min(d.height - 1, iy + dy) * d.width + Math.min(d.width - 1, ix + dx)
        const h = d.pixels[0][i]
        if ((d.mask && !d.mask[i]) || !Number.isFinite(h) || h === d.noDataValues?.[0])
          throw Error('Incomplete elevation')
        return h
      }
      source.elevation.heights.push(
        (1 - fx) * (1 - fy) * pixel(0, 0) +
          fx * (1 - fy) * pixel(1, 0) +
          (1 - fx) * fy * pixel(0, 1) +
          fx * fy * pixel(1, 1),
      )
    }
}
validatePlanetTileSource(source)
const { root, frame } = planetTileAsset(source)
batchPlanetMeshes(root)
const directory = join(output, mapTilePath(source.tile))
await mkdir(directory, { recursive: true })
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
async function publish(name: string, data: Uint8Array | string) {
  const temporary = join(directory, `.${name}.${process.pid}.tmp`)
  try {
    await writeFile(temporary, data, { mode: 0o644 })
    await rename(temporary, join(directory, name))
  } finally {
    await unlink(temporary).catch(() => {})
  }
}
const files: Record<string, { path: string; download: string; sha256: string; bytes: number }> = {}
try {
  for (const name of ['terrain', 'buildings-osm'] as const) {
    const layer = root.clone(true)
    for (const child of [...layer.children])
      if ((child.name === 'Buildings') !== (name === 'buildings-osm')) layer.remove(child)
    const bytes = new Uint8Array(
      (await new GLTFExporter().parseAsync(layer, { binary: true })) as ArrayBuffer,
    )
    if (bytes.byteLength > 64 * 1024 * 1024) throw Error('Planet GLB exceeds budget')
    const hash = sha(bytes)
    const path = `${name}-${hash.slice(0, 16)}.glb`
    await publish(path, bytes)
    files[name] = {
      path,
      download: mapTileFilename(source.tile, name),
      sha256: hash,
      bytes: bytes.byteLength,
    }
  }
  const json = JSON.stringify(source)
  const sourceHash = sha(json)
  const sourcePath = `source-${sourceHash.slice(0, 16)}.json`
  await publish(sourcePath, json)
  // The manifest is the commit point. Readers never observe half a revision.
  await publish(
    'manifest.json',
    JSON.stringify(
      {
        format: 'nabla-planet-tile-v1',
        id: mapTileId(source.tile),
        tile: source.tile,
        bounds: mapTileBounds(source.tile),
        anchor: frame.anchor,
        units: 'metres',
        axes: '+X east, +Y up, +Z south',
        generator: 'native-xyz-v2',
        retrievedAt: source.retrievedAt,
        source: { path: sourcePath, sha256: sourceHash },
        files,
        collision: 'render-triangle-prisms-v1',
        attribution: '© OpenStreetMap contributors; elevation: Esri',
      },
      null,
      2,
    ),
  )
  console.log(JSON.stringify({ id: mapTileId(source.tile), directory, files }))
} finally {
  root.traverse((node) => {
    const mesh = node as import('three').Mesh
    if (!mesh.isMesh) return
    mesh.geometry.dispose()
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      material.dispose()
  })
}
