import { expect, it } from 'vitest'
import { Vector2 } from 'three'
import { buildingRings } from './building-rings.js'
import { createRealWorld, IRUN_VENTAS, type WorldExtract } from './real-world.js'
import { localToGeo } from './geography.js'
const square = (x: number, y: number, size: number) =>
  [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y],
  ].map(([x, y]) => new Vector2(x, y))
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
