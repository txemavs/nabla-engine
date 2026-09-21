import { it, expect } from 'vitest'
import { roadGeometry } from './draped-road.js'
import { terrainHeight } from './terrain.js'
it('keeps every asphalt triangle above the exact terrain surface across grid diagonals', () => {
  const t = { columns: 3, rows: 3, spacing: 10, heights: [0, 3, 0, 6, 1, 5, 2, 8, 1] }
  const g = roadGeometry(
    t,
    [
      [
        [-8, 0, -7],
        [7, 0, 8],
      ],
    ],
    2,
  )
  expect(g.faces.length).toBeGreaterThan(4)
  for (const f of g.faces) {
    const center = f.reduce((p, i) => p.map((v, j) => v + g.vertices[i][j] / 3), [0, 0, 0])
    expect(center[1] - terrainHeight(t, center[0], center[2])).toBeCloseTo(0.035, 2)
  }
})
