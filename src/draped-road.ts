import type { Vec3Tuple } from './scene.js'
import type { SolidGeometry } from './solid.js'
import { terrainHeight, type TerrainData } from './terrain.js'

export type RoadElevation = 'terrain' | 'bridge' | 'tunnel'

/** Height offset per layer for bridges/tunnels (metres). ~5 m is a typical road clearance. */
export const LAYER_HEIGHT = 5

/** Compute the height offset for an elevated road based on its type and layer.
 * Bridges sit above terrain; tunnels sit below (negative offset from terrain). */
export function roadHeightOffset(
  elevation: RoadElevation | undefined,
  layer: number | undefined,
): number {
  if (!elevation || elevation === 'terrain') return 0
  const layerValue = layer ?? (elevation === 'bridge' ? 1 : -1)
  return layerValue * LAYER_HEIGHT
}

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

export interface RoadGeometryOptions {
  elevation?: RoadElevation
  layer?: number
}

/** Generate road geometry that conforms to terrain or is elevated for bridges/tunnels. */
export function roadGeometry(
  t: TerrainData,
  paths: Vec3Tuple[][],
  width: number,
  options: RoadGeometryOptions = {},
): SolidGeometry {
  const { elevation, layer } = options
  const heightOffset = roadHeightOffset(elevation, layer)
  const elevated = elevation === 'bridge' || elevation === 'tunnel'

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

      if (elevated) {
        const patch = elevatedRoadSegment(t, a, b, nx, nz, heightOffset)
        const offset = result.vertices.length
        result.vertices.push(...patch.vertices)
        result.faces.push(...patch.faces.map((f) => f.map((v) => v + offset)))
      } else {
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
    }

  const joints = new Map<string, Vec3Tuple>()
  for (const path of paths) for (const p of path) joints.set(`${p[0]},${p[2]}`, p)
  for (const p of joints.values()) {
    if (elevated) {
      const patch = elevatedRoadJoint(t, p, width, heightOffset)
      const offset = result.vertices.length
      result.vertices.push(...patch.vertices)
      result.faces.push(...patch.faces.map((f) => f.map((v) => v + offset)))
    } else {
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
  }
  return result
}

/** Generate a flat road segment at terrain height + offset for bridges/tunnels. */
function elevatedRoadSegment(
  t: TerrainData,
  a: Vec3Tuple,
  b: Vec3Tuple,
  nx: number,
  nz: number,
  heightOffset: number,
): SolidGeometry {
  const result: SolidGeometry = { vertices: [], edges: [], faces: [] }
  const hx = ((t.columns - 1) * t.spacing) / 2,
    hz = ((t.rows - 1) * t.spacing) / 2

  const clampedHeight = (x: number, z: number) => {
    const cx = Math.max(-hx, Math.min(hx, x))
    const cz = Math.max(-hz, Math.min(hz, z))
    return terrainHeight(t, cx, cz) + heightOffset
  }

  const heightA = clampedHeight(a[0], a[2])
  const heightB = clampedHeight(b[0], b[2])
  const avgHeight = (heightA + heightB) / 2 + 0.035

  const corners: Vec3Tuple[] = [
    [
      Math.round((a[0] + nx) * 1000) / 1000,
      Math.round(avgHeight * 1000) / 1000,
      Math.round((a[2] + nz) * 1000) / 1000,
    ],
    [
      Math.round((a[0] - nx) * 1000) / 1000,
      Math.round(avgHeight * 1000) / 1000,
      Math.round((a[2] - nz) * 1000) / 1000,
    ],
    [
      Math.round((b[0] - nx) * 1000) / 1000,
      Math.round(avgHeight * 1000) / 1000,
      Math.round((b[2] - nz) * 1000) / 1000,
    ],
    [
      Math.round((b[0] + nx) * 1000) / 1000,
      Math.round(avgHeight * 1000) / 1000,
      Math.round((b[2] + nz) * 1000) / 1000,
    ],
  ]

  result.vertices.push(...corners)
  result.faces.push([0, 1, 2], [0, 2, 3])
  return result
}

/** Generate a circular joint at an elevated height for bridges/tunnels. */
function elevatedRoadJoint(
  t: TerrainData,
  p: Vec3Tuple,
  width: number,
  heightOffset: number,
): SolidGeometry {
  const result: SolidGeometry = { vertices: [], edges: [], faces: [] }
  const hx = ((t.columns - 1) * t.spacing) / 2,
    hz = ((t.rows - 1) * t.spacing) / 2

  const cx = Math.max(-hx, Math.min(hx, p[0]))
  const cz = Math.max(-hz, Math.min(hz, p[2]))
  const height = Math.round((terrainHeight(t, cx, cz) + heightOffset + 0.035) * 1000) / 1000

  const center: Vec3Tuple = [Math.round(p[0] * 1000) / 1000, height, Math.round(p[2] * 1000) / 1000]
  result.vertices.push(center)

  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6
    const x = Math.round((p[0] + (Math.cos(angle) * width) / 2) * 1000) / 1000
    const z = Math.round((p[2] + (Math.sin(angle) * width) / 2) * 1000) / 1000
    result.vertices.push([x, height, z])
  }

  for (let i = 0; i < 12; i++) {
    result.faces.push([0, 1 + i, 1 + ((i + 1) % 12)])
  }

  return result
}

