import type { Vec3Tuple } from './scene.js'
import type { SolidGeometry } from './solid.js'
import { terrainHeight, type TerrainData } from './terrain.js'

export type RoadMode = 'raw' | 'smooth-float'

/**
 * Minimum offset above the DEM for smooth-float roads, preventing z-fighting.
 * Chosen to be visible enough to avoid flickering but small enough to look natural.
 */
export const SMOOTH_FLOAT_MIN_OFFSET = 0.1

/**
 * Smoothing window radius in metres for longitudinal profile averaging.
 * Points within this distance contribute to the smoothed centreline height.
 */
export const SMOOTH_FLOAT_WINDOW = 30

type Point = [number, number]
const side = (a: Point, b: Point, p: Point) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
function clip(subject: Point[], triangle: Point[]): Point[] {
  let result = subject
  for (let e = 0; e < 3; e++) {
    const a = triangle[e],
      b = triangle[(e + 1) % 3],
      input = result
    result = []
    if (!input.length) break
    let previous = input[input.length - 1],
      ps = side(a, b, previous)
    for (const current of input) {
      const cs = side(a, b, current)
      if (cs >= 0 !== ps >= 0) {
        const f = ps / (ps - cs)
        result.push([
          previous[0] + (current[0] - previous[0]) * f,
          previous[1] + (current[1] - previous[1]) * f,
        ])
      }
      if (cs >= 0) result.push(current)
      previous = current
      ps = cs
    }
  }
  return result
}
/** Clip the road against actual terrain triangles: no gaps caused by a different tessellation. */
export function drapeRoad(t: TerrainData, corners: Vec3Tuple[]): SolidGeometry {
  const result: SolidGeometry = { vertices: [], edges: [], faces: [] },
    p = corners.map((v) => [v[0], v[2]] as Point)
  const hx = ((t.columns - 1) * t.spacing) / 2,
    hz = ((t.rows - 1) * t.spacing) / 2
  const x0 = Math.max(0, Math.floor((Math.min(...p.map((v) => v[0])) + hx) / t.spacing)),
    x1 = Math.min(t.columns - 2, Math.floor((Math.max(...p.map((v) => v[0])) + hx) / t.spacing))
  const z0 = Math.max(0, Math.floor((Math.min(...p.map((v) => v[1])) + hz) / t.spacing)),
    z1 = Math.min(t.rows - 2, Math.floor((Math.max(...p.map((v) => v[1])) + hz) / t.spacing))
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const a: Point = [x * t.spacing - hx, z * t.spacing - hz],
        b: Point = [a[0] + t.spacing, a[1]],
        c: Point = [a[0], a[1] + t.spacing],
        d: Point = [b[0], c[1]]
      for (const triangle of [
        [a, b, d],
        [a, d, c],
      ]) {
        const polygon = clip(p, triangle)
        for (let i = 1; i < polygon.length - 1; i++) {
          const face = [polygon[0], polygon[i], polygon[i + 1]].map(
            ([px, pz]) => [Math.round(px * 1000) / 1000, Math.round(pz * 1000) / 1000] as Point,
          )
          if (Math.abs(side(face[0], face[1], face[2])) < 0.0001) continue
          const start = result.vertices.length
          for (const [px, pz] of face)
            result.vertices.push([
              px,
              Math.round((terrainHeight(t, px, pz) + 0.035) * 1000) / 1000,
              pz,
            ])
          result.faces.push([start, start + 1, start + 2])
        }
      }
    }
  return result
}

export function roadGeometry(t: TerrainData, paths: Vec3Tuple[][], width: number): SolidGeometry {
  const result: SolidGeometry = { vertices: [], edges: [], faces: [] }
  for (const points of paths)
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        dx = b[0] - a[0],
        dz = b[2] - a[2],
        length = Math.hypot(dx, dz)
      if (length < 0.01) continue
      const nx = ((dz / length) * width) / 2,
        nz = ((-dx / length) * width) / 2
      const patch = drapeRoad(t, [
        [a[0] + nx, 0, a[2] + nz],
        [a[0] - nx, 0, a[2] - nz],
        [b[0] - nx, 0, b[2] - nz],
        [b[0] + nx, 0, b[2] + nz],
      ])
      const offset = result.vertices.length
      result.vertices.push(...patch.vertices)
      result.faces.push(...patch.faces.map((f) => f.map((v) => v + offset)))
    }
  const joints = new Map<string, Vec3Tuple>()
  for (const path of paths) for (const p of path) joints.set(`${p[0]},${p[2]}`, p)
  for (const p of joints.values()) {
    const circle = Array.from(
      { length: 12 },
      (_, i) =>
        [
          p[0] + (Math.cos((i * Math.PI) / 6) * width) / 2,
          0,
          p[2] + (Math.sin((i * Math.PI) / 6) * width) / 2,
        ] as Vec3Tuple,
    )
    const patch = drapeRoad(t, circle),
      offset = result.vertices.length
    result.vertices.push(...patch.vertices)
    result.faces.push(...patch.faces.map((f) => f.map((v) => v + offset)))
  }
  return result
}

