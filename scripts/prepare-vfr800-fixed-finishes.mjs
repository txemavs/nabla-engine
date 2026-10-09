/** Author fixed finishes into the GLB; runtime colour selection only touches tagged paint. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { readGlb, components } from './lib/glb.mjs'

const directory = 'assets/library/motorcycles/vfr800fi-1999'
const path = `${directory}/vfr800fi-1999.glb`
const { json, bin, read } = readGlb(path)
const extra = new Map()
const fixed = (name, color, metallicFactor, roughnessFactor) => {
  const found = json.materials.findIndex((m) => m.name === name)
  if (found >= 0) return found
  const index = json.materials.length
  json.materials.push({
    name,
    doubleSided: true,
    pbrMetallicRoughness: {
      baseColorFactor: [...color, 1],
      metallicFactor,
      roughnessFactor,
    },
  })
  return index
}
const black = fixed('Fixed black plastic', [0.006, 0.007, 0.009], 0, 0.65)
const grey = fixed('Fixed dark grey cockpit plastic', [0.045, 0.045, 0.045], 0, 0.8)
const radiator = fixed('Fixed grey radiator', [0.14, 0.15, 0.16], 0.65, 0.6)
const rim = fixed('Fixed black wheel finish', [0.006, 0.007, 0.009], 0.14, 0.3)
for (const mesh of json.meshes) {
  const next = []
  for (const primitive of mesh.primitives) {
    const material = json.materials[primitive.material]
    if (material.name === 'Matte black instrument panel plastic' && mesh.name === 'Body') {
      next.push({ ...primitive, material: grey })
      continue
    }
    if (material.name === 'Graphite engine cases' && mesh.name === 'Body') {
      next.push({ ...primitive, material: radiator })
      continue
    }
    if (
      mesh.name.startsWith('Wheel_') &&
      material.name === 'Satin aluminium chassis, fork and passenger footrests'
    ) {
      next.push({ ...primitive, material: rim })
      continue
    }
    if (material.name !== 'Gloss black fairing') {
      next.push(primitive)
      continue
    }
    if (mesh.name.startsWith('Wheel_')) {
      next.push({ ...primitive, material: rim })
      continue
    }
    if (mesh.name === 'Fork_Slider') {
      next.push({ ...primitive, material: black })
      continue
    }
    const groups = new Map()
    const positions = read(primitive.attributes.POSITION)
    for (const component of components(
      read(primitive.attributes.POSITION),
      read(primitive.indices).flat(),
    )) {
      let destination = primitive.material
      const centre = component.min.map((v, k) => (v + component.max[k]) / 2)
      if (mesh.name.startsWith('mirror_') && component.min[1] < 0.01) destination = black
      if (mesh.name === 'Body') {
        // Measured inner cockpit liner, rear mudguard/plate carrier and under-seat plastics.
        if (
          component.min[1] > 0.75 &&
          component.min[2] < -0.65 &&
          component.indices.length / 3 > 10000
        )
          destination = grey
        if (component.max[2] > 1.04 && component.max[1] < 0.82) destination = black
        if (centre[2] > 0.3 && component.max[1] < 0.84) destination = black
        if (centre[2] > 0.16 && centre[2] < 0.4 && component.max[1] < 0.7) destination = black
      }
      for (let i = 0; i < component.indices.length; i += 3) {
        const triangle = component.indices.slice(i, i + 3)
        // Measured recessed radiator faces, mirrored across X. Keep the outer fairing painted.
        const radiatorFace =
          mesh.name === 'Body' &&
          destination === primitive.material &&
          triangle.every((index) => {
            const [x, y, z] = positions[index]
            return (
              Math.abs(x) >= 0.17 &&
              Math.abs(x) <= 0.23 &&
              y >= 0.53 &&
              y <= 0.635 &&
              z >= -0.43 &&
              z <= -0.3
            )
          })
        const selected = radiatorFace ? radiator : destination
        const indices = groups.get(selected) ?? []
        indices.push(...triangle)
        groups.set(selected, indices)
      }
    }
    for (const [material, indices] of groups) {
      const accessor = json.accessors.length
      json.accessors.push({ type: 'SCALAR', count: indices.length })
      extra.set(
        accessor,
        indices.map((i) => [i]),
      )
      next.push({ ...primitive, material, indices: accessor })
    }
  }
  mesh.primitives = next
}
// Keep original vertex/normal/image buffers verbatim; append split index lists only.
let binary = Buffer.from(bin)
for (const [id, values] of extra) {
  binary = Buffer.concat([binary, Buffer.alloc((4 - (binary.length % 4)) % 4)])
  const data = Buffer.alloc(values.length * 4)
  values.forEach(([value], i) => data.writeUInt32LE(value, i * 4))
  const bufferView = json.bufferViews.length
  json.bufferViews.push({
    buffer: 0,
    byteOffset: binary.length,
    byteLength: data.length,
    target: 34963,
  })
  Object.assign(json.accessors[id], { bufferView, componentType: 5125 })
  binary = Buffer.concat([binary, data])
}
json.buffers[0].byteLength = binary.length
const source = Buffer.from(JSON.stringify(json))
const text = Buffer.alloc(Math.ceil(source.length / 4) * 4, 0x20)
source.copy(text)
const header = Buffer.alloc(20),
  binaryHeader = Buffer.alloc(8)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(28 + text.length + binary.length, 8)
header.writeUInt32LE(text.length, 12)
header.writeUInt32LE(0x4e4f534a, 16)
binaryHeader.writeUInt32LE(binary.length, 0)
binaryHeader.writeUInt32LE(0x004e4942, 4)
fs.writeFileSync(path, Buffer.concat([header, text, binaryHeader, binary]))
const bytes = fs.readFileSync(path)
const metadataPath = `${directory}/asset.json`
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
metadata.bytes = bytes.length
metadata.sha256 = createHash('sha256').update(bytes).digest('hex')
const edit =
  '2026-10-09 scripts/prepare-vfr800-fixed-finishes.mjs: separate fixed black mirror supports, mudguards, plate carrier and rims; dark grey cockpit plastics; fixed grey radiator. Reassign existing triangles without changing their positions.'
if (!metadata.provenance.edits.includes(edit)) metadata.provenance.edits.push(edit)
fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n')
