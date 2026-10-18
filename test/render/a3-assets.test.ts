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
  const bytes = readFileSync(`assets/library/cars/a3/a3.${part}.glb`),
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
it('retains the corrected source paint, glazing, optical surfaces and mirror triangles', () => {
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
  // Approved body with simplified headlights and original front glazing, 2026-10-18.
  expect(hash.digest('hex')).toBe(
    'd921315613f07c5d0f883a9d3b1fecf47e9e81437bbfb141a40ade57cc591f58',
  )
})
it('keeps the complete assembled A3 under 100k triangles and includes the corrected body base', () => {
  let total = 0
  for (const part of ['cabrio', 'wheel', 'steering']) {
    const { json: j } = load(part)
    const triangles = j.meshes.reduce(
      (n, m) => n + m.primitives.reduce((n, p) => n + j.accessors[p.indices].count / 3, 0),
      0,
    )
    total += triangles * (part === 'wheel' ? 4 : 1)
    expect(j.nodes.some((n) => n.name.startsWith('Nabla'))).toBe(true)
    if (part === 'cabrio') expect(j.nodes.some((n) => n.name === 'Base')).toBe(true)
  }
  expect(total).toBeLessThan(100000)
})

it('preserves the approved geometry and driver/mechanical anchors', () => {
  const bytes = readFileSync('assets/library/cars/a3/a3.cabrio.glb')
  const length = bytes.readUInt32LE(12)
  // Baseline after the approved headlight replacement and binary compaction.
  expect(
    createHash('sha256')
      .update(bytes.subarray(20 + length))
      .digest('hex'),
  ).toBe('654b1329dc4a1b7e725be36be4effa09b5a1ff6189feeb34c2463cb416675bf3')
  const anchors = load('cabrio').json.nodes.filter((node) => node.name.startsWith('nabla.'))
  expect(anchors.map((node) => node.name).sort()).toEqual([
    'nabla.driver.eyes',
    'nabla.driver.seat',
    'nabla.steering',
    'nabla.wheel.fl',
    'nabla.wheel.fr',
    'nabla.wheel.rl',
    'nabla.wheel.rr',
  ])
  expect(anchors.every((node) => node.mesh === undefined)).toBe(true)
})
