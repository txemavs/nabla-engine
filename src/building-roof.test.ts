import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { buildingRoof, buildingRoofWithFaces } from './building-roof.js'
import { validateSolid, type SolidGeometry } from './solid.js'
const footprint = (): SolidGeometry => ({
  vertices: [
    [-3, 0, -8],
    [3, 0, -8],
    [3, 0, 8],
    [-3, 0, 8],
    [-3, 10, -8],
    [3, 10, -8],
    [3, 10, 8],
    [-3, 10, 8],
  ],
  edges: [],
  faces: [],
})
for (const shape of ['gabled', 'hipped', 'skillion', 'pyramidal'])
  it(`creates a closed outward-facing editable ${shape} roof within the tagged total height`, () => {
    const g = buildingRoof(footprint(), { 'roof:shape': shape, 'roof:height': '2' })
    validateSolid(g)
    expect(Math.max(...g.vertices.map((p) => p[1]))).toBe(10)
    expect(g.vertices[4][1]).toBe(8)
    const incidence = new Map<string, number>()
    for (const f of g.faces) {
      const [a, b, c] = f.map((i) => new Vector3(...g.vertices[i]))
      expect(
        b
          .clone()
          .sub(a)
          .cross(c.clone().sub(a))
          .dot(a.clone().sub(new Vector3(0, 5, 0))),
      ).toBeGreaterThan(0)
      for (let i = 0; i < 3; i++) {
        const key = [f[i], f[(i + 1) % 3]].sort((a, b) => a - b).join(',')
        incidence.set(key, (incidence.get(key) ?? 0) + 1)
      }
    }
    expect([...incidence.values()].every((n) => n === 2)).toBe(true)
  })

it('pyramidal roof has single apex at footprint center', () => {
  const result = buildingRoofWithFaces(footprint(), {
    'roof:shape': 'pyramidal',
    'roof:height': '2',
  })
  validateSolid(result.geometry)
  // 8 base vertices + 1 apex
  expect(result.geometry.vertices.length).toBe(9)
  const apex = result.geometry.vertices[8]
  expect(apex[1]).toBe(10) // Top height
  // Apex at center of footprint
  expect(apex[0]).toBeCloseTo(0, 5)
  expect(apex[2]).toBeCloseTo(0, 5)
  // 4 roof faces (triangles from each edge to apex)
  expect(result.roofFaces.length).toBe(4)
})

it('returns roof face indices for coloring', () => {
  for (const shape of ['gabled', 'hipped', 'skillion', 'pyramidal']) {
    const result = buildingRoofWithFaces(footprint(), { 'roof:shape': shape })
    expect(result.roofFaces.length).toBeGreaterThan(0)
    for (const i of result.roofFaces) {
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(result.geometry.faces.length)
    }
  }
})

it('leaves unsupported and unsuitable footprints unchanged', () => {
  const g = footprint()
  expect(buildingRoof(g, { 'roof:shape': 'dome' })).toBe(g)
  expect(buildingRoof(g, { 'roof:shape': 'gabled', 'roof:height': '0' })).toBe(g)
  g.vertices[0][0] = 0
  expect(buildingRoof(g, { 'roof:shape': 'gabled' })).toBe(g)
})
