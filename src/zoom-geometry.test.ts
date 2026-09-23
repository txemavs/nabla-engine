import { expect, test } from 'vitest'
import {
  clipTriangle,
  clusterTriangles,
  type Vertex,
} from '../services/world-cache/zoom-geometry.js'
const v = (x: number, z: number): Vertex => [x, 0, z, 0, 1, 0, 0.2, 0.4, 0.2]
test('clipping creates shared boundary coordinates and interpolates attributes', () => {
  const triangles = clipTriangle([v(-1, 0), v(2, 0), v(0, 2)], {
    west: 0,
    east: 1,
    north: 0,
    south: 1,
  })
  expect(triangles.length).toBeGreaterThan(0)
  for (const t of triangles)
    for (const p of t) {
      expect(p[0]).toBeGreaterThanOrEqual(0)
      expect(p[0]).toBeLessThanOrEqual(1)
      expect(p[2]).toBeGreaterThanOrEqual(0)
      expect(p[2]).toBeLessThanOrEqual(1)
      expect(p[4]).toBe(1)
    }
  expect(
    clipTriangle([v(-3, 0), v(-2, 0), v(-3, 1)], { west: 0, east: 1, north: 0, south: 1 }),
  ).toEqual([])
})
test('near mesh is lossless; distant mesh removes triangles and retains the outer border', () => {
  const input: Vertex[] = []
  for (let x = 0; x < 20; x++)
    for (let z = 0; z < 20; z++)
      input.push(v(x, z), v(x, z + 1), v(x + 1, z), v(x + 1, z), v(x, z + 1), v(x + 1, z + 1))
  const near = clusterTriangles(input, 0),
    far = clusterTriangles(input, 5)
  expect(near.indices.length).toBe(input.length)
  expect(near.indices.map((i) => near.vertices[i])).toEqual(input)
  expect(far.indices.length).toBeLessThan(input.length / 2)
  const border = input.filter((p) => p[0] === 0 || p[0] === 20 || p[2] === 0 || p[2] === 20)
  for (const point of border)
    expect(far.vertices.some((v) => v[0] === point[0] && v[2] === point[2])).toBe(true)
  expect(far.indices.every((i) => i >= 0 && i < far.vertices.length)).toBe(true)
})
