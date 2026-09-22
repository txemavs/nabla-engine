import { expect, it } from 'vitest'
import { drapeLandcoverPolygon, createRealWorld, IRUN_VENTAS } from './real-world.js'
import { terrainHeight } from './terrain.js'
import { mapTileEntities } from './world-stream.js'
import { geoToLocal } from './geography.js'
import type { Vec3Tuple } from './scene.js'
const ring = (x0: number, z0: number, x1: number, z1: number, role = 'outer') => ({
  role,
  points: [
    [x0, 0, z0],
    [x1, 0, z0],
    [x1, 0, z1],
    [x0, 0, z1],
    [x0, 0, z0],
  ] as Vec3Tuple[],
})
it('clips large polygons to the tile and follows every terrain triangle', () => {
  const terrain = { columns: 3, rows: 3, spacing: 10, heights: [0, 2, 0, 3, 14, 1, 0, 2, 0] }
  const geometry = drapeLandcoverPolygon([ring(-100, -100, 100, 100)], terrain)
  expect(geometry.faces.length).toBeGreaterThan(4)
  for (const v of geometry.vertices) {
    expect(Math.abs(v[0])).toBeLessThanOrEqual(10)
    expect(Math.abs(v[2])).toBeLessThanOrEqual(10)
    expect(v[1]).toBeCloseTo(terrainHeight(terrain, v[0], v[2]) + 0.015, 3)
  }
  for (const f of geometry.faces) {
    const p = f.map((i) => geometry.vertices[i])
    const x = p.reduce((s, v) => s + v[0], 0) / 3,
      z = p.reduce((s, v) => s + v[2], 0) / 3
    expect(p.reduce((s, v) => s + v[1], 0) / 3).toBeCloseTo(terrainHeight(terrain, x, z) + 0.015, 3)
  }
})
it('assigns holes only to their containing outer ring and rejects open outlines', () => {
  const terrain = { columns: 5, rows: 5, spacing: 10, heights: Array(25).fill(0) }
  const g = drapeLandcoverPolygon(
    [ring(-18, -8, -2, 8), ring(2, -8, 18, 8), ring(-12, -2, -8, 2, 'inner')],
    terrain,
  )
  let area = 0
  for (const f of g.faces) {
    const [a, b, c] = f.map((i) => g.vertices[i])
    area += Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / 2
  }
  expect(area).toBeCloseTo(2 * 16 * 16 - 4 * 4, 2)
  const open = ring(-5, -5, 5, 5)
  open.points.pop()
  expect(drapeLandcoverPolygon([open], terrain).faces).toHaveLength(0)
})
it('keeps land visual-only, bounded and owned by streamed tiles with unique identities', () => {
  const coordinates: [number, number][] = [
    [-1.84, 43.31],
    [-1.79, 43.31],
    [-1.79, 43.35],
    [-1.84, 43.35],
    [-1.84, 43.31],
  ]
  expect(geoToLocal(IRUN_VENTAS, { ...IRUN_VENTAS, longitude: coordinates[0][0] })[0]).toBeLessThan(
    -600,
  )
  const data = {
    name: 'Land',
    origin: IRUN_VENTAS,
    source: { retrievedAt: 'test' },
    terrain: { columns: 13, rows: 13, spacing: 100, heights: Array(169).fill(0) },
    features: [
      { id: 'way/1', tags: { landuse: 'grass' }, rings: [{ role: 'outer', coordinates }] },
    ],
  }
  const a = createRealWorld(data),
    b = createRealWorld(data, { offset: [1200, 0], tileId: '1_0' })
  const land = mapTileEntities(a, '0_0').filter((e) => e.landcover)
  expect(land.length).toBeGreaterThan(0)
  expect(land.every((e) => e.motion === 'none' && e.geometry!.vertices.length <= 2048)).toBe(true)
  const ids = new Set(land.map((e) => e.id))
  const next = mapTileEntities(b, '1_0').filter((e) => e.landcover)
  expect(next.length).toBeGreaterThan(0)
  expect(next.every((e) => !ids.has(e.id))).toBe(true)
})
