/**
 * Safe ground detection for vehicle spawning.
 *
 * When the spawn position has no terrain data (e.g., in a river or ocean),
 * this module searches outward in rings to find a valid ground position
 * where the vehicle footprint has stable terrain.
 */

import type { Vec3Tuple } from '../src/entity/schema.js'

/** 8-point footprint directions at 45° increments */
const FOOTPRINT_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (deg * Math.PI) / 180)

/** Default footprint radius in meters (covers vehicle width/length) */
export const FOOTPRINT_RADIUS = 7

/** Maximum ground height variance within footprint (meters) */
export const FOOTPRINT_TOLERANCE = 2

/** Ring search step size in meters */
export const RING_STEP = 5

/** Maximum search radius in meters */
export const MAX_SEARCH_RADIUS = 400

export interface SafeGroundResult {
  found: boolean
  position: Vec3Tuple
  groundHeight: number
  searchRadius: number
}

/**
 * Check if a position has valid ground with a stable footprint.
 *
 * @param groundHeightFn Function that returns ground height at a position, or undefined if no ground
 * @param center Center position [x, y, z]
 * @param footprintRadius Radius to check around the center (default: 7m)
 * @param tolerance Maximum height variance allowed (default: 2m)
 * @returns Ground height if valid, undefined if footprint is unstable or missing ground
 */
export function checkFootprint(
  groundHeightFn: (position: Vec3Tuple) => number | undefined,
  center: Vec3Tuple,
  footprintRadius: number = FOOTPRINT_RADIUS,
  tolerance: number = FOOTPRINT_TOLERANCE,
): number | undefined {
  const centerHeight = groundHeightFn(center)
  if (centerHeight === undefined) return undefined

  let minHeight = centerHeight
  let maxHeight = centerHeight

  for (const angle of FOOTPRINT_ANGLES) {
    const x = center[0] + Math.cos(angle) * footprintRadius
    const z = center[2] + Math.sin(angle) * footprintRadius
    const height = groundHeightFn([x, center[1], z])

    if (height === undefined) return undefined

    minHeight = Math.min(minHeight, height)
    maxHeight = Math.max(maxHeight, height)

    if (maxHeight - minHeight > tolerance) {
      return undefined
    }
  }

  return (minHeight + maxHeight) / 2
}

/**
 * Search outward in rings to find a position with stable ground.
 *
 * The search starts at the spawn position and expands in rings with the given step size.
 * Each ring tests 8 evenly-spaced positions. At each candidate, we verify that the center
 * AND 8 points at footprintRadius all have ground within the tolerance.
 *
 * @param groundHeightFn Function that returns ground height at a position, or undefined if no ground
 * @param spawnLocalPos Starting position [x, y, z]
 * @param options Search parameters
 * @returns Result with found position and height, or found=false if no ground within max radius
 */
export function findNearestGround(
  groundHeightFn: (position: Vec3Tuple) => number | undefined,
  spawnLocalPos: Vec3Tuple,
  options: {
    ringStep?: number
    maxRadius?: number
    footprintRadius?: number
    tolerance?: number
  } = {},
): SafeGroundResult {
  const {
    ringStep = RING_STEP,
    maxRadius = MAX_SEARCH_RADIUS,
    footprintRadius = FOOTPRINT_RADIUS,
    tolerance = FOOTPRINT_TOLERANCE,
  } = options

  const notFound: SafeGroundResult = {
    found: false,
    position: spawnLocalPos,
    groundHeight: 0,
    searchRadius: maxRadius,
  }

  const groundAtSpawn = checkFootprint(groundHeightFn, spawnLocalPos, footprintRadius, tolerance)
  if (groundAtSpawn !== undefined) {
    return {
      found: true,
      position: spawnLocalPos,
      groundHeight: groundAtSpawn,
      searchRadius: 0,
    }
  }

  for (let radius = ringStep; radius <= maxRadius; radius += ringStep) {
    const numPoints = Math.max(8, Math.floor((2 * Math.PI * radius) / ringStep))

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI
      const x = spawnLocalPos[0] + Math.cos(angle) * radius
      const z = spawnLocalPos[2] + Math.sin(angle) * radius
      const candidate: Vec3Tuple = [x, spawnLocalPos[1], z]

      const groundHeight = checkFootprint(groundHeightFn, candidate, footprintRadius, tolerance)
      if (groundHeight !== undefined) {
        return {
          found: true,
          position: candidate,
          groundHeight,
          searchRadius: radius,
        }
      }
    }
  }

  return notFound
}

/**
 * Build a local ground height function from the world's groundHeight method.
 * This adapts the PlanetWorld.groundHeight signature for use with findNearestGround.
 */
export function makeGroundHeightFn(
  worldGroundHeight: (position: Vec3Tuple) => number | undefined,
): (position: Vec3Tuple) => number | undefined {
  return worldGroundHeight
}
