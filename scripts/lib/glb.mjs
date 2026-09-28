import fs from 'node:fs'
export function readGlb(path) {
  const b = fs.readFileSync(path),
    n = b.readUInt32LE(12),
    json = JSON.parse(b.subarray(20, 20 + n)),
    bin = b.subarray(28 + n)
  const read = (id) => {
    const a = json.accessors[id],
      v = json.bufferViews[a.bufferView],
      dim = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type],
      sz = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType],
      fn = { 5126: 'readFloatLE', 5125: 'readUInt32LE', 5123: 'readUInt16LE', 5121: 'readUInt8' }[
        a.componentType
      ]
    return Array.from({ length: a.count }, (_, i) =>
      Array.from({ length: dim }, (_, k) =>
        bin[fn](
          (v.byteOffset || 0) + (a.byteOffset || 0) + i * (v.byteStride || sz * dim) + k * sz,
        ),
      ),
    )
  }
  return { json, bin, read }
}
export function writeGlb(path, json, read, bin) {
  const out = structuredClone(json)
  out.accessors = []
  out.bufferViews = []
  let offset = 0,
    parts = []
  const view = (b) => {
    const pad = Buffer.alloc((4 - (offset % 4)) % 4)
    parts.push(pad)
    offset += pad.length
    const i = out.bufferViews.length
    out.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: b.length })
    parts.push(b)
    offset += b.length
    return i
  }
  const cache = new Map()
  const accessor = (id) => {
    if (cache.has(id)) return cache.get(id)
    const a = json.accessors[id],
      vs = read(id),
      flat = vs.flat(),
      integer = a.type === 'SCALAR'
    const short = integer && flat.every((v) => v < 65536)
    const stride = short ? 2 : 4
    const data = Buffer.alloc(flat.length * stride)
    flat.forEach((v, i) =>
      short
        ? data.writeUInt16LE(v, i * 2)
        : integer
          ? data.writeUInt32LE(v, i * 4)
          : data.writeFloatLE(v, i * 4),
    )
    const next = {
      bufferView: view(data),
      componentType: short ? 5123 : integer ? 5125 : 5126,
      count: vs.length,
      type: a.type,
    }
    if (a.type === 'VEC3') {
      next.min = [0, 1, 2].map((i) => vs.reduce((n, v) => Math.min(n, v[i]), Infinity))
      next.max = [0, 1, 2].map((i) => vs.reduce((n, v) => Math.max(n, v[i]), -Infinity))
    }
    const i = out.accessors.length
    out.accessors.push(next)
    cache.set(id, i)
    return i
  }
  for (const m of out.meshes)
    for (const p of m.primitives) {
      p.indices = accessor(p.indices)
      for (const k in p.attributes) p.attributes[k] = accessor(p.attributes[k])
    }
  for (const image of out.images || []) {
    const v = json.bufferViews[image.bufferView]
    image.bufferView = view(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength))
  }
  out.buffers = [{ byteLength: offset }]
  let j = Buffer.from(JSON.stringify(out))
  j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 32)])
  let d = Buffer.concat(parts)
  d = Buffer.concat([d, Buffer.alloc((4 - (d.length % 4)) % 4)])
  const h = Buffer.alloc(20),
    bh = Buffer.alloc(8)
  h.writeUInt32LE(0x46546c67)
  h.writeUInt32LE(2, 4)
  h.writeUInt32LE(28 + j.length + d.length, 8)
  h.writeUInt32LE(j.length, 12)
  h.writeUInt32LE(0x4e4f534a, 16)
  bh.writeUInt32LE(d.length)
  bh.writeUInt32LE(0x004e4942, 4)
  fs.writeFileSync(path, Buffer.concat([h, j, bh, d]))
}
/** Components join by position so material/normal seams do not split a badge into individual faces. */
export function components(positions, indices) {
  const parent = positions.map((_, i) => i),
    first = new Map(),
    root = (i) => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]]
        i = parent[i]
      }
      return i
    },
    join = (a, b) => {
      parent[root(a)] = root(b)
    }
  positions.forEach((p, i) => {
    const key = p.map((v) => Math.round(v * 1e5)).join(',')
    if (first.has(key)) join(i, first.get(key))
    else first.set(key, i)
  })
  for (let i = 0; i < indices.length; i += 3) {
    join(indices[i], indices[i + 1])
    join(indices[i], indices[i + 2])
  }
  const groups = new Map()
  for (let i = 0; i < indices.length; i += 3) {
    const r = root(indices[i]),
      g = groups.get(r) || []
    g.push(...indices.slice(i, i + 3))
    groups.set(r, g)
  }
  return [...groups.values()].map((ix) => ({
    indices: ix,
    min: [0, 1, 2].map((k) => ix.reduce((n, i) => Math.min(n, positions[i][k]), Infinity)),
    max: [0, 1, 2].map((k) => ix.reduce((n, i) => Math.max(n, positions[i][k]), -Infinity)),
  }))
}
