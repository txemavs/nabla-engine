import { it, expect } from 'vitest'
import {
  roadGeometry,
  smoothFloatRoadGeometry,
  SMOOTH_FLOAT_MIN_OFFSET,
  SMOOTH_FLOAT_WINDOW,
} from './draped-road.js'
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

it('smooth-float road floats at least SMOOTH_FLOAT_MIN_OFFSET above the DEM', () => {
  const t = { columns: 5, rows: 5, spacing: 10, heights: Array(25).fill(0) }
  t.heights[12] = 5
  const g = smoothFloatRoadGeometry(
    t,
    [
      [
        [-15, 0, 0],
        [15, 0, 0],
      ],
    ],
    4,
  )
  expect(g.faces.length).toBeGreaterThan(0)
  for (const f of g.faces) {
    for (const i of f) {
      const [x, y, z] = g.vertices[i]
      const clampedX = Math.max(-20, Math.min(20, x))
      const clampedZ = Math.max(-20, Math.min(20, z))
      const demHeight = terrainHeight(t, clampedX, clampedZ)
      expect(y).toBeGreaterThanOrEqual(demHeight + SMOOTH_FLOAT_MIN_OFFSET - 0.001)
    }
  }
})

it('smooth-float road has laterally flat cross-section (roll ≈ 0)', () => {
  const t = { columns: 5, rows: 5, spacing: 10, heights: Array(25).fill(0) }
  t.heights[6] = 3
  t.heights[8] = 3
  const g = smoothFloatRoadGeometry(
    t,
    [
      [
        [-15, 0, 0],
        [15, 0, 0],
      ],
    ],
    6,
  )
  const segmentVertices = g.vertices.filter(([x]) => Math.abs(x) < 14)
  const byX = new Map<number, number[]>()
  for (const [x, y] of segmentVertices) {
    const xKey = Math.round(x * 10)
    const list = byX.get(xKey) ?? []
    list.push(y)
    byX.set(xKey, list)
  }
  for (const [, heights] of byX) {
    if (heights.length < 2) continue
    const minH = Math.min(...heights)
    const maxH = Math.max(...heights)
    expect(maxH - minH).toBeLessThanOrEqual(0.01)
  }
})

it('smooth-float road smooths longitudinal profile over SMOOTH_FLOAT_WINDOW', () => {
  const t = { columns: 11, rows: 3, spacing: 10, heights: Array(33).fill(0) }
  t.heights[15] = 10
  t.heights[16] = 10
  t.heights[17] = 10
  const g = smoothFloatRoadGeometry(
    t,
    [
      [
        [-45, 0, 0],
        [45, 0, 0],
      ],
    ],
    2,
  )
  const centreHeights = g.vertices
    .filter(([_x, , z]) => Math.abs(z) < 1)
    .map(([, y]) => y)
    .sort((a, b) => a - b)
  expect(centreHeights.length).toBeGreaterThan(2)
  const maxHeight = centreHeights[centreHeights.length - 1]
  const minHeight = centreHeights[0]
  expect(maxHeight).toBeGreaterThan(0)
  expect(minHeight).toBeGreaterThanOrEqual(SMOOTH_FLOAT_MIN_OFFSET - 0.001)
})

it('exports smooth-float constants', () => {
  expect(SMOOTH_FLOAT_MIN_OFFSET).toBe(0.1)
  expect(SMOOTH_FLOAT_WINDOW).toBe(30)
})
