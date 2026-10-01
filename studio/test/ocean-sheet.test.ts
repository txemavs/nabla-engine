import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { SEA_ALTITUDE, seaRayDistance, seaSeenFromBelow } from '../../src/render/planet/ocean-sheet.js'
import { EARTH_RADIUS } from '../../src/math/geo/sphere.js'
it('hits the sea sphere out to the horizon and misses the sky', () => {
  expect(seaRayDistance(8, -1)).toBeCloseTo(8, 2)
  expect(seaRayDistance(8, 0)).toBeNull()
  expect(seaRayDistance(8, 0.2)).toBeNull()
  expect(seaRayDistance(50, -0.01)).toBeCloseTo(5213, 0)
  expect(seaRayDistance(10_000, -0.08)).toBeGreaterThan(100_000)
  expect(seaRayDistance(-10, 1)).toBeCloseTo(10, 2)
  expect(seaRayDistance(-10, -1)).toBeNull()
  expect(SEA_ALTITUDE).toBe(0)
  expect(EARTH_RADIUS).toBeGreaterThan(6_000_000)
})

it('treats the sea as seen from below only under the surface', () => {
  const above = new Vector3(0, 8, 0)
  expect(seaSeenFromBelow(above, 0, 0)).toBe(false)
  expect(seaSeenFromBelow(new Vector3(0, -40, 0), 0, 0)).toBe(true)
  expect(seaSeenFromBelow(new Vector3(0, -40, 0), 0, 50)).toBe(true)
  expect(seaSeenFromBelow(new Vector3(0, 8, 0), 0, 2)).toBe(false)
  const offshore = new Vector3(12000, 0, 0)
  const sunk = Math.sqrt((EARTH_RADIUS - 10) ** 2 - 12000 ** 2) - EARTH_RADIUS - 40
  expect(seaSeenFromBelow(new Vector3(12000, sunk, 0), 40, 0)).toBe(true)
  expect(seaSeenFromBelow(offshore, 0, 0)).toBe(false)
})
