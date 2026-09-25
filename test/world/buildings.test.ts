/**
 * Buildings, in the same order as the module: rings, footprints, then roofs.
 * The last two groups use a real Irún way instead of a synthetic box.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ShapeUtils, Vector2, Vector3 } from 'three'
import {
  buildingFootprints,
  buildingRings,
  buildingRoof,
  buildingRoofWithFaces,
} from '../../src/planet/buildings/buildings.js'
import {
  createRealWorld,
  IRUN_VENTAS,
  type WorldExtract,
  type MapFeature,
} from '../../src/planet/assemble/world.js'
import { localToGeo } from '../../src/math/geo/sphere.js'
import { faceNormal, validateSolid, type SolidGeometry } from '../../src/math/solid/mesh.js'

const square = (x: number, y: number, size: number) =>
  [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y],
  ].map(([x, y]) => new Vector2(x, y))

describe('rings', () => {
  // Each courtyard belongs to one outer ring. A hole outside every body is dropped.
  it('assigns each courtyard once and does not attach a disconnected hole to another body', () => {
    const rings = [
      { role: 'outer', points: square(0, 0, 30) },
      { role: 'outer', points: square(50, 0, 30) },
      { role: 'inner', points: square(10, 10, 10) },
      { role: 'inner', points: square(60, 10, 10) },
      { role: 'inner', points: square(200, 0, 5) },
    ]
    const before = JSON.stringify(rings)
    const result = buildingRings(rings)
    expect(result.map((p) => p.holes.length)).toEqual([1, 1])
    expect(JSON.stringify(rings)).toBe(before)
  })

  // Two courtyards on one relation must not duplicate walls or roof caps.
  it('generates separate building bodies without duplicate courtyard walls or caps', () => {
    const rings = [
      { role: 'outer', points: square(0, 0, 30) },
      { role: 'outer', points: square(50, 0, 30) },
      { role: 'inner', points: square(10, 10, 10) },
      { role: 'inner', points: square(60, 10, 10) },
    ]
    const data: WorldExtract = {
      name: 'Courtyards',
      origin: IRUN_VENTAS,
      terrain: { columns: 121, rows: 121, spacing: 10, heights: Array(14641).fill(0) },
      source: { retrievedAt: '2026-09-22' },
      features: [
        {
          id: 'relation/1',
          tags: { building: 'yes' },
          rings: rings.map((r) => ({
            role: r.role,
            coordinates: r.points.map((p) => {
              const g = localToGeo(IRUN_VENTAS, [p.x, 0, p.y])
              return [g.longitude, g.latitude]
            }),
          })),
        },
      ],
    }
    const geometry = createRealWorld(data).entities.find(
      (e) => e.source?.id === 'relation/1',
    )!.geometry!
    expect(geometry.vertices).toHaveLength(32)
    const signatures = geometry.faces.map((f) =>
      JSON.stringify(f.map((i) => geometry.vertices[i].join(',')).sort()),
    )
    expect(new Set(signatures).size).toBe(signatures.length)
    let roofArea = 0
    for (const f of geometry.faces)
      if (f.every((i) => geometry.vertices[i][1] === 9)) {
        const [a, b, c] = f.map((i) => geometry.vertices[i])
        roofArea += Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) / 2
      }
    expect(roofArea).toBeCloseTo(1600, 0)
  })
})

describe('footprints', () => {
  const box = (id: string, x: number, width: number, tags: Record<string, string>): MapFeature => ({
    id,
    tags,
    rings: [
      {
        role: 'outer',
        coordinates: [
          [x, 0],
          [x + width, 0],
          [x + width, 10],
          [x, 10],
          [x, 0],
        ],
      },
    ],
  })
  const project = ([x, y]: [number, number]): [number, number, number] => [x, 0, y]
  const area = (
    polygons: ReturnType<typeof buildingFootprints> extends Map<string, infer P> ? P : never,
  ) =>
    polygons.reduce(
      (s, p) =>
        s +
        Math.abs(ShapeUtils.area(p.contour)) -
        p.holes.reduce((a, h) => a + Math.abs(ShapeUtils.area(h)), 0),
      0,
    )

  // Parts that tile the outline replace it, so the generic shell does not keep a second roof.
  it('replaces the generic outline with its detailed parts without duplicate roof caps', () => {
    const result = buildingFootprints(
      [
        box('outline', 0, 20, { building: 'yes' }),
        box('left', 0, 10, { 'building:part': 'yes' }),
        box('right', 10, 10, { 'building:part': 'yes', min_height: '6' }),
      ],
      project,
    )
    expect(result.get('outline')).toEqual([])
    expect(area(result.get('left')!)).toBe(100)
    expect(area(result.get('right')!)).toBe(100)
  })

  // A part that sticks out of the outline is a neighbour and must not cut this building.
  it('preserves uncovered outline and ignores a neighboring part crossing its boundary', () => {
    const features = [
      box('outline', 0, 20, { building: 'yes' }),
      box('part', 0, 5, { 'building:part': 'yes' }),
      box('neighbor', 15, 10, { 'building:part': 'yes' }),
    ]
    const before = JSON.stringify(features)
    const result = buildingFootprints(features, project)
    expect(area(result.get('outline')!)).toBe(150)
    expect(JSON.stringify(features)).toBe(before)
  })
})

describe('roofs', () => {
  // A 6×16 m box, 10 m tall. The four bottom corners come first, then the four top corners.
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
    expect(result.geometry.vertices.length).toBe(9)
    const apex = result.geometry.vertices[8]
    expect(apex[1]).toBe(10)
    expect(apex[0]).toBeCloseTo(0, 5)
    expect(apex[2]).toBeCloseTo(0, 5)
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

  // Gable ends are walls. A flat roof still keeps the colour tagged on the way.
  it('gabled roof must not classify vertical gable ends as roof', () => {
    const g = buildingRoofWithFaces(footprint(), { 'roof:shape': 'gabled' })
    const vertical = g.roofFaces.filter((i) => {
      const [a, b, c] = g.geometry.faces[i].map((j) => new Vector3(...g.geometry.vertices[j]))
      return Math.abs(b.sub(a).cross(c.sub(a)).normalize().y) < 0.001
    })
    expect(vertical).toEqual([])
  })

  it('a flat roof must retain its explicit roof color', () => {
    const doc = createRealWorld({
      name: 'review',
      origin: IRUN_VENTAS,
      terrain: { columns: 13, rows: 13, spacing: 100, heights: Array(169).fill(0) },
      source: { retrievedAt: '2026-09-22' },
      features: [
        {
          id: 'way/1',
          tags: { building: 'yes', 'roof:shape': 'flat', 'roof:colour': 'red' },
          rings: [
            {
              role: 'outer',
              coordinates: [
                [-1.8196, 43.3297],
                [-1.8194, 43.3297],
                [-1.8194, 43.3299],
                [-1.8196, 43.3299],
                [-1.8196, 43.3297],
              ],
            },
          ],
        },
      ],
    })
    expect(doc.entities.find((e) => e.source?.id === 'way/1')?.roofColor).toBe('#ff0000')
  })
})

describe('surveyed Irún roof', () => {
  // OSM way/154094152: seven-corner apartments with one pyramidal roof level.
  const feature = JSON.parse(
    readFileSync(new URL('./buildings.fixture.json', import.meta.url), 'utf8'),
  ) as MapFeature
  const terrain = { columns: 13, rows: 13, spacing: 100, heights: Array(169).fill(0) }
  const origin = { latitude: 43.3377, longitude: -1.7821, altitude: 0 }

  it('builds the real seven-corner Irun pyramidal roof instead of a flat fallback', () => {
    const d = createRealWorld({
      name: 'Real roof',
      origin,
      terrain,
      source: { retrievedAt: '2026-09-22' },
      features: [feature],
    })
    const e = d.entities.find((e) => e.source?.id === feature.id)!
    expect(e).toBeDefined()
    expect(e.roofColor).toBe('#c75d4d')
    const g = e.geometry!
    expect(g.roofFaces).toHaveLength(7)
    for (const index of g.roofFaces!) {
      const face = g.faces[index],
        heights = face.map((i) => g.vertices[i][1])
      expect(Math.max(...heights) - Math.min(...heights)).toBeCloseTo(3)
      expect(faceNormal(g, face).y).toBeGreaterThan(0)
    }
  })

  // Same ring, two landcover tags: grass sits above residential and both stay under the road.
  it('gives overlapping white and green surfaces distinct physical heights below roads', () => {
    const ring = feature.rings
    const d = createRealWorld({
      name: 'Surfaces',
      origin,
      terrain,
      source: { retrievedAt: 'test' },
      features: [
        { id: 'way/1', tags: { landuse: 'grass' }, rings: ring },
        { id: 'way/2', tags: { landuse: 'residential' }, rings: ring },
      ],
    })
    const height = (id: string) =>
      d.entities
        .filter((e) => e.source?.id === id)
        .flatMap((e) => e.geometry!.vertices.map((v) => v[1]))
    const green = height('way/1'),
      white = height('way/2')
    expect(green.length).toBeGreaterThan(0)
    expect(white.length).toBeGreaterThan(0)
    expect(Math.min(...green)).toBeGreaterThan(Math.max(...white))
    expect(Math.max(...green)).toBeLessThan(0.035)
  })
})
