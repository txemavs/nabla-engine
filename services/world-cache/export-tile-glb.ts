import { compactGround } from './compact-ground.js'
/** Standalone experiment: preserve production artifacts and export an editable GLB sidecar. */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { decodePreparedBinary } from '../../src/prepared-binary.js'
import { tileAsset, type TileArtifact } from '../../playground/tile-asset.js'

// Exporter only needs asynchronous Blob -> ArrayBuffer for this texture-free binary export.
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
const [input, output] = process.argv.slice(2)
if (!input || !output) throw Error('Usage: export-tile-glb.js <prepared.bin> <output-directory>')
const source = await readFile(input)
const started = performance.now()
const decoded = decodePreparedBinary(
  source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
)
const root = tileAsset(decoded as unknown as TileArtifact)
const builtMs = performance.now() - started
const glb = (await new GLTFExporter().parseAsync(root, {
  binary: true,
  onlyVisible: true,
  copyright: '© OpenStreetMap contributors; elevation: Esri',
})) as ArrayBuffer
let meshes = 0,
  vertices = 0,
  triangles = 0
root.traverse((object) => {
  if ('isMesh' in object && object.isMesh) {
    const mesh = object as import('three').Mesh
    meshes++
    vertices += mesh.geometry.getAttribute('position').count
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3
  }
})
const report = {
  tile: root.userData.nablaTile,
  meshes,
  vertices,
  triangles,
  preparedBytes: source.byteLength,
  glbBytes: glb.byteLength,
  preparedGzipBytes: gzipSync(source).byteLength,
  glbGzipBytes: gzipSync(new Uint8Array(glb)).byteLength,
  serverBuildMs: builtMs,
  serverExportMs: performance.now() - started - builtMs,
  scope: 'Same render geometry, no LOD or physics. Browser timings are measured separately.',
}
await mkdir(output, { recursive: true })
await writeFile(`${output}/tile.glb`, new Uint8Array(glb))
await writeFile(`${output}/source.bin`, source)
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))

// Keep the combined pilot for comparison; production consumes independent layers.
const originalTile = decoded as unknown as TileArtifact
const tile = compactGround(originalTile, 0.1)
const files: Record<string, string> = {}
const hashes: Record<string, string> = {}
const byteLengths: Record<string, number> = {}
for (const [name, buildings] of [
  ['terrain', false],
  ['buildings-osm', true],
] as const) {
  const layer = buildings ? root.clone(true) : tileAsset(tile)
  for (const child of [...layer.children])
    if ((child.name === 'Buildings') !== buildings) layer.remove(child)
  const binary = await new GLTFExporter().parseAsync(layer, { binary: true })
  const filename = name + '.glb'
  await writeFile(output + '/' + filename, new Uint8Array(binary as ArrayBuffer))
  files[name] = filename
  byteLengths[name] = (binary as ArrayBuffer).byteLength
  hashes[name] = createHash('sha256')
    .update(new Uint8Array(binary as ArrayBuffer))
    .digest('hex')
}
const id = [
  'nabla-local-v1',
  1200,
  tile.origin.latitude.toFixed(6),
  tile.origin.longitude.toFixed(6),
  tile.origin.altitude.toFixed(3),
  tile.key,
].join('/')
const [cellX, cellZ] = tile.key.split('_').map(Number)
const latitude = tile.origin.latitude - (((cellZ * 1200) / 6371000) * 180) / Math.PI
const longitude =
  tile.origin.longitude +
  (((cellX * 1200) / (6371000 * Math.cos((tile.origin.latitude * Math.PI) / 180))) * 180) / Math.PI
const coordinate = (n: number, positive: string, negative: string) =>
  (n < 0 ? negative : positive) + Math.abs(n).toFixed(6)
const stableId = createHash('sha256').update(id).digest('hex').slice(0, 16)
const stem = `nabla-earth-${coordinate(latitude, 'N', 'S')}-${coordinate(longitude, 'E', 'W')}-${stableId}`
const downloads = {
  terrain: stem + '-terrain-10cm.glb',
  'buildings-osm': stem + '-buildings-osm.glb',
}
await writeFile(
  output + '/manifest.json',
  JSON.stringify({
    format: 'nabla-tile-glb-v1',
    id,
    version: tile.version,
    origin: tile.origin,
    key: tile.key,
    sizeMetres: 1200,
    groundGridMetres: 0.1,
    groundRevision: 4,
    groundQuantization: 'horizontal-only-preserve-elevation',
    downloads,
    files,
    hashes,
    byteLengths,
    entities: tile.entities,
    geometryIds: Object.keys(tile.geometry),
    emptyGeometryIds: Object.entries(tile.geometry)
      .filter(([, g]) => g.position.byteLength === 0)
      .map(([id]) => id),
  }),
)

// Experimental render-only variants; do not replace near collision-aligned geometry.
const variants = []
for (const step of [0.1, 1]) {
  const compact = compactGround(originalTile, step)
  const layer = tileAsset(compact)
  for (const child of [...layer.children]) if (child.name === 'Buildings') layer.remove(child)
  const bytes = (await new GLTFExporter().parseAsync(layer, { binary: true })) as ArrayBuffer
  const filename = step === 0.1 ? 'terrain-10cm.glb' : 'terrain-1m.glb'
  await writeFile(output + '/' + filename, new Uint8Array(bytes))
  const sourceGround = Object.values(tile.geometry).reduce(
    (sum, g) => sum + g.position.byteLength,
    0,
  )
  const resultGround = Object.values(compact.geometry).reduce(
    (sum, g) => sum + g.position.byteLength,
    0,
  )
  variants.push({
    filename,
    gridMetres: step,
    bytes: bytes.byteLength,
    gzipBytes: gzipSync(new Uint8Array(bytes)).byteLength,
    sourcePositionBytes: sourceGround,
    resultPositionBytes: resultGround,
    renderOnly: true,
    automaticLod: false,
  })
}
await writeFile(output + '/variants.json', JSON.stringify(variants, null, 2))
console.log(JSON.stringify({ variants }))
