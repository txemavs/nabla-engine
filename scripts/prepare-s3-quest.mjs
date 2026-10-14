/** Generate the S3 low body, shared wheel and steering wheel, preserving authored rig nodes. */
import fs from 'node:fs'
import { MeshoptSimplifier as simplify } from 'meshoptimizer'
await simplify.ready
function prepare(filename, kind) {
  const input = fs.readFileSync('assets/library/cars/a3/' + filename + '.glb')
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
  for (const mesh of doc.meshes)
    for (const p of mesh.primitives) {
      if ((p.mode ?? 4) !== 4 || p.targets) throw new Error('Unsupported primitive')
      const attrs = Object.fromEntries(
        Object.entries(p.attributes).map(([key, id]) => [key, read(id)]),
      )
      const indices = Uint32Array.from(read(p.indices))
      const name = source.nodes.find((n) => n.mesh === doc.meshes.indexOf(mesh))?.name ?? ''
      const material = source.materials[p.material]
      const untextured = !JSON.stringify(material).includes('Texture')
      const paint = kind === 'body' && /^Pintura/.test(source.materials[p.material]?.name ?? '')
      const preserveShape = /light|foco|luz|luces|badge|grille|parabrisas/i.test(name)
      const ratio = paint
        ? 0.35
        : kind === 'body'
          ? /interior|puerta/i.test(name)
            ? 0.28
            : 0.2
          : kind === 'wheel'
            ? 0.3
            : 0.55
      const target = Math.min(
        indices.length,
        Math.max(36, Math.floor((indices.length * ratio) / 3) * 3),
      )
      let [reduced] = preserveShape
        ? [indices.slice()]
        : paint && attrs.NORMAL
          ? simplify.simplifyWithAttributes(
              indices,
              attrs.POSITION,
              3,
              attrs.NORMAL,
              3,
              [0.5, 0.5, 0.5],
              null,
              target,
              0.02,
              ['LockBorder'],
            )
          : simplify.simplify(indices, attrs.POSITION, 3, target, 0.008, [
              'Permissive',
              'LockBorder',
            ])
      const [remap, count] = simplify.compactMesh(reduced)
      if (count > 65535) throw new Error('Vertex budget exceeded')
      const old = p.attributes
      p.attributes = {}
      for (const [key, values] of Object.entries(attrs)) {
        // Untextured paint needs positions and normals only.
        if ((paint || untextured) && (key.startsWith('TEXCOORD_') || key === 'TANGENT')) continue
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
  // Paint and glass become simple PBR surfaces; keep small lamp alpha textures.
  for (const material of doc.materials ?? []) {
    if (/^Pintura/.test(material.name)) {
      delete material.pbrMetallicRoughness.baseColorTexture
      material.pbrMetallicRoughness.baseColorFactor = [0.22, 0.24, 0.27, 1]
    } else if (/Parabrisas/.test(material.name)) {
      delete material.pbrMetallicRoughness.baseColorTexture
      material.pbrMetallicRoughness.baseColorFactor = [0.18, 0.2, 0.22, 0.25]
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
  doc.asset.generator = 'Nabla S3 low geometry'
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
  ['a3.cabrio', 's3.body-low', 'body'],
  ['a3.wheel', 's3.wheel-low', 'wheel'],
  ['s3.steering', 's3.steering-low', 'steering'],
].map(([input, name, kind]) => ({ name, kind, ...prepare(input, kind) }))
const totalBytes = parts.reduce((n, p) => n + p.output.length, 0)
if (totalBytes > 1_000_000) throw new Error('S3 GLB set exceeds 1 MB: ' + totalBytes)
for (const part of parts)
  fs.writeFileSync('assets/library/cars/a3/' + part.name + '.glb', part.output)
const filename = 'assets/library/cars/a3/s3.json'
const preset = JSON.parse(fs.readFileSync(filename))
for (const [key, name] of [
  ['body', 's3.body-low'],
  ['wheel', 's3.wheel-low'],
  ['steering', 's3.steering-low'],
])
  preset.visual[key].lowUrl = '/library/cars/a3/' + name + '.glb'
fs.writeFileSync(filename, JSON.stringify(preset, null, 2) + '\n')
console.log(
  JSON.stringify(
    {
      totalBytes,
      parts: parts.map(({ name, kind, triangles, originalTriangles, originalBytes, output }) => ({
        name,
        kind,
        triangles,
        originalTriangles,
        originalBytes,
        bytes: output.length,
      })),
      trianglesComplete: parts.reduce((n, p) => n + p.triangles * (p.kind === 'wheel' ? 4 : 1), 0),
    },
    null,
    2,
  ),
)
