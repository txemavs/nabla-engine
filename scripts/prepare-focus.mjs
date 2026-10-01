/** Prepare the supplied Focus in metres, Y-up, -Z forward. Preserve its embedded attribution. */
import fs from 'node:fs'
import { Matrix4, Matrix3, Vector3 } from 'three'
const bytes = fs.readFileSync(process.argv[2])
const len = bytes.readUInt32LE(12)
const source = JSON.parse(bytes.subarray(20, 20 + len))
const bin = bytes.subarray(28 + len)
const meshMatrices = new Map()
const convert = new Matrix4()
  .makeRotationY(Math.PI)
  .multiply(new Matrix4().makeScale(100, 100, 100))
function walk(i, parent) {
  const node = source.nodes[i],
    matrix = parent
      .clone()
      .multiply(node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4())
  if (node.mesh !== undefined) meshMatrices.set(node.mesh, matrix)
  for (const child of node.children || []) walk(child, matrix)
}
for (const i of source.scenes[source.scene || 0].nodes) walk(i, convert)
function values(index) {
  const a = source.accessors[index],
    v = source.bufferViews[a.bufferView],
    n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type]
  const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType],
    read = { 5126: 'readFloatLE', 5125: 'readUInt32LE', 5123: 'readUInt16LE', 5121: 'readUInt8' }[
      a.componentType
    ]
  return Array.from({ length: a.count }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      bin[read](
        (v.byteOffset || 0) + (a.byteOffset || 0) + i * (v.byteStride || n * size) + j * size,
      ),
    ),
  )
}
function points(mesh) {
  return values(source.meshes[mesh].primitives[0].attributes.POSITION).map((p) =>
    new Vector3(...p).applyMatrix4(meshMatrices.get(mesh)),
  )
}
const wheels = [33, 32, 31, 30].map((i) => {
  const ps = points(i)
  const min = new Vector3(Infinity, Infinity, Infinity),
    max = min.clone().negate()
  for (const p of ps) {
    min.min(p)
    max.max(p)
  }
  return {
    mesh: i,
    min: min.toArray(),
    max: max.toArray(),
    center: min.clone().add(max).multiplyScalar(0.5).toArray(),
  }
})
const lift = -Math.min(...wheels.map((w) => w.min[1]))
console.log(JSON.stringify({ lift, wheels }, null, 2))
function output(name, meshes, origin) {
  const groups = new Map()
  for (const index of meshes)
    for (const primitive of source.meshes[index].primitives) {
      const matrix = meshMatrices.get(index),
        normal = new Matrix3().getNormalMatrix(matrix)
      const group = groups.get(primitive.material) || {
        position: [],
        normal: [],
        uv: [],
        indices: [],
      }
      groups.set(primitive.material, group)
      const base = group.position.length
      group.position.push(
        ...values(primitive.attributes.POSITION).map((p) =>
          new Vector3(...p)
            .applyMatrix4(matrix)
            .add(new Vector3(0, lift, 0))
            .sub(origin)
            .toArray(),
        ),
      )
      group.normal.push(
        ...values(primitive.attributes.NORMAL).map((p) =>
          new Vector3(...p).applyMatrix3(normal).normalize().toArray(),
        ),
      )
      group.uv.push(
        ...(primitive.attributes.TEXCOORD_0 === undefined
          ? Array.from({ length: group.position.length - base }, () => [0, 0])
          : values(primitive.attributes.TEXCOORD_0)),
      )
      group.indices.push(...values(primitive.indices).map(([i]) => i + base))
    }
  const out = {
    asset: { ...source.asset, generator: 'Nabla prepare-focus.mjs' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
    images: [],
    textures: [],
    samplers: source.samplers || [],
  }
  let parts = [],
    offset = 0
  function view(data) {
    const padding = Buffer.alloc((4 - (offset % 4)) % 4)
    parts.push(padding)
    offset += padding.length
    const id = out.bufferViews.length
    out.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length })
    parts.push(data)
    offset += data.length
    return id
  }
  function accessor(items, type, component = 5126) {
    const flat = items.flat()
    const data = Buffer.alloc(flat.length * 4)
    flat.forEach((v, i) =>
      component === 5126 ? data.writeFloatLE(v, i * 4) : data.writeUInt32LE(v, i * 4),
    )
    const a = { bufferView: view(data), componentType: component, count: items.length, type }
    if (type === 'VEC3') {
      a.min = [0, 1, 2].map((i) => Math.min(...items.map((p) => p[i])))
      a.max = [0, 1, 2].map((i) => Math.max(...items.map((p) => p[i])))
    }
    out.accessors.push(a)
    return out.accessors.length - 1
  }
  const textureMap = new Map()
  function texture(i) {
    if (textureMap.has(i)) return textureMap.get(i)
    const t = structuredClone(source.textures[i]),
      im = structuredClone(source.images[t.source]),
      v = source.bufferViews[im.bufferView]
    im.bufferView = view(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength))
    t.source = out.images.length
    out.images.push(im)
    const id = out.textures.length
    out.textures.push(t)
    textureMap.set(i, id)
    return id
  }
  function remap(obj) {
    for (const [key, value] of Object.entries(obj)) {
      if (key.endsWith('Texture') && value?.index !== undefined) value.index = texture(value.index)
      else if (value && typeof value === 'object') remap(value)
    }
  }
  for (const [id, g] of groups) {
    const material = structuredClone(source.materials[id])
    delete material.extensions
    remap(material)
    if (id === 0) material.pbrMetallicRoughness.baseColorFactor = [0.92, 0.92, 0.92, 1]
    if (id === 2) {
      material.alphaMode = 'BLEND'
      material.pbrMetallicRoughness.baseColorFactor = [0.12, 0.17, 0.23, 0.25]
    }
    const i = out.meshes.length
    out.materials.push(material)
    out.meshes.push({
      name: material.name,
      primitives: [
        {
          attributes: {
            POSITION: accessor(g.position, 'VEC3'),
            NORMAL: accessor(g.normal, 'VEC3'),
            TEXCOORD_0: accessor(g.uv, 'VEC2'),
          },
          indices: accessor(g.indices, 'SCALAR', 5125),
          material: i,
        },
      ],
    })
    out.nodes.push({ name: material.name, mesh: i })
    out.scenes[0].nodes.push(i)
  }
  out.buffers = [{ byteLength: offset }]
  let json = Buffer.from(JSON.stringify(out))
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)])
  let data = Buffer.concat(parts)
  data = Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4)])
  const header = Buffer.alloc(20)
  header.writeUInt32LE(0x46546c67)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(28 + json.length + data.length, 8)
  header.writeUInt32LE(json.length, 12)
  header.writeUInt32LE(0x4e4f534a, 16)
  const bh = Buffer.alloc(8)
  bh.writeUInt32LE(data.length)
  bh.writeUInt32LE(0x004e4942, 4)
  fs.writeFileSync(
    new URL('../assets/custom/cars/police/' + name, import.meta.url),
    Buffer.concat([header, json, bh, data]),
  )
  console.log(
    name,
    groups.size,
    'materials',
    [...groups.values()].reduce((n, g) => n + g.indices.length / 3, 0),
    'triangles',
  )
}
output(
  'car.ford.focus.police.glb',
  source.meshes.map((_, i) => i).filter((i) => i < 30 || i > 33),
  new Vector3(),
)
output(
  'car.ford.focus.wheel.glb',
  [33],
  new Vector3(...wheels[0].center).add(new Vector3(0, lift, 0)),
)