/** Road collision box: position, size, and rotation (yaw angle). */
export interface RoadCollider {
  position: Vec3Tuple
  size: Vec3Tuple
  yaw: number
}

/** Generate box colliders along the road centerline for bridges/tunnels.
 * This provides driveable surfaces for elevated roads. */
export function roadColliders(
  t: TerrainData,
  paths: Vec3Tuple[][],
  width: number,
  options: RoadGeometryOptions = {},
): RoadCollider[] {
  const { elevation, layer } = options
  if (!elevation || elevation === 'terrain') return []

  const heightOffset = roadHeightOffset(elevation, layer)
  const colliders: RoadCollider[] = []
  const hx = ((t.columns - 1) * t.spacing) / 2,
    hz = ((t.rows - 1) * t.spacing) / 2

  const clampedHeight = (x: number, z: number) => {
    const cx = Math.max(-hx, Math.min(hx, x))
    const cz = Math.max(-hz, Math.min(hz, z))
    return terrainHeight(t, cx, cz) + heightOffset
  }

  for (const points of paths) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        dx = b[0] - a[0],
        dz = b[2] - a[2],
        length = Math.hypot(dx, dz)
      if (length < 0.01) continue

      const midX = (a[0] + b[0]) / 2
      const midZ = (a[2] + b[2]) / 2
      const heightA = clampedHeight(a[0], a[2])
      const heightB = clampedHeight(b[0], b[2])
      const midY = (heightA + heightB) / 2

      const yaw = Math.atan2(dx, -dz)

      colliders.push({
        position: [midX, midY, midZ],
        size: [width, 0.3, length],
        yaw,
      })
    }
  }

  return colliders
}

/** Find the nearest road centerline point and return distance + direction to it.
 * Used for vehicle snap-to-road assist. Returns null if no road is nearby. */
export function nearestRoadCenterline(
  position: Vec3Tuple,
  roads: { paths: Vec3Tuple[][]; width: number }[],
  maxDistance = 20,
): { distance: number; direction: Vec3Tuple; onRoad: boolean } | null {
  let nearest: { distance: number; direction: Vec3Tuple; onRoad: boolean } | null = null

  for (const road of roads) {
    for (const path of road.paths) {
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1],
          b = path[i]
        const dx = b[0] - a[0],
          dz = b[2] - a[2]
        const len = Math.hypot(dx, dz)
        if (len < 0.01) continue

        const t = Math.max(
          0,
          Math.min(1, ((position[0] - a[0]) * dx + (position[2] - a[2]) * dz) / (len * len)),
        )
        const closestX = a[0] + t * dx
        const closestZ = a[2] + t * dz

        const distX = position[0] - closestX
        const distZ = position[2] - closestZ
        const distance = Math.hypot(distX, distZ)

        if (distance < maxDistance && (!nearest || distance < nearest.distance)) {
          const onRoad = distance <= road.width / 2
          nearest = {
            distance,
            direction: distance > 0.01 ? [-distX / distance, 0, -distZ / distance] : [0, 0, 0],
            onRoad,
          }
        }
      }
    }
  }

  return nearest
}
