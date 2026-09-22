import { it, expect } from 'vitest'
import { waterPolygon, decodeSea } from '../playground/water-geometry.js'
import { IRUN_VENTAS } from './real-world.js'
it('triangulates the sea while keeping an island dry and preserving sea altitude', () => {
  const ring = (points: number[][]) => points.map(([x, y]) => ({ x, y }))
  const positions = waterPolygon(
    [
      ring([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ]),
      ring([
        [3, 3],
        [3, 7],
        [7, 7],
        [7, 3],
        [3, 3],
      ]),
    ],
    -28.173,
  )
  let area = 0
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(i, i + 9)
    area += Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2
    expect([ay, by, cy]).toEqual([-28.173, -28.173, -28.173])
    const x = (ax + bx + cx) / 3,
      z = (az + bz + cz) / 3
    expect(x > 3 && x < 7 && z > 3 && z < 7).toBe(false)
  }
  expect(area).toBeCloseTo(84)
})
it('does not invent ocean when a vector tile has no water layer', () => {
  expect(decodeSea(new ArrayBuffer(0), 2027, 1499, 12, IRUN_VENTAS)).toHaveLength(0)
})
