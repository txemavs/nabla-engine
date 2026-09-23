import { describe, expect, it } from 'vitest'
import { groundRoadAreas, roadAreaSnapshotSchema } from './map-provider.js'
import { localToGeo } from './geography.js'
import { terrainHeight } from './terrain.js'
import snapshot from '../assets/geography/geoeuskadi-ventas.json'

const origin = { latitude: 43.33, longitude: -1.82, altitude: 0 }
const terrain = {
  columns: 5,
  rows: 5,
  spacing: 10,
  heights: Array.from({ length: 25 }, (_, i) => i % 5),
}
const ring = (size: number) =>
  [
    [-size, -size],
    [size, -size],
    [size, size],
    [-size, size],
    [-size, -size],
  ].map(([x, z]) => {
    const p = localToGeo(origin, [x, 0, z])
    return [p.longitude, p.latitude] as [number, number]
  })
function fixture() {
  const data = roadAreaSnapshotSchema.parse(snapshot)
  data.features = [
    {
      type: 'Feature',
      properties: {
        OBJECTID: 1,
        SITUACION: 'SUP',
        ESTADO: 'USO',
        COMPONEN2D: 'CGN',
        ID_TIPO: '0029',
        CODIGOC: null,
      },
      geometry: { type: 'Polygon', coordinates: [ring(15), ring(5)] },
    },
  ]
  return data
}
describe('official road-area adapter', () => {
  it('preserves holes and drapes on the exact terrain triangles', () => {
    const result = groundRoadAreas(fixture(), origin, terrain)
    expect(result.surfaces).toHaveLength(1)
    const g = result.surfaces[0].geometry
    let area = 0
    for (const [a, b, c] of g.faces.map((f) => f.map((i) => g.vertices[i]))) {
      const x = (a[0] + b[0] + c[0]) / 3,
        z = (a[2] + b[2] + c[2]) / 3
      expect(Math.abs(x) > 4.999 || Math.abs(z) > 4.999).toBe(true)
      area += Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) / 2
    }
    expect(area).toBeCloseTo(800, 1)
    for (const [x, y, z] of g.vertices)
      // The shared draper quantizes vertices to millimetres.
      expect(Math.abs(y - terrainHeight(terrain, x, z) - 0.035)).toBeLessThan(0.00051)
    expect(result.surfaces[0].source).toMatchObject({
      provider: 'geoeuskadi',
      nativeId: '1',
      kind: 'road-area',
    })
  })
  it('does not turn elevated, hidden, unfinished or unknown roads into ground roads', () => {
    for (const patch of [
      { SITUACION: 'ELE' },
      { SITUACION: 'SUB' },
      { SITUACION: null },
      { ESTADO: 'CON' },
      { COMPONEN2D: 'POC' },
    ]) {
      const data = fixture()
      Object.assign(data.features[0].properties, patch)
      expect(groundRoadAreas(data, origin, terrain).surfaces).toHaveLength(0)
    }
  })
  it('rejects incomplete snapshots and non-geographic coordinates', () => {
    expect(() => roadAreaSnapshotSchema.parse({ ...snapshot, complete: false })).toThrow()
    const data = fixture()
    data.features[0].geometry.coordinates = [
      [
        [200, 100],
        [201, 100],
        [200, 101],
        [200, 100],
      ],
    ]
    expect(() => roadAreaSnapshotSchema.parse(data)).toThrow()
  })
})
