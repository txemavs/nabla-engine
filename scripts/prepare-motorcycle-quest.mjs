/** Build a separate, uncompressed Quest GLB; preserve all authored rig nodes. */
import fs from 'node:fs'
import { MeshoptSimplifier as simplify } from 'meshoptimizer'
await simplify.ready
const dir = 'assets/library/motorcycles/vfr800fi-1999'
const input = fs.readFileSync(dir + '/vfr800fi-1999.glb')
const jsonSize = input.readUInt32LE(12)
const source = JSON.parse(input.subarray(20, 20 + jsonSize))
const binary = input.subarray(28 + jsonSize)
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
function read(id) {
  const a = source.accessors[id],
    v = source.bufferViews[a.bufferView]
  if (a.sparse || a.normalized) throw new Error('Unsupported accessor')
  const size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType]
  const method = {
    5121: 'readUInt8',
    5123: 'readUInt16LE',
    5125: 'readUInt32LE',
    5126: 'readFloatLE',
  }[a.componentType]
  const n = components[a.type],
    result = new Float32Array(a.count * n)
  for (let i = 0; i < a.count; i++)
    for (let j = 0; j < n; j++)
      result[i * n + j] = binary[method](
        (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (v.byteStride ?? n * size) + j * size,
      )
  return result
}
const doc = structuredClone(source)
doc.accessors = []
doc.bufferViews = []
const chunks = []
let size = 0,
  triangles = 0,
  originalTriangles = source.meshes.reduce(
    (sum, mesh) =>
      sum + mesh.primitives.reduce((n, p) => n + source.accessors[p.indices].count / 3, 0),
    0,
  )
function view(b) {
  const id = doc.bufferViews.length
  doc.bufferViews.push({ buffer: 0, byteOffset: size, byteLength: b.length })
  chunks.push(b)
  size += b.length
  const pad = (4 - (size % 4)) % 4
  if (pad) {
    chunks.push(Buffer.alloc(pad))
    size += pad
  }
  return id
}
function add(values, type, index = false) {
  const bytes = Buffer.alloc(values.length * (index ? 2 : 4))
  values.forEach((v, i) => (index ? bytes.writeUInt16LE(v, i * 2) : bytes.writeFloatLE(v, i * 4)))
  const a = {
    bufferView: view(bytes),
    componentType: index ? 5123 : 5126,
    count: values.length / components[type],
    type,
  }
  if (type === 'VEC3') {
    a.min = [Infinity, Infinity, Infinity]
    a.max = [-Infinity, -Infinity, -Infinity]
    values.forEach((v, i) => {
      a.min[i % 3] = Math.min(a.min[i % 3], v)
      a.max[i % 3] = Math.max(a.max[i % 3], v)
    })
  }
  doc.accessors.push(a)
  return doc.accessors.length - 1
}
// The red stripe is a separate overlay: remove it without touching spokes or rim geometry.
for (const mesh of doc.meshes)
  mesh.primitives = mesh.primitives.filter(
    (p) => source.materials[p.material]?.name !== 'Red rim stripe 6mm',
  )
