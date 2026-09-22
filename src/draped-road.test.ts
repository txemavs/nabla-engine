import { it, expect, describe } from 'vitest'
import {
  roadGeometry,
  roadHeightOffset,
  roadColliders,
  nearestRoadCenterline,
  LAYER_HEIGHT,
} from './draped-road.js'
import { terrainHeight } from './terrain.js'

describe('terrain-draped roads', () => {
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
})

describe('roadHeightOffset', () => {
  it('returns 0 for terrain-level roads', () => {
    expect(roadHeightOffset(undefined, undefined)).toBe(0)
    expect(roadHeightOffset('terrain', undefined)).toBe(0)
    expect(roadHeightOffset('terrain', 1)).toBe(0)
  })

  it('returns positive offset for bridges (default layer 1)', () => {
    expect(roadHeightOffset('bridge', undefined)).toBe(LAYER_HEIGHT)
    expect(roadHeightOffset('bridge', 1)).toBe(LAYER_HEIGHT)
    expect(roadHeightOffset('bridge', 2)).toBe(2 * LAYER_HEIGHT)
  })

  it('returns negative offset for tunnels (default layer -1)', () => {
    expect(roadHeightOffset('tunnel', undefined)).toBe(-LAYER_HEIGHT)
    expect(roadHeightOffset('tunnel', -1)).toBe(-LAYER_HEIGHT)
    expect(roadHeightOffset('tunnel', -2)).toBe(-2 * LAYER_HEIGHT)
  })
})

describe('elevated road geometry', () => {
  const terrain = { columns: 5, rows: 5, spacing: 20, heights: Array(25).fill(10) }
  const paths = [
    [
      [-30, 0, 0],
      [30, 0, 0],
    ] as [number, number, number][],
  ]

  it('places bridge geometry above terrain height', () => {
    const g = roadGeometry(terrain, paths, 6, { elevation: 'bridge', layer: 1 })
    expect(g.faces.length).toBeGreaterThan(0)
    const avgY = g.vertices.reduce((s, v) => s + v[1], 0) / g.vertices.length
    expect(avgY).toBeGreaterThan(10 + LAYER_HEIGHT - 1)
    expect(avgY).toBeLessThan(10 + LAYER_HEIGHT + 1)
  })

  it('does not render tunnels through uncut terrain', () => {
    expect(roadGeometry(terrain, paths, 6, { elevation: 'tunnel', layer: -1 }).faces).toHaveLength(
      0,
    )
  })
})

describe('roadColliders', () => {
  const terrain = { columns: 5, rows: 5, spacing: 20, heights: Array(25).fill(0) }

  it('returns empty array for terrain-level roads', () => {
    const paths = [
      [
        [-20, 0, 0],
        [20, 0, 0],
      ] as [number, number, number][],
    ]
    expect(roadColliders(terrain, paths, 6)).toHaveLength(0)
    expect(roadColliders(terrain, paths, 6, { elevation: 'terrain' })).toHaveLength(0)
  })

  it('returns colliders for bridge roads', () => {
    const paths = [
      [
        [-20, 0, 0],
        [20, 0, 0],
      ] as [number, number, number][],
    ]
    const colliders = roadColliders(terrain, paths, 6, { elevation: 'bridge' })
    expect(colliders.length).toBeGreaterThan(0)
    expect(colliders[0].position[1] + 0.15).toBeCloseTo(LAYER_HEIGHT + 0.035, 3)
  })

  it('defers tunnel collisions until terrain cutouts exist', () => {
    const paths = [
      [
        [-20, 0, 0],
        [20, 0, 0],
      ] as [number, number, number][],
    ]
    const colliders = roadColliders(terrain, paths, 6, { elevation: 'tunnel' })
    expect(colliders).toHaveLength(0)
  })

  it('creates colliders with correct orientation', () => {
    const pathsNS = [
      [
        [0, 0, -20],
        [0, 0, 20],
      ] as [number, number, number][],
    ]
    const collidersNS = roadColliders(terrain, pathsNS, 6, { elevation: 'bridge' })
    expect(collidersNS.length).toBe(1)
    expect(Math.abs(collidersNS[0].yaw % Math.PI)).toBeCloseTo(0, 2)

    const pathsEW = [
      [
        [-20, 0, 0],
        [20, 0, 0],
      ] as [number, number, number][],
    ]
    const collidersEW = roadColliders(terrain, pathsEW, 6, { elevation: 'bridge' })
    expect(Math.abs(collidersEW[0].yaw)).toBeCloseTo(Math.PI / 2, 2)
  })
})

describe('nearestRoadCenterline', () => {
  const roads = [
    {
      paths: [
        [
          [-50, 0, 0],
          [50, 0, 0],
        ] as [number, number, number][],
      ],
      width: 6,
    },
  ]

  it('returns null when no road is nearby', () => {
    expect(nearestRoadCenterline([0, 0, 100], roads, 20)).toBeNull()
  })

  it('returns distance and direction to centerline', () => {
    const result = nearestRoadCenterline([0, 0, 5], roads, 20)
    expect(result).not.toBeNull()
    expect(result!.distance).toBeCloseTo(5, 1)
    expect(result!.direction[2]).toBeCloseTo(-1, 2)
    expect(result!.onRoad).toBe(false)
  })

  it('marks position as onRoad when within width/2', () => {
    const result = nearestRoadCenterline([0, 0, 2], roads, 20)
    expect(result).not.toBeNull()
    expect(result!.onRoad).toBe(true)
  })

  it('handles point projection to segment ends', () => {
    const result = nearestRoadCenterline([60, 0, 5], roads, 100)
    expect(result).not.toBeNull()
    expect(result!.distance).toBeGreaterThan(10)
  })
})
