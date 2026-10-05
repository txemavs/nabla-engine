import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  SEA_ALTITUDE,
  SEA_DEPTH_INSET,
  seaDepthPoint,
  seaRayDistance,
  seaSeenFromBelow,
} from '../../src/render/planet/ocean-sheet.js'
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

it('keeps the sea depth inset on the planet normal at every camera pitch', () => {
  const hit = new Vector3(120, 0, -40)
  const up = new Vector3(0, 1, 0)
  const depth = seaDepthPoint(hit, up)
  expect(SEA_DEPTH_INSET).toBeCloseTo(0.04, 6)
  expect(depth.y).toBeCloseTo(hit.y - SEA_DEPTH_INSET, 6)
  expect(depth.x).toBeCloseTo(hit.x, 6)
  expect(depth.z).toBeCloseTo(hit.z, 6)

  const pitches = [0, 0.4, 1.2, Math.PI / 2]
  const altitudeErrors = pitches.map((pitch) => {
    const viewDir = new Vector3(0, -Math.sin(pitch), -Math.cos(pitch))
    const radial = seaDepthPoint(hit, up).sub(hit).dot(up)
    const viewAxis = viewDir.multiplyScalar(-1.4).dot(up)
    return { pitch, radial, viewAxis }
  })
  for (const sample of altitudeErrors) {
    expect(sample.radial).toBeCloseTo(-SEA_DEPTH_INSET, 6)
  }
  expect(altitudeErrors[0].viewAxis).toBeCloseTo(0, 5)
  expect(altitudeErrors.at(-1)?.viewAxis).toBeCloseTo(1.4, 5)
})
