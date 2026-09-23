import { it, expect } from 'vitest'
import { Vector3 } from 'three'
import { buildingRoofWithFaces } from './building-roof.js'
import { createRealWorld, IRUN_VENTAS } from './real-world.js'
it('gabled roof must not classify vertical gable ends as roof', () => {
  const g = buildingRoofWithFaces(
    {
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
      faces: [],
      edges: [],
    },
    { 'roof:shape': 'gabled' },
  )
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
