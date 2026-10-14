/** Prepare the user-supplied static gloves for controller-driven finger animation.
 * Source is intentionally external; the generated character asset is application content.
 */
import fs from 'node:fs'
import * as THREE from 'three'
const input = process.argv[2]
if (!input) throw new Error('Usage: node scripts/prepare-xr-gloves.mjs source.glb')
const file = fs.readFileSync(input)
const jsonLength = file.readUInt32LE(12)
const source = JSON.parse(file.subarray(20, 20 + jsonLength))
const binary = file.subarray(28 + jsonLength)
function read(id) {
  const a = source.accessors[id],
    v = source.bufferViews[a.bufferView]
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type]
  const size = a.componentType === 5123 ? 2 : 4
  return Array.from({ length: a.count }, (_, i) =>
    Array.from({ length: width }, (_, k) => {
      const offset =
        (v.byteOffset || 0) + (a.byteOffset || 0) + i * (v.byteStride || width * size) + k * size
      return a.componentType === 5126
        ? binary.readFloatLE(offset)
        : size === 2
          ? binary.readUInt16LE(offset)
          : binary.readUInt32LE(offset)
    }),
  )
}
const primitive = source.meshes[0].primitives[0]
const positions = read(primitive.attributes.POSITION)
const normals = read(primitive.attributes.NORMAL)
const uv = read(primitive.attributes.TEXCOORD_0)
const origin = new THREE.Vector3(0.463, -0.165, 0.97)
const forward = new THREE.Vector3(0.059, -0.038, -0.1).normalize()
const across = new THREE.Vector3(-0.037, -0.07, -0.04)
across.addScaledVector(forward, -across.dot(forward)).normalize()
const up = new THREE.Vector3().crossVectors(across, forward).normalize()
const transform = (p, direction = false) => {
  const v = new THREE.Vector3(...p)
  if (!direction) v.sub(origin)
  return [-v.dot(across), v.dot(up), -v.dot(forward)]
}
// Landmarks in the source mesh's coordinates; three joints per finger.
const landmarks = [
  [
    [0.491, -0.157, 0.965],
    [0.511, -0.167, 0.938],
    [0.523, -0.174, 0.916],
    [0.527, -0.178, 0.902],
  ],
  [
    [0.484, -0.177, 0.958],
    [0.506, -0.188, 0.921],
    [0.518, -0.199, 0.891],
    [0.522, -0.203, 0.869],
  ],
  [
    [0.471, -0.195, 0.956],
    [0.493, -0.211, 0.918],
    [0.505, -0.222, 0.889],
    [0.51, -0.228, 0.865],
  ],
  [
    [0.456, -0.21, 0.953],
    [0.475, -0.23, 0.918],
    [0.485, -0.242, 0.893],
    [0.489, -0.248, 0.879],
  ],
  [
    [0.44, -0.171, 0.982],
    [0.427, -0.2, 0.967],
    [0.425, -0.226, 0.95],
    [0.428, -0.247, 0.94],
  ],
].map((f) => f.map((p) => new THREE.Vector3(...transform(p))))
const doc = {
  asset: { version: '2.0', generator: 'Nabla glove preparation' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [
    { name: 'glove', children: [1, 2] },
    { name: 'glove-mesh', mesh: 0, skin: 0 },
    { name: 'palm', children: [] },
  ],
  meshes: [],
  skins: [],
  accessors: [],
  bufferViews: [],
  buffers: [],
  materials: structuredClone(source.materials),
  textures: structuredClone(source.textures),
  samplers: structuredClone(source.samplers),
  images: [],
}
let length = 0
const chunks = []
function view(bytes) {
  const id = doc.bufferViews.length
  doc.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length })
  chunks.push(bytes)
  length += bytes.length
  const pad = (4 - (length % 4)) % 4
  chunks.push(Buffer.alloc(pad))
  length += pad
  return id
}
function accessor(values, type, componentType = 5126) {
  const flat = values.flat(),
    width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type]
  const bytes = Buffer.alloc(flat.length * (componentType === 5123 ? 2 : 4))
  flat.forEach((x, i) =>
    componentType === 5123 ? bytes.writeUInt16LE(x, i * 2) : bytes.writeFloatLE(x, i * 4),
  )
  const a = { bufferView: view(bytes), componentType, count: flat.length / width, type }
  if (type === 'VEC3') {
    a.min = [0, 1, 2].map((k) => Math.min(...values.map((v) => v[k])))
    a.max = [0, 1, 2].map((k) => Math.max(...values.map((v) => v[k])))
  }
  return doc.accessors.push(a) - 1
}
const joints = [2],
  inverse = [new THREE.Matrix4().toArray()]
