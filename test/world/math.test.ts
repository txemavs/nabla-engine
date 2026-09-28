import { describe, expect, it } from 'vitest'
import { clipSegment, pointInPolygon } from '../../src/math/planar/polygon.js'

describe('pointInPolygon', () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ]

  it('returns true for points inside', () => {
    expect(pointInPolygon([5, 5], square)).toBe(true)
    expect(pointInPolygon([1, 1], square)).toBe(true)
  })

  it('returns false for points outside', () => {
    expect(pointInPolygon([-1, 5], square)).toBe(false)
    expect(pointInPolygon([15, 5], square)).toBe(false)
    expect(pointInPolygon([5, -1], square)).toBe(false)
  })
})

describe('clipSegment', () => {
  it('keeps a segment that already sits inside the box', () => {
    expect(clipSegment([-1, 2, -1], [1, 4, 1], 10, 10)).toEqual([
      [-1, 2, -1],
      [1, 4, 1],
    ])
  })

  it('clips X and interpolates Y', () => {
    expect(clipSegment([-20, 0, 0], [20, 10, 0], 10, 10)).toEqual([
      [-10, 2.5, 0],
      [10, 7.5, 0],
    ])
  })

  it('returns null when the segment misses the box', () => {
    expect(clipSegment([20, 0, 0], [30, 0, 0], 10, 10)).toBeNull()
  })
})
