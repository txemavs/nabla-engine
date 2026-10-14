/** Generate the truck low body, shared wheel and steering wheel, preserving authored rig nodes. */
import fs from 'node:fs'
import { BoxGeometry } from 'three'
import { MeshoptSimplifier as simplify } from 'meshoptimizer'
await simplify.ready
function prepare(filename, kind) {
  const input = fs.readFileSync('assets/library/trucks/white-truck/assets/' + filename + '.glb')
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
  // Keep named anchor nodes, but omit small decorative meshes from the low model.
  const removedMeshes = new Set()
  if (kind === 'body')
    for (const node of doc.nodes) {
      if (
        /AirVent_Slat|HingeBarrel|Passenger_Inlay|Glovebox_Seam|Dashboard_SatinTrim|InnerHandle/.test(
          node.name ?? '',
        ) &&
        node.mesh !== undefined
      ) {
        removedMeshes.add(node.mesh)
        delete node.mesh
      }
    }
  const kept = doc.meshes.map((_, i) => i).filter((i) => !removedMeshes.has(i))
  for (const node of doc.nodes) if (node.mesh !== undefined) node.mesh = kept.indexOf(node.mesh)
  doc.meshes = kept.map((i) => doc.meshes[i])
  for (const mesh of doc.meshes)
    for (const p of mesh.primitives) {
      if ((p.mode ?? 4) !== 4 || p.targets) throw new Error('Unsupported primitive')
      const attrs = Object.fromEntries(
        Object.entries(p.attributes).map(([key, id]) => [key, read(id)]),
      )
      let indices = Uint32Array.from(read(p.indices))
      const name = source.nodes.find((n) => n.mesh === kept[doc.meshes.indexOf(mesh)])?.name ?? ''
      const material = source.materials[p.material]
      // The authored reverse lens has missing triangular faces. Replace it with
      // a closed white lens at the same bounds, retaining its light-channel material.
      if (/^Reverse_[LR]$/.test(material?.name ?? '')) {
        const min = [Infinity, Infinity, Infinity],
          max = [-Infinity, -Infinity, -Infinity]
        for (const i of indices)
          for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis], attrs.POSITION[i * 3 + axis])
            max[axis] = Math.max(max[axis], attrs.POSITION[i * 3 + axis])
          }
        const lens = new BoxGeometry(...max.map((v, axis) => v - min[axis]))
        lens.translate(...max.map((v, axis) => (v + min[axis]) / 2))
        attrs.POSITION = lens.attributes.position.array
        attrs.NORMAL = lens.attributes.normal.array
        if (attrs.TEXCOORD_0) attrs.TEXCOORD_0 = lens.attributes.uv.array
        delete attrs.TANGENT
        indices = Uint32Array.from(lens.index.array)
        const outputMaterial = doc.materials[p.material]
        outputMaterial.pbrMetallicRoughness = {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0,
          roughnessFactor: 0.65,
        }
        outputMaterial.alphaMode = 'OPAQUE'
        lens.dispose()
      }
      const paint = /paint/i.test(material?.name ?? '')
      const preserveShape =
        indices.length <= 360 ||
        /glass|lamp|beam|indicator|tail|reverse|display|mirror/i.test(material?.name ?? '')
      // Keep the painted wheel arches round and their panel edges stable.
      const ratio = paint ? 0.65 : /tire/i.test(name) ? 0.65 : kind === 'body' ? 0.15 : 0.3
      const target = Math.max(36, Math.floor((indices.length * ratio) / 3) * 3)
      const [reduced] = preserveShape
        ? [indices.slice()]
        : attrs.NORMAL
          ? simplify.simplifyWithAttributes(
              indices,
              attrs.POSITION,
              3,
              attrs.NORMAL,
              3,
              [0.5, 0.5, 0.5],
              null,
              target,
              paint ? 0.004 : 0.04,
              ['LockBorder'],
            )
          : simplify.simplify(indices, attrs.POSITION, 3, target, 0.005, ['LockBorder'])
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
  // Door animations use separate time/transform accessors, outside mesh attributes.
  const animationAccessors = new Map()
  for (const animation of doc.animations ?? [])
    for (const sampler of animation.samplers) {
      for (const key of ['input', 'output']) {
        const old = sampler[key]
        if (!animationAccessors.has(old)) {
          const index = add(read(old), source.accessors[old].type)
          for (const bound of ['min', 'max'])
            if (source.accessors[old][bound])
              doc.accessors[index][bound] = source.accessors[old][bound]
          animationAccessors.set(old, index)
        }
        sampler[key] = animationAccessors.get(old)
      }
    }
  const textures = new Set()
  function collect(object) {
    if (!object || typeof object !== 'object') return
    for (const [key, value] of Object.entries(object)) {
      if (key.endsWith('Texture') && value?.index !== undefined) textures.add(value.index)
      else collect(value)
    }
  }
  doc.materials.forEach(collect)
  const textureIds = [...textures]
  const imageIds = [...new Set(textureIds.map((id) => source.textures[id].source))]
  function remapTextures(object) {
    if (!object || typeof object !== 'object') return
    for (const [key, value] of Object.entries(object)) {
      if (key.endsWith('Texture') && value?.index !== undefined)
        value.index = textureIds.indexOf(value.index)
      else remapTextures(value)
    }
  }
  doc.materials.forEach(remapTextures)
  if (doc.textures)
    doc.textures = textureIds.map((id) => ({
      ...source.textures[id],
      source: imageIds.indexOf(source.textures[id].source),
    }))
  if (doc.images)
    doc.images = imageIds.map((id) => {
      const img = { ...source.images[id] },
        v = source.bufferViews[img.bufferView]
      img.bufferView = view(binary.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength))
      return img
    })
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
  doc.asset.generator = 'Nabla truck low geometry'
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

  return { output, triangles, originalTriangles, originalBytes: input.length }
}
const parts = [
  ['tractor.modern', 'tractor.low', 'body'],
  ['wheel.front', 'wheel.front-low', 'front'],
  ['wheel.rear', 'wheel.rear-low', 'rear'],
  ['steering', 'steering.low', 'steering'],
].map(([input, name, kind]) => ({ name, kind, ...prepare(input, kind) }))
const totalBytes = parts.reduce((n, p) => n + p.output.length, 0)
if (totalBytes > 1_000_000) throw new Error('Truck GLB set exceeds 1 MB: ' + totalBytes)
for (const part of parts)
  fs.writeFileSync('assets/library/trucks/white-truck/assets/' + part.name + '.glb', part.output)
const filename = 'assets/library/cars/white-truck/white-truck.json'
const preset = JSON.parse(fs.readFileSync(filename))
const root = '/library/trucks/white-truck/assets/'
preset.visual.body.lowUrl = root + 'tractor.low.glb'
preset.visual.steering.lowUrl = root + 'steering.low.glb'
for (const wheel of preset.visual.wheels) wheel.lowUrl = wheel.url.replace('.glb', '-low.glb')
fs.writeFileSync(filename, JSON.stringify(preset, null, 2) + '\n')
console.log(
  JSON.stringify(
    {
      totalBytes,
      parts: parts.map(({ name, triangles, originalTriangles, originalBytes, output }) => ({
        name,
        triangles,
        originalTriangles,
        originalBytes,
        bytes: output.length,
      })),
      trianglesComplete: parts.reduce(
        (n, p) => n + p.triangles * (['front', 'rear'].includes(p.kind) ? 2 : 1),
        0,
      ),
    },
    null,
    2,
  ),
)
