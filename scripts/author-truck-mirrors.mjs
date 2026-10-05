/** Split the stock tractor's existing planar lenses into GLB-authored mirror mounts.
 * This asset migration preserves the housing and lens silhouette; it is not a runtime fitter.
 */
import fs from 'node:fs'
import { Box3, Matrix4, Quaternion, Vector3 } from 'three'
import { readGlbDocument } from './lib/vehicle-rig.mjs'

const file = 'assets/library/trucks/white-truck/assets/tractor.modern.glb'
const source = fs.readFileSync(file)
const doc = readGlbDocument(source)
if (doc.nodes.some((node) => node.extras?.nabla?.anchor === 'mirror.left')) {
  console.log('Truck mirror anchors already authored')
  process.exit(0)
}
const chunks = [source.subarray(28 + source.readUInt32LE(12))]
let length = chunks[0].length
/** Read this uncompressed stock asset's numeric accessor, respecting interleaving. */
function read(index) {
  const a = doc.accessors[index],
    view = doc.bufferViews[a.bufferView]
  const size = { SCALAR: 1, VEC3: 3 }[a.type]
  const bytes = { 5126: 4, 5125: 4, 5123: 2 }[a.componentType]
  const method = { 5126: 'readFloatLE', 5125: 'readUInt32LE', 5123: 'readUInt16LE' }[
    a.componentType
  ]
  return Array.from({ length: a.count }, (_, i) =>
    Array.from({ length: size }, (_, c) =>
      chunks[0][method](
        (view.byteOffset ?? 0) +
          (a.byteOffset ?? 0) +
          i * (view.byteStride ?? size * bytes) +
          c * bytes,
      ),
    ),
  )
}
/** Append an aligned accessor without rewriting existing mesh buffers. */
function append(values, type, integer = false) {
  const array = integer ? new Uint32Array(values.flat()) : new Float32Array(values.flat())
  const buffer = Buffer.from(array.buffer)
  const padding = (4 - (length % 4)) % 4
  chunks.push(Buffer.alloc(padding), buffer)
  length += padding
  const bufferView = doc.bufferViews.length
  doc.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: buffer.length })
  length += buffer.length
  const size = type === 'SCALAR' ? 1 : 3
  doc.accessors.push({
    bufferView,
    componentType: integer ? 5125 : 5126,
    type,
    count: array.length / size,
    min: Array.from({ length: size }, (_, c) =>
      Math.min(...values.map((v) => (Array.isArray(v) ? v[c] : v))),
    ),
    max: Array.from({ length: size }, (_, c) =>
      Math.max(...values.map((v) => (Array.isArray(v) ? v[c] : v))),
    ),
  })
  return doc.accessors.length - 1
}
for (const [side, meshIndex, sign] of [
  ['left', 6, -1],
  ['right', 9, 1],
]) {
  const owner = doc.nodes.find((node) => node.mesh === meshIndex)
  const primitive = doc.meshes[meshIndex].primitives[0]
  const positions = read(primitive.attributes.POSITION).map((p) => new Vector3(...p))
  const indices = read(primitive.indices).flat()
  // The large rear-facing planar polygon is the glass; curved rim triangles stay in place.
  const expected = new Vector3(-sign * 0.374114, -0.113982, 0.920352).normalize()
  const lens = [],
    housing = []
  for (let i = 0; i < indices.length; i += 3) {
    const ids = indices.slice(i, i + 3)
    const [a, b, c] = ids.map((id) => positions[id])
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize()
    const inHousing = ids.every((id) => Math.abs(positions[id].x) > 1.24 && positions[id].y > 1.08)
    ;(inHousing && normal.dot(expected) > 0.99999 ? lens : housing).push(...ids)
  }
  if (lens.length < 6) throw new Error(`Missing ${side} lens`)
  const vertices = [...new Set(lens)]
  const centre = new Box3()
    .setFromPoints(vertices.map((id) => positions[id]))
    .getCenter(new Vector3())
  const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), expected)
  const inverse = new Matrix4().compose(centre, rotation, new Vector3(1, 1, 1)).invert()
  const local = vertices.map((id) => positions[id].clone().applyMatrix4(inverse))
  // Keep the source contour but flatten tiny export round-off into one optical plane.
  const depth = local.reduce((sum, p) => sum + p.z, 0) / local.length
  centre.addScaledVector(expected, depth)
  const position = append(
    local.map((p) => [p.x, p.y, 0]),
    'VEC3',
  )
  const normal = append(
    local.map(() => [0, 0, 1]),
    'VEC3',
  )
  const index = append(
    lens.map((id) => vertices.indexOf(id)),
    'SCALAR',
    true,
  )
  primitive.indices = append(housing, 'SCALAR', true)
  const material = doc.materials.length
  doc.materials.push({
    name: `Mirror glass ${side}`,
    pbrMetallicRoughness: {
      baseColorFactor: [0.32, 0.36, 0.4, 1],
      metallicFactor: 1,
      roughnessFactor: 0.05,
    },
  })
  const mesh = doc.meshes.length
  doc.meshes.push({
    name: `Mirror lens ${side}`,
    primitives: [
      {
        attributes: { POSITION: position, NORMAL: normal },
        indices: index,
        material,
      },
    ],
  })
  const anchor = doc.nodes.length
  doc.nodes.push({
    name: `nabla.mirror.${side}`,
    translation: centre.toArray(),
    rotation: rotation.toArray(),
    extras: { nabla: { anchor: `mirror.${side}` } },
    children: [anchor + 1],
  })
  doc.nodes.push({ name: `Mirror_lens_${side}`, mesh, extras: { nabla: { mirror: side } } })
  ;(owner.children ??= []).push(anchor)
  console.log(`${side}: ${lens.length / 3} lens triangles, authored at ${centre.toArray()}`)
}
doc.buffers[0].byteLength = length
const json = Buffer.from(JSON.stringify(doc))
const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)])
const binary = Buffer.concat(chunks)
const header = Buffer.alloc(20),
  binHeader = Buffer.alloc(8)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(28 + padded.length + binary.length, 8)
header.writeUInt32LE(padded.length, 12)
header.writeUInt32LE(0x4e4f534a, 16)
binHeader.writeUInt32LE(binary.length, 0)
binHeader.writeUInt32LE(0x004e4942, 4)
fs.writeFileSync(file, Buffer.concat([header, padded, binHeader, binary]))