/** Sample centreline heights along the path, collecting cumulative distance and DEM height. */
function sampleCentreline(
  t: TerrainData,
  paths: Vec3Tuple[][],
): { distance: number; height: number; x: number; z: number }[] {
  const hx = ((t.columns - 1) * t.spacing) / 2,
    hz = ((t.rows - 1) * t.spacing) / 2
  const samples: { distance: number; height: number; x: number; z: number }[] = []
  let totalDistance = 0

  for (const path of paths) {
    for (let i = 0; i < path.length; i++) {
      const [x, , z] = path[i]
      const clampedX = Math.max(-hx, Math.min(hx, x))
      const clampedZ = Math.max(-hz, Math.min(hz, z))
      const height = terrainHeight(t, clampedX, clampedZ)

      if (i > 0) {
        const prev = path[i - 1]
        totalDistance += Math.hypot(x - prev[0], z - prev[2])
      }

      samples.push({ distance: totalDistance, height, x, z })
    }
  }

  return samples
}

/**
 * Smooth centreline heights using a moving average within SMOOTH_FLOAT_WINDOW.
 * Returns a map from "x,z" to the smoothed height.
 */
function smoothCentrelineHeights(
  samples: { distance: number; height: number; x: number; z: number }[],
): Map<string, number> {
  const result = new Map<string, number>()

  for (let i = 0; i < samples.length; i++) {
    const current = samples[i]
    let weightSum = 0
    let heightSum = 0

    for (let j = 0; j < samples.length; j++) {
      const other = samples[j]
      const distDiff = Math.abs(other.distance - current.distance)
      if (distDiff <= SMOOTH_FLOAT_WINDOW) {
        const weight = 1 - distDiff / SMOOTH_FLOAT_WINDOW
        weightSum += weight
        heightSum += other.height * weight
      }
    }

    const smoothedHeight = weightSum > 0 ? heightSum / weightSum : current.height
    const key = `${current.x.toFixed(3)},${current.z.toFixed(3)}`
    result.set(key, smoothedHeight)
  }

  return result
}

/**
 * Interpolate smoothed centreline height for any point along the road.
 * Returns the height at the nearest centreline point.
 */
function interpolateSmoothedHeight(
  x: number,
  z: number,
  smoothedHeights: Map<string, number>,
  samples: { distance: number; height: number; x: number; z: number }[],
  t: TerrainData,
): number {
  const hx = ((t.columns - 1) * t.spacing) / 2,
    hz = ((t.rows - 1) * t.spacing) / 2

  let nearestDist = Infinity
  let nearestHeight = terrainHeight(
    t,
    Math.max(-hx, Math.min(hx, x)),
    Math.max(-hz, Math.min(hz, z)),
  )

  for (const sample of samples) {
    const dist = Math.hypot(x - sample.x, z - sample.z)
    if (dist < nearestDist) {
      nearestDist = dist
      const key = `${sample.x.toFixed(3)},${sample.z.toFixed(3)}`
      const smoothed = smoothedHeights.get(key)
      if (smoothed !== undefined) {
        nearestHeight = smoothed
      }
    }
  }

  return nearestHeight
}

/**
 * Generate smooth-float road geometry: longitudinally smoothed centreline,
 * laterally flat (roll ≈ 0), floating above the DEM to avoid z-fighting.
 *
 * Unlike raw draping, this produces a ribbon mesh that follows a smoothed profile
 * and maintains a flat cross-section, with collision matching the visual surface.
 */
