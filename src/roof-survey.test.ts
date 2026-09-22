import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { createRealWorld, type MapFeature } from './real-world.js'
import { faceNormal } from './solid.js'
const feature = JSON.parse(
  readFileSync(new URL('./roof-154094152.fixture.json', import.meta.url), 'utf8'),
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
