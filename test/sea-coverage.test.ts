import { expect, it } from 'vitest'
import { seaCoverageIndex } from '../src/planet/sea-coverage.js'
const triangles = new Float32Array([
  0, 0.027, 0, 1, 0.027, 0, 0, 0.027, 1, 0, 15, 0, 1, 15, 0, 0, 15, 1,
])
it('removes coastal water triangles rather than moving another surface', () => {
  expect([
    ...seaCoverageIndex(triangles, undefined, { category: 'Surfaces', groundLayer: 11 })!,
  ]).toEqual([3, 4, 5])
})
it('removes flat zero terrain fill without deleting genuine below-zero terrain or dry land', () => {
  const p = new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -2, 0, 1, -2, 0, 0, -2, 1, 0, 4, 0, 1, 4, 0, 0, 4, 1,
  ])
  expect([...seaCoverageIndex(p, undefined, { category: 'Terrain', marineFill: true })!]).toEqual([
    3, 4, 5, 6, 7, 8,
  ])
  expect(seaCoverageIndex(p, undefined, { category: 'Terrain' })).toBeUndefined()
  expect(seaCoverageIndex(p, undefined, { category: 'Buildings' })).toBeUndefined()
})