export function smoothFloatRoadGeometry(
  t: TerrainData,
  paths: Vec3Tuple[][],
  width: number,
): SolidGeometry {
  const result: SolidGeometry = { vertices: [], edges: [], faces: [] }
  const hx = ((t.columns - 1) * t.spacing) / 2,
    hz = ((t.rows - 1) * t.spacing) / 2

  const samples = sampleCentreline(t, paths)
  const smoothedHeights = smoothCentrelineHeights(samples)

  for (const points of paths) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i]
      const dx = b[0] - a[0],
        dz = b[2] - a[2],
        length = Math.hypot(dx, dz)
      if (length < 0.01) continue

      const nx = ((dz / length) * width) / 2,
        nz = ((-dx / length) * width) / 2

      const getSmoothedHeight = (x: number, z: number) =>
        interpolateSmoothedHeight(x, z, smoothedHeights, samples, t)

      const heightA = getSmoothedHeight(a[0], a[2])
      const heightB = getSmoothedHeight(b[0], b[2])

      const demHeightALeft = terrainHeight(
        t,
        Math.max(-hx, Math.min(hx, a[0] + nx)),
        Math.max(-hz, Math.min(hz, a[2] + nz)),
      )
      const demHeightARight = terrainHeight(
        t,
        Math.max(-hx, Math.min(hx, a[0] - nx)),
        Math.max(-hz, Math.min(hz, a[2] - nz)),
      )
      const demHeightBLeft = terrainHeight(
        t,
        Math.max(-hx, Math.min(hx, b[0] + nx)),
        Math.max(-hz, Math.min(hz, b[2] + nz)),
      )
      const demHeightBRight = terrainHeight(
        t,
        Math.max(-hx, Math.min(hx, b[0] - nx)),
        Math.max(-hz, Math.min(hz, b[2] - nz)),
      )

      const floatHeightALeft = Math.max(heightA, demHeightALeft) + SMOOTH_FLOAT_MIN_OFFSET
      const floatHeightARight = Math.max(heightA, demHeightARight) + SMOOTH_FLOAT_MIN_OFFSET
      const floatHeightBLeft = Math.max(heightB, demHeightBLeft) + SMOOTH_FLOAT_MIN_OFFSET
      const floatHeightBRight = Math.max(heightB, demHeightBRight) + SMOOTH_FLOAT_MIN_OFFSET

      const flatHeightA = Math.max(floatHeightALeft, floatHeightARight)
      const flatHeightB = Math.max(floatHeightBLeft, floatHeightBRight)

      const start = result.vertices.length
      result.vertices.push(
        [
          Math.round((a[0] + nx) * 1000) / 1000,
          Math.round(flatHeightA * 1000) / 1000,
          Math.round((a[2] + nz) * 1000) / 1000,
        ],
        [
          Math.round((a[0] - nx) * 1000) / 1000,
          Math.round(flatHeightA * 1000) / 1000,
          Math.round((a[2] - nz) * 1000) / 1000,
        ],
        [
          Math.round((b[0] - nx) * 1000) / 1000,
          Math.round(flatHeightB * 1000) / 1000,
          Math.round((b[2] - nz) * 1000) / 1000,
        ],
        [
          Math.round((b[0] + nx) * 1000) / 1000,
          Math.round(flatHeightB * 1000) / 1000,
          Math.round((b[2] + nz) * 1000) / 1000,
        ],
      )
      result.faces.push([start, start + 1, start + 2], [start, start + 2, start + 3])
    }
  }

  const joints = new Map<string, Vec3Tuple>()
  for (const path of paths) for (const p of path) joints.set(`${p[0]},${p[2]}`, p)

  for (const p of joints.values()) {
    const centreHeight = interpolateSmoothedHeight(p[0], p[2], smoothedHeights, samples, t)

    const circle: Vec3Tuple[] = []
    let maxEdgeHeight = centreHeight
    for (let j = 0; j < 12; j++) {
      const angle = (j * Math.PI) / 6
      const edgeX = p[0] + (Math.cos(angle) * width) / 2
      const edgeZ = p[2] + (Math.sin(angle) * width) / 2
      const demHeight = terrainHeight(
        t,
        Math.max(-hx, Math.min(hx, edgeX)),
        Math.max(-hz, Math.min(hz, edgeZ)),
      )
      maxEdgeHeight = Math.max(maxEdgeHeight, demHeight)
      circle.push([edgeX, 0, edgeZ])
    }

    const flatHeight = maxEdgeHeight + SMOOTH_FLOAT_MIN_OFFSET
    const start = result.vertices.length
    const centre: Vec3Tuple = [
      Math.round(p[0] * 1000) / 1000,
      Math.round(flatHeight * 1000) / 1000,
      Math.round(p[2] * 1000) / 1000,
    ]
    result.vertices.push(centre)

    for (let j = 0; j < 12; j++) {
      result.vertices.push([
        Math.round(circle[j][0] * 1000) / 1000,
        Math.round(flatHeight * 1000) / 1000,
        Math.round(circle[j][2] * 1000) / 1000,
      ])
    }

    for (let j = 0; j < 12; j++) {
      result.faces.push([start, start + 1 + j, start + 1 + ((j + 1) % 12)])
    }
  }

  return result
}
