/** Standalone experiment: preserve production artifacts and export an editable GLB sidecar. */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
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
