import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as T from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer()
    this.onloadend?.()
  }
}
const input = process.argv[2]
if (!input)
  throw new Error('Usage: node scripts/extract-hk-compact-details.mjs path/to/USP_Compact.obj')
const obj = new OBJLoader().parse(await fs.readFile(input, 'utf8'))
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const parts = new T.Group()
parts.name = 'HK_Imported_Details'
// Match the resized authored slide bounds in metres; retain the owner's frame and magazine.
const transform = new T.Matrix4().set(
  0.0016846,
  0,
  0,
  0.0000704,
  0,
  0.0015135,
  0,
  0.060384,
  0,
  0,
  0.0015403,
  -0.03357,
  0,
  0,
  0,
  1,
)
const material = new T.MeshStandardMaterial({ color: 0x101316, roughness: 0.52, metalness: 0.7 })
material.name = 'Dark steel'
for (const name of ['Hammer', 'Sights', 'Control_lever', 'Slide_Release']) {
  const source = obj.getObjectByName(name)
  if (!source?.isMesh) throw new Error(`Missing OBJ part: ${name}`)
  const geometry = source.geometry.clone().applyMatrix4(transform)
  if (name === 'Sights') {
    geometry.translate(0, 0.005, 0)
    const vertices = geometry.attributes.position
    for (let i = 0; i < vertices.count; i++) {
      const y = vertices.getY(i)
      // Seat both bases on the existing slide. Preserve the front blade's top
      // while extending its lower section, so the sight line stays level.
      vertices.setY(
        i,
        vertices.getZ(i) < 0
          ? 0.1314083 + ((y - 0.1314083) * (0.1314083 - 0.1233)) / (0.1314083 - 0.1264916)
          : y - 0.0005,
      )
    }
  }
  if (name === 'Hammer') geometry.translate(0, 0, 0.0016)
  geometry.normalizeNormals()
  const mesh = new T.Mesh(geometry, material)
  mesh.name = name
  mesh.userData = { source: 'user-supplied USP_Compact.obj', sourceGroup: name }
  parts.add(mesh)
}
const binary = await new GLTFExporter().parseAsync(parts, { binary: true, trs: true })
await fs.writeFile(
  path.join(root, 'assets/library/weapons/hk-compact/hk-compact.details.glb'),
  Buffer.from(binary),
)
console.log(
  'Extracted HK details:',
  parts.children.map((p) => p.name).join(', '),
  binary.byteLength,
)