for (let f = 0; f < 5; f++) {
  let parent = 2
  for (let k = 0; k < 3; k++) {
    const p = landmarks[f][k],
      previous = k ? landmarks[f][k - 1] : new THREE.Vector3()
    const id = doc.nodes.length
    doc.nodes.push({
      name: `finger-${f}-${k}`,
      translation: p.clone().sub(previous).toArray(),
      children: [],
    })
    doc.nodes[parent].children.push(id)
    parent = id
    joints.push(id)
    inverse.push(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z).toArray())
  }
  if (f === 0)
    doc.nodes[parent].children.push(
      doc.nodes.push({
        name: 'index-tip',
        translation: landmarks[f][3].clone().sub(landmarks[f][2]).toArray(),
      }) - 1,
    )
}
const newPositions = [],
  newNormals = [],
  newUV = [],
  weights = [],
  indices = [],
  skinIndices = [],
  map = new Map()
for (let i = 0; i < positions.length; i++) {
  if (positions[i][0] < 0) continue
  map.set(i, newPositions.length)
  const p = new THREE.Vector3(...transform(positions[i]))
  newPositions.push(p.toArray())
  newNormals.push(transform(normals[i], true))
  newUV.push(uv[i])
  let best = { distance: Infinity, f: 0, k: 0, t: 0 }
  for (let f = 0; f < 5; f++)
    for (let k = 0; k < 3; k++) {
      const a = landmarks[f][k],
        delta = landmarks[f][k + 1].clone().sub(a)
      const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(delta) / delta.lengthSq(), 0, 1)
      const distance = p.distanceTo(a.clone().addScaledVector(delta, t))
      if (distance < best.distance) best = { distance, f, k, t }
    }
  const { f, k, t } = best,
    base = 1 + f * 3
  // Blend over each knuckle. Palm vertices remain on the palm bone.
  const axis = landmarks[f][1].clone().sub(landmarks[f][0]).normalize()
  const along = p.clone().sub(landmarks[f][0]).dot(axis)
  let a, b, w
  if (k === 0 && along < 0.012) {
    a = 0
    b = base
    w = THREE.MathUtils.smoothstep(along, -0.012, 0.012)
  } else if (t < 0.35 && k > 0) {
    a = base + k - 1
    b = base + k
    w = 0.5 + 0.5 * THREE.MathUtils.smoothstep(t, 0, 0.35)
  } else if (t > 0.65 && k < 2) {
    a = base + k
    b = base + k + 1
    w = 0.5 * THREE.MathUtils.smoothstep(t, 0.65, 1)
  } else {
    a = base + k
    b = a
    w = 0
  }
  skinIndices.push([a, b, 0, 0])
  weights.push([1 - w, w, 0, 0])
}
const originalIndices = read(primitive.indices).flat()
for (let i = 0; i < originalIndices.length; i += 3) {
  const tri = originalIndices.slice(i, i + 3)
  if (tri.every((v) => map.has(v))) indices.push(...tri.reverse().map((v) => map.get(v)))
}
doc.meshes.push({
  primitives: [
    {
      attributes: {
        POSITION: accessor(newPositions, 'VEC3'),
        NORMAL: accessor(newNormals, 'VEC3'),
        TEXCOORD_0: accessor(newUV, 'VEC2'),
        JOINTS_0: accessor(skinIndices, 'VEC4', 5123),
        WEIGHTS_0: accessor(weights, 'VEC4'),
      },
      indices: accessor(indices, 'SCALAR', 5123),
      material: 0,
    },
  ],
})
doc.skins.push({ joints, skeleton: 2, inverseBindMatrices: accessor(inverse, 'MAT4') })
for (const img of source.images) {
  const v = source.bufferViews[img.bufferView]
  doc.images.push({
    mimeType: img.mimeType,
    bufferView: view(binary.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength)),
  })
}
doc.buffers = [{ byteLength: length }]
const json = Buffer.from(JSON.stringify(doc)),
  padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]),
  bin = Buffer.concat(chunks)
const header = Buffer.alloc(20)
header.write('glTF')
header.writeUInt32LE(2, 4)
header.writeUInt32LE(28 + padded.length + bin.length, 8)
header.writeUInt32LE(padded.length, 12)
header.writeUInt32LE(0x4e4f534a, 16)
const bh = Buffer.alloc(8)
bh.writeUInt32LE(bin.length)
bh.writeUInt32LE(0x004e4942, 4)
const output = 'assets/library/hands/tan-glove-rigged.glb'
fs.mkdirSync('assets/library/hands', { recursive: true })
fs.writeFileSync(output, Buffer.concat([header, padded, bh, bin]))
console.log({
  output,
  vertices: newPositions.length,
  triangles: indices.length / 3,
  bones: joints.length,
  bytes: fs.statSync(output).size,
})
