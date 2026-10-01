import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
type Glb = {
  accessors: {
    bufferView: number
    byteOffset?: number
    count: number
    componentType: number
    type: string
  }[]
  bufferViews: { byteOffset?: number; byteStride?: number }[]
  materials: { name: string }[]
  meshes: {
    primitives: { attributes: Record<string, number>; indices: number; material: number }[]
  }[]
  nodes: { name: string; mesh?: number }[]
}
function load(part: string) {
  const bytes = readFileSync(`assets/studio/cars/a3/a3.${part}.glb`),
    length = bytes.readUInt32LE(12)
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString()) as Glb,
    bin = bytes.subarray(28 + length)
  const read = (id: number) => {
    const a = json.accessors[id],
      v = json.bufferViews[a.bufferView],
      n = a.type === 'SCALAR' ? 1 : 3,
      size = a.componentType === 5123 ? 2 : 4
    return Array.from({ length: a.count }, (_, i) =>
      Array.from({ length: n }, (_, k) => {
        const offset =
          (v.byteOffset || 0) + (a.byteOffset || 0) + i * (v.byteStride || n * size) + k * size
        return a.componentType === 5126
          ? bin.readFloatLE(offset)
          : size === 2
            ? bin.readUInt16LE(offset)
            : bin.readUInt32LE(offset)
      }),
    )
  }
  return { json, read }
}
it('retains the exact original paint, glazing, optical surfaces and mirror triangles', () => {
  const { json: j, read } = load('cabrio'),
    hash = createHash('sha256')
  for (const m of j.meshes)
    for (const p of m.primitives) {
      const name = j.materials[p.material].name
      if (!/Pintura|Foco|Piloto|Parabrisas/.test(name) && name !== 'Llanta 2') continue
      const positions = read(p.attributes.POSITION),
        indices = read(p.indices).flat(),
        bytes = Buffer.alloc(indices.length * 12)
      indices.forEach((v, i) =>
        positions[v].forEach((x, k) => bytes.writeFloatLE(x, i * 12 + k * 4)),
      )
      hash.update(bytes)
    }
  // Captured from the untouched source before simplification, not from the generated file.
  expect(hash.digest('hex')).toBe(
    '8cd09cdb05c0c00d53b7ffa59773c98d9cb0b3d5c0e725527ed60add6065a41f',
  )
})
it('keeps the complete assembled A3 under 100k triangles and includes the light seals', () => {
  let total = 0
  for (const part of ['cabrio', 'wheel', 'steering']) {
    const { json: j } = load(part)
    const triangles = j.meshes.reduce(
      (n, m) => n + m.primitives.reduce((n, p) => n + j.accessors[p.indices].count / 3, 0),
      0,
    )
    total += triangles * (part === 'wheel' ? 4 : 1)
    expect(j.nodes.some((n) => n.name.startsWith('Nabla'))).toBe(true)
    if (part === 'cabrio') expect(j.nodes.some((n) => n.name === 'A3 closed underfloor')).toBe(true)
  }
  expect(total).toBeLessThan(100000)
})

it('keeps new floor and arch seals outside the tire envelope, including front steering', () => {
  const { json: j, read } = load('cabrio')
  const radius = 0.315374,
    halfWidth = 0.1145
  for (const node of j.nodes.filter((n) => /underfloor|floor seal|wheel arch inner/.test(n.name))) {
    const points = j.meshes[node.mesh!].primitives.flatMap((p) => read(p.attributes.POSITION))
    const lo = [0, 1, 2].map((k) => Math.min(...points.map((p) => p[k])))
    const hi = [0, 1, 2].map((k) => Math.max(...points.map((p) => p[k])))
    for (const z of [-1.291815, 1.291815])
      for (const side of [-1, 1])
        for (const angle of [-0.45, 0, 0.45]) {
          const x = side * (z > 0 ? 0.7622195 : 0.7547195)
          const rx = halfWidth * Math.cos(angle) + radius * Math.abs(Math.sin(angle))
          const rz = radius * Math.cos(angle) + halfWidth * Math.abs(Math.sin(angle))
          const separated = hi[0] < x - rx || lo[0] > x + rx || hi[2] < z - rz || lo[2] > z + rz
          expect(separated, `${node.name} intersects the tire sweep`).toBe(true)
        }
  }
})