for (const mesh of doc.meshes)
  for (const p of mesh.primitives) {
    if ((p.mode ?? 4) !== 4 || p.targets) throw new Error('Unsupported primitive')
    const attrs = Object.fromEntries(
      Object.entries(p.attributes).map(([key, id]) => [key, read(id)]),
    )
    const indices = Uint32Array.from(read(p.indices))
    const name = source.nodes.find((n) => n.mesh === doc.meshes.indexOf(mesh))?.name ?? ''
    const wheelDetail =
      /^(Wheel_Front|Wheel_Rear|Rear_Sprocket|Rear_Chain_Wrap|Left_Brake|Right_Brake)/.test(name)
    const tyre = name.startsWith('Tire_')
    const front = ['Wheel_Front', 'Wheel_Front_Discs', 'Wheel_Cover', 'Tire_Front'].includes(name)
    const preserveShape =
      ['Tail and brake red lens', 'Tail_Fairing_Paint', 'Seat rubber'].includes(
        source.materials[p.material]?.name,
      ) ||
      name === 'Tail_Lamp_Bezel_Closure' ||
      name === 'Tail_Cover_Seam_Closure' ||
      name === 'Wheel_Cover'
    // Spend detail on the fairing and cockpit; aggressively reduce rims and brake drilling.
    const ratio =
      name === 'Wheel_Front'
        ? 0.12
        : name === 'Wheel_Front_Discs'
          ? 0.5
          : name === 'Wheel_Cover'
            ? 0.65
            : name === 'Tire_Front'
              ? 0.25
              : wheelDetail
                ? 0.035
                : tyre
                  ? 0.18
                  : 0.2
    const target = Math.min(
      indices.length,
      Math.max(36, Math.floor((indices.length * ratio) / 3) * 3),
    )
    let [reduced] = preserveShape
      ? [indices.slice()]
      : simplify.simplify(
          indices,
          attrs.POSITION,
          3,
          target,
          front ? 0.005 : tyre ? 0.008 : wheelDetail ? 0.06 : 0.025,
          front ? ['Permissive', 'LockBorder'] : ['Permissive'],
        )
    const [remap, count] = simplify.compactMesh(reduced)
    if (count > 65535) throw new Error('Vertex budget exceeded')
    const old = p.attributes
    p.attributes = {}
    for (const [key, values] of Object.entries(attrs)) {
      const type = source.accessors[old[key]].type,
        n = components[type]
      const compact = new Float32Array(count * n)
      for (let i = 0; i < remap.length; i++)
        if (remap[i] !== 0xffffffff)
          for (let j = 0; j < n; j++) compact[remap[i] * n + j] = values[i * n + j]
      p.attributes[key] = add(compact, type)
    }
    p.indices = add(reduced, 'SCALAR', true)
    triangles += reduced.length / 3
  }
for (const img of doc.images ?? []) {
  const v = source.bufferViews[img.bufferView]
  img.bufferView = view(binary.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength))
}
// Avoid a separate refractive render pass on the headset; retain simple glass.
const removed = ['KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_clearcoat']
for (const m of doc.materials ?? []) {
  if (m.extensions?.KHR_materials_transmission) {
    m.alphaMode = 'BLEND'
    m.pbrMetallicRoughness ??= {}
    const color = m.pbrMetallicRoughness.baseColorFactor ?? [1, 1, 1, 1]
    m.pbrMetallicRoughness.baseColorFactor = [...color.slice(0, 3), 0.25]
  }
  for (const key of removed) if (m.extensions) delete m.extensions[key]
}
doc.extensionsUsed = doc.extensionsUsed?.filter((x) => !removed.includes(x))
doc.extensionsRequired = doc.extensionsRequired?.filter((x) => !removed.includes(x))
doc.buffers = [{ byteLength: size }]
doc.asset.generator = 'Nabla Quest motorcycle simplification'
const json = Buffer.from(JSON.stringify(doc))
const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20)
json.copy(padded)
const bin = Buffer.concat(chunks)
const header = Buffer.alloc(20)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(28 + padded.length + bin.length, 8)
header.writeUInt32LE(padded.length, 12)
header.writeUInt32LE(0x4e4f534a, 16)
const bh = Buffer.alloc(8)
bh.writeUInt32LE(bin.length, 0)
bh.writeUInt32LE(0x004e4942, 4)
const output = Buffer.concat([header, padded, bh, bin])
if (output.length > 1_000_000) throw new Error('Exceeds 1 MB: ' + output.length)
fs.writeFileSync(dir + '/vfr800fi-1999-quest.glb', output)
const preset = JSON.parse(fs.readFileSync(dir + '/vfr800.json'))
preset.id = 'vfr800-quest'
preset.label = preset.name = 'Honda VFR800 · Quest low poly'
preset.order = 2
preset.hidden = true
preset.visual.body.url = '/library/motorcycles/vfr800fi-1999/vfr800fi-1999-quest.glb'
fs.writeFileSync(dir + '/vfr800-quest.json', JSON.stringify(preset, null, 2) + '\n')
console.log(
  JSON.stringify(
    {
      originalBytes: input.length,
      bytes: output.length,
      originalTriangles,
      triangles,
      primitives: doc.meshes.reduce((n, m) => n + m.primitives.length, 0),
      nodes: doc.nodes.length,
    },
    null,
    2,
  ),
)
