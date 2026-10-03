/**
 * Tests for safe ground detection and ring search.
 */

import { describe, it, expect } from 'vitest'
import {
  findNearestGround,
  checkFootprint,
  FOOTPRINT_RADIUS,
  FOOTPRINT_TOLERANCE,
  RING_STEP,
  MAX_SEARCH_RADIUS,
} from '../../game/ground.js'
import type { Vec3Tuple } from '../../src/entity/schema.js'

describe('checkFootprint', () => {
  it('returns ground height when all points have valid ground within tolerance', () => {
    const groundFn = (pos: Vec3Tuple) => 10 + pos[0] * 0.01 + pos[2] * 0.01
    const center: Vec3Tuple = [0, 0, 0]

    const result = checkFootprint(groundFn, center, 7, 2)
    expect(result).toBeDefined()
    expect(result).toBeCloseTo(10, 0)
  })

  it('returns undefined when center has no ground', () => {
    const groundFn = (pos: Vec3Tuple): number | undefined => {
      if (pos[0] === 0 && pos[2] === 0) return undefined
      return 10
    }

    const result = checkFootprint(groundFn, [0, 0, 0], 7, 2)
    expect(result).toBeUndefined()
  })

  it('returns undefined when any footprint point has no ground', () => {
    const groundFn = (pos: Vec3Tuple): number | undefined => {
      // No ground to the east (positive X)
      if (pos[0] > 5) return undefined
      return 10
    }

    const result = checkFootprint(groundFn, [0, 0, 0], 7, 2)
    expect(result).toBeUndefined()
  })

  it('returns undefined when height variance exceeds tolerance (sliver edge)', () => {
    const groundFn = (pos: Vec3Tuple): number | undefined => {
      // River bank: steep drop at x > 3
      if (pos[0] > 3) return -5
      return 10
    }

    const result = checkFootprint(groundFn, [0, 0, 0], 7, 2)
    expect(result).toBeUndefined()
  })

  it('accepts gentle slopes within tolerance', () => {
    const groundFn = (pos: Vec3Tuple) => 10 + pos[0] * 0.1 // 0.7m rise over 7m
    const center: Vec3Tuple = [0, 0, 0]

    const result = checkFootprint(groundFn, center, 7, 2)
    expect(result).toBeDefined()
  })
})

describe('findNearestGround', () => {
  it('returns immediately if spawn has valid ground', () => {
    const groundFn = () => 15

    const result = findNearestGround(groundFn, [0, 0, 0])
    expect(result.found).toBe(true)
    expect(result.position).toEqual([0, 0, 0])
    expect(result.groundHeight).toBeCloseTo(15, 1)
    expect(result.searchRadius).toBe(0)
  })

  it('searches outward when spawn has no ground', () => {
    const groundFn = (pos: Vec3Tuple): number | undefined => {
      // Hole at origin, ground available at radius >= 20
      const dist = Math.hypot(pos[0], pos[2])
      if (dist < 15) return undefined
      return 10
    }

    const result = findNearestGround(groundFn, [0, 0, 0])
    expect(result.found).toBe(true)
    expect(result.searchRadius).toBeGreaterThanOrEqual(15)
    expect(result.searchRadius).toBeLessThanOrEqual(30)
    expect(result.groundHeight).toBeCloseTo(10, 1)
  })

  it('finds ground on a river bank (hole with ground only on one side)', () => {
    const groundFn = (pos: Vec3Tuple): number | undefined => {
      // River channel: no ground for x in [-30, 40], banks outside
      // Banks have height around -45
      if (pos[0] >= -30 && pos[0] <= 40) return undefined
      return -45
    }

    const result = findNearestGround(groundFn, [0, 0, 0])
    expect(result.found).toBe(true)
    // Should find ground on the west bank (x < -30)
    expect(result.position[0]).toBeLessThan(-30 - FOOTPRINT_RADIUS)
    expect(result.groundHeight).toBeCloseTo(-45, 1)
  })

  it('rejects sliver edges that pass single-point but fail footprint', () => {
    const groundFn = (pos: Vec3Tuple): number | undefined => {
      // Thin sliver of ground at x = 50, with a cliff drop on one side
      const dist = Math.hypot(pos[0] - 50, pos[2])
      if (dist < 3) return 10 // Narrow strip
      if (pos[0] > 45 && pos[0] < 55) return -50 // Cliff
      if (pos[0] >= 55) return 10 // Stable ground further out
      return undefined
    }

    const result = findNearestGround(groundFn, [0, 0, 0])
    expect(result.found).toBe(true)
    // Should NOT find the sliver at x=50, should find stable ground further out
    expect(result.position[0]).toBeGreaterThanOrEqual(55 + FOOTPRINT_RADIUS)
  })

  it('returns found=false when no ground within max radius', () => {
    const groundFn = (): number | undefined => undefined

    const result = findNearestGround(groundFn, [0, 0, 0], { maxRadius: 100 })
    expect(result.found).toBe(false)
    expect(result.searchRadius).toBe(100)
  })

  it('respects custom search parameters', () => {
    let maxRadiusTested = 0
    const groundFn = (pos: Vec3Tuple): number | undefined => {
      maxRadiusTested = Math.max(maxRadiusTested, Math.hypot(pos[0], pos[2]))
      return undefined
    }

    findNearestGround(groundFn, [0, 0, 0], {
      ringStep: 10,
      maxRadius: 50,
    })

    expect(maxRadiusTested).toBeGreaterThanOrEqual(50)
    expect(maxRadiusTested).toBeLessThanOrEqual(60)
  })

  it('searches in all directions (8-point ring)', () => {
    const testedPositions: Vec3Tuple[] = []
    const groundFn = (pos: Vec3Tuple): number | undefined => {
      testedPositions.push([...pos])
      return undefined
    }

    findNearestGround(groundFn, [100, 50, 100], { maxRadius: 10, ringStep: 5 })

    // Should have tested multiple directions at each ring
    const atRing5 = testedPositions.filter(
      (p) => Math.abs(Math.hypot(p[0] - 100, p[2] - 100) - 5) < 1,
    )
    expect(atRing5.length).toBeGreaterThanOrEqual(8)
  })
})

describe('constants', () => {
  it('has expected default values', () => {
    expect(FOOTPRINT_RADIUS).toBe(7)
    expect(FOOTPRINT_TOLERANCE).toBe(2)
    expect(RING_STEP).toBe(5)
    expect(MAX_SEARCH_RADIUS).toBe(400)
  })
})
