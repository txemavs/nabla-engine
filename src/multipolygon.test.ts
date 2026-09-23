import { describe, it, expect } from 'vitest'
import {
  assembleMultipolygonRings,
  pointInPolygon,
  associateHoles,
  type WayGeometry,
} from './multipolygon.js'

describe('assembleMultipolygonRings', () => {
  it('passes through already-closed ways unchanged', () => {
    const ways: WayGeometry[] = [
      {
        role: 'outer',
        ref: 1,
        geometry: [
          { lat: 0, lon: 0 },
          { lat: 0, lon: 1 },
          { lat: 1, lon: 1 },
          { lat: 1, lon: 0 },
          { lat: 0, lon: 0 },
        ],
      },
    ]
    const result = assembleMultipolygonRings(ways)
    expect(result.rings).toHaveLength(1)
    expect(result.rings[0].role).toBe('outer')
    expect(result.rings[0].coordinates).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ])
    expect(result.incomplete).toHaveLength(0)
    expect(result.skipped).toBe(0)
  })

  it('joins two ways at shared endpoint to form closed ring', () => {
    const ways: WayGeometry[] = [
      {
        role: 'outer',
        ref: 1,
        geometry: [
          { lat: 0, lon: 0 },
          { lat: 0, lon: 1 },
          { lat: 1, lon: 1 },
        ],
      },
      {
        role: 'outer',
        ref: 2,
        geometry: [
          { lat: 1, lon: 1 },
          { lat: 1, lon: 0 },
          { lat: 0, lon: 0 },
        ],
      },
    ]
    const result = assembleMultipolygonRings(ways)
    expect(result.rings).toHaveLength(1)
    expect(result.rings[0].role).toBe('outer')
    expect(result.rings[0].coordinates).toHaveLength(5)
    expect(result.incomplete).toHaveLength(0)
  })

  it('joins ways in reverse direction when needed', () => {
    const ways: WayGeometry[] = [
      {
        role: 'outer',
        ref: 1,
        geometry: [
          { lat: 0, lon: 0 },
          { lat: 0, lon: 1 },
        ],
      },
      {
        role: 'outer',
        ref: 2,
        geometry: [
          { lat: 0, lon: 0 },
          { lat: 1, lon: 0 },
        ],
      },
      {
        role: 'outer',
        ref: 3,
        geometry: [
          { lat: 0, lon: 1 },
          { lat: 1, lon: 1 },
          { lat: 1, lon: 0 },
        ],
      },
    ]
    const result = assembleMultipolygonRings(ways)
    expect(result.rings).toHaveLength(1)
    expect(result.incomplete).toHaveLength(0)
  })

  it('handles inner rings separately', () => {
    const ways: WayGeometry[] = [
      {
        role: 'outer',
        ref: 1,
        geometry: [
          { lat: 0, lon: 0 },
          { lat: 0, lon: 10 },
          { lat: 10, lon: 10 },
          { lat: 10, lon: 0 },
          { lat: 0, lon: 0 },
        ],
      },
      {
        role: 'inner',
        ref: 2,
        geometry: [
          { lat: 2, lon: 2 },
          { lat: 2, lon: 4 },
          { lat: 4, lon: 4 },
          { lat: 4, lon: 2 },
          { lat: 2, lon: 2 },
        ],
      },
    ]
    const result = assembleMultipolygonRings(ways)
    expect(result.rings).toHaveLength(2)
    expect(result.rings.filter((r) => r.role === 'outer')).toHaveLength(1)
    expect(result.rings.filter((r) => r.role === 'inner')).toHaveLength(1)
  })

  it('tracks incomplete rings when ways cannot be joined', () => {
    const ways: WayGeometry[] = [
      {
        role: 'outer',
        ref: 1,
        geometry: [
          { lat: 0, lon: 0 },
          { lat: 0, lon: 1 },
        ],
      },
      {
        role: 'outer',
        ref: 2,
        geometry: [
          { lat: 5, lon: 5 },
          { lat: 5, lon: 6 },
        ],
      },
    ]
    const result = assembleMultipolygonRings(ways)
    expect(result.rings).toHaveLength(0)
    expect(result.incomplete).toContain(1)
    expect(result.incomplete).toContain(2)
  })

  it('skips ways with no geometry', () => {
    const ways: WayGeometry[] = [
      {
        role: 'outer',
        ref: 1,
        geometry: [],
      },
      {
        role: 'outer',
        ref: 2,
        geometry: [
          { lat: 0, lon: 0 },
          { lat: 0, lon: 1 },
          { lat: 1, lon: 1 },
          { lat: 1, lon: 0 },
          { lat: 0, lon: 0 },
        ],
      },
    ]
    const result = assembleMultipolygonRings(ways)
    expect(result.rings).toHaveLength(1)
    expect(result.skipped).toBe(1)
  })

  it('salvages complete rings when some ways are missing', () => {
    const ways: WayGeometry[] = [
      {
        role: 'outer',
        ref: 1,
        geometry: [
          { lat: 0, lon: 0 },
          { lat: 0, lon: 5 },
          { lat: 5, lon: 5 },
          { lat: 5, lon: 0 },
          { lat: 0, lon: 0 },
        ],
      },
      {
        role: 'outer',
        ref: 2,
        geometry: [
          { lat: 10, lon: 10 },
          { lat: 10, lon: 11 },
        ],
      },
    ]
    const result = assembleMultipolygonRings(ways)
    expect(result.rings).toHaveLength(1)
    expect(result.incomplete).toContain(2)
  })
})

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

describe('associateHoles', () => {
  it('associates inner ring with containing outer', () => {
    const outer: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]
    const inner: [number, number][] = [
      [2, 2],
      [4, 2],
      [4, 4],
      [2, 4],
      [2, 2],
    ]
    const result = associateHoles([outer], [inner])
    expect(result).toHaveLength(1)
    expect(result[0].holes).toHaveLength(1)
    expect(result[0].holes[0]).toEqual(inner)
  })

  it('handles multiple outers with separate holes', () => {
    const outer1: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]
    const outer2: [number, number][] = [
      [20, 0],
      [30, 0],
      [30, 10],
      [20, 10],
      [20, 0],
    ]
    const hole1: [number, number][] = [
      [2, 2],
      [4, 2],
      [4, 4],
      [2, 4],
      [2, 2],
    ]
    const hole2: [number, number][] = [
      [22, 2],
      [24, 2],
      [24, 4],
      [22, 4],
      [22, 2],
    ]
    const result = associateHoles([outer1, outer2], [hole1, hole2])
    expect(result).toHaveLength(2)
    expect(result[0].holes).toHaveLength(1)
    expect(result[1].holes).toHaveLength(1)
  })
})
