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
const tile = decoded as unknown as TileArtifact
const files: Record<string, string> = {}
const hashes: Record<string, string> = {}
for (const [name, buildings] of [
  ['terrain', false],
  ['buildings-osm', true],
] as const) {
  const layer = root.clone(true)
  for (const child of [...layer.children])
    if ((child.name === 'Buildings') !== buildings) layer.remove(child)
  const binary = await new GLTFExporter().parseAsync(layer, { binary: true })
  const filename = name + '.glb'
  await writeFile(output + '/' + filename, new Uint8Array(binary as ArrayBuffer))
  files[name] = filename
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
await writeFile(
  output + '/manifest.json',
  JSON.stringify({
    format: 'nabla-tile-glb-v1',
    id,
    version: tile.version,
    origin: tile.origin,
    key: tile.key,
    sizeMetres: 1200,
    files,
    hashes,
    entities: tile.entities,
    geometryIds: Object.keys(tile.geometry),
    emptyGeometryIds: Object.entries(tile.geometry)
      .filter(([, g]) => g.position.byteLength === 0)
      .map(([id]) => id),
  }),
)
