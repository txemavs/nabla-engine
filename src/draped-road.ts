import clipping from 'polygon-clipping'
import { ShapeUtils, Vector2 } from 'three'
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
  const layerValue = Math.max(1, Math.abs(layer ?? 1)) * (elevation === 'bridge' ? 1 : -1)
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
export function drapeRoad(t: TerrainData, corners: Vec3Tuple[], offset = 0.035): SolidGeometry {
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
          const face = [polygon[0], polygon[i], polygon[i + 1]]
          if (Math.abs(side(face[0], face[1], face[2])) < 0.0001) continue
          const start = result.vertices.length
          for (const [px, pz] of face)
            result.vertices.push([
              Math.max(-hx, Math.min(hx, px)),
              terrainHeight(t, px, pz) + offset,
              Math.max(-hz, Math.min(hz, pz)),
            ])
          result.faces.push([start, start + 1, start + 2])
        }
      }
    }
  return result
}

export type RoadMode = 'raw' | 'smooth-float'
export const SMOOTH_FLOAT_MIN_OFFSET = 0.1
export const SMOOTH_FLOAT_WINDOW = 30

export interface RoadGeometryOptions {
  mode?: RoadMode
  elevation?: RoadElevation
  layer?: number
  profiled?: boolean
}

/** Retry only numerically degenerate boolean inputs at sub-millimetre precision.
 * This is a topology tolerance for coincident stroke edges, not terrain quantization. */
function unionRoadFootprints(footprints: clipping.Polygon[]): clipping.MultiPolygon {
  try {
    return clipping.union(footprints)
  } catch (original) {
    for (const scale of [1e5, 1e4]) {
      const clean = footprints.map((p) =>
        p.map((r) =>
          r.map(
            ([x, y]) =>
              [Math.round(x * scale) / scale, Math.round(y * scale) / scale] as [number, number],
          ),
        ),
      )
      try {
        return clipping.union(clean)
      } catch {
        /* Try the next topology tolerance. */
      }
    }
    throw original
  }
}

/** Generate road geometry that conforms to terrain or is elevated for bridges/tunnels. */
export function roadGeometry(
  t: TerrainData,
  paths: Vec3Tuple[][],
  width: number,
  options: RoadGeometryOptions = {},
): SolidGeometry {
  const { elevation, layer, profiled } = options
  const heightOffset = roadHeightOffset(elevation, layer)
  if (elevation === 'tunnel') return { vertices: [], edges: [], faces: [] }
  if (options.mode === 'smooth-float' && (!elevation || elevation === 'terrain'))
    return smoothFloatRoadGeometry(t, paths, width)
  const elevated = elevation === 'bridge'

  // Shared cross-sections keep deck seams continuous even on a slope or bend.
  const normals = new Map<string, [number, number][]>()
  const key = (p: Vec3Tuple) => `${p[0]},${p[2]}`
  for (const path of paths)
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        length = Math.hypot(b[0] - a[0], b[2] - a[2])
      if (length < 0.01) continue
      const normal: [number, number] = [(b[2] - a[2]) / length, -(b[0] - a[0]) / length]
      for (const p of [a, b]) {
        const list = normals.get(key(p)) ?? []
        list.push(normal)
        normals.set(key(p), list)
      }
    }
  const cross = (p: Vec3Tuple): [number, number] => {
    const ns = normals.get(key(p))!,
      first = ns[0]
    let x = 0,
      z = 0
    for (const n of ns) {
      const sign = n[0] * first[0] + n[1] * first[1] < 0 ? -1 : 1
      x += n[0] * sign
      z += n[1] * sign
    }
    const length = Math.hypot(x, z)
    x /= length
    z /= length
    const extent = width / 2 / Math.max(0.5, Math.abs(x * first[0] + z * first[1]))
    return [x * extent, z * extent]
  }
  const result: SolidGeometry = { vertices: [], edges: [], faces: [] }
  const footprints: clipping.Polygon[] = []
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
        const patch = elevatedRoadSegment(
          t,
          a,
          b,
          nx,
          nz,
          heightOffset,
          profiled,
          cross(a),
          cross(b),
        )
        const offset = result.vertices.length
        result.vertices.push(...patch.vertices)
        result.faces.push(...patch.faces.map((f) => f.map((v) => v + offset)))
      } else {
        const [ax, az] = cross(a),
          [bx, bz] = cross(b)
        footprints.push([
          [
            [a[0] + ax, a[2] + az],
            [a[0] - ax, a[2] - az],
            [b[0] - bx, b[2] - bz],
            [b[0] + bx, b[2] + bz],
            [a[0] + ax, a[2] + az],
          ],
        ])
      }
    }

  const joints = new Map<string, Vec3Tuple>()
  for (const path of paths) for (const p of path) joints.set(`${p[0]},${p[2]}`, p)
  for (const p of joints.values()) {
    if (!elevated) {
      const ns = normals.get(key(p))
      if (!ns) continue
      // Ordinary bends share a miter cross-section, so there is no cap to overlap.
      if (ns.length === 2 && Math.abs(ns[0][0] * ns[1][0] + ns[0][1] * ns[1][1]) > 0.5) continue
      const circle = Array.from(
        { length: 12 },
        (_, i) =>
          [
            p[0] + (Math.cos((i * Math.PI) / 6) * width) / 2,
            0,
            p[2] + (Math.sin((i * Math.PI) / 6) * width) / 2,
          ] as Vec3Tuple,
      )
      const ring = circle.map((p) => [p[0], p[2]] as [number, number])
      ring.push(ring[0])
      footprints.push([ring])
    }
  }
  if (elevated) return result
  // Union caps and ribbons BEFORE draping/projection. Coplanar duplicates become
  // slightly different curved triangles after planet projection and flicker.
  if (footprints.length)
    for (const polygon of unionRoadFootprints(footprints)) {
      const rings = polygon.map((r) => r.slice(0, -1).map((p) => new Vector2(p[0], p[1])))
      const vertices = rings.flat()
      for (const face of ShapeUtils.triangulateShape(rings[0], rings.slice(1))) {
        const points = face.map((i) => [vertices[i].x, 0, vertices[i].y] as Vec3Tuple)
        if (
          side(
            [points[0][0], points[0][2]],
            [points[1][0], points[1][2]],
            [points[2][0], points[2][2]],
          ) > 0
        )
          points.reverse()
        const patch = drapeRoad(t, points),
          base = result.vertices.length
        result.vertices.push(...patch.vertices)
        result.faces.push(...patch.faces.map((f) => f.map((i) => i + base)))
      }
    }
  // Share clipping intersections without snapping the actual coordinates.
  const vertices: Vec3Tuple[] = [],
    seen = new Map<string, number>()
  const remap = result.vertices.map((p) => {
    const key = p.map((n) => Math.round(n * 1e7)).join(',')
    let index = seen.get(key)
    if (index === undefined) {
      index = vertices.length
      vertices.push(p)
      seen.set(key, index)
    }
    return index
  })
  result.vertices = vertices
  result.faces = result.faces
    .map((f) => f.map((i) => remap[i]))
    .filter((f) => new Set(f).size === f.length)
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
  profiled = false,
  crossA: [number, number] = [nx, nz],
  crossB: [number, number] = [nx, nz],
): SolidGeometry {
  const result: SolidGeometry = { vertices: [], edges: [], faces: [] }
  const hx = ((t.columns - 1) * t.spacing) / 2,
    hz = ((t.rows - 1) * t.spacing) / 2

  const clampedHeight = (x: number, z: number) => {
    const cx = Math.max(-hx, Math.min(hx, x))
    const cz = Math.max(-hz, Math.min(hz, z))
    return terrainHeight(t, cx, cz) + heightOffset
  }

  const heightA = profiled ? a[1] : clampedHeight(a[0], a[2])
  const heightB = profiled ? b[1] : clampedHeight(b[0], b[2])

  const corners: Vec3Tuple[] = [
    [a[0] + crossA[0], heightA + 0.035, a[2] + crossA[1]],
    [a[0] - crossA[0], heightA + 0.035, a[2] - crossA[1]],
    [b[0] - crossB[0], heightB + 0.035, b[2] - crossB[1]],
    [b[0] + crossB[0], heightB + 0.035, b[2] + crossB[1]],
  ]

  result.vertices.push(...corners)
  result.faces.push([0, 1, 2], [0, 2, 3])
  return result
}

/** Road collision box: position, size, and rotation (yaw angle). */
export interface RoadCollider {
  position: Vec3Tuple
  size: Vec3Tuple
  yaw: number
  pitch: number
}

/** Generate box colliders along the road centerline for bridges/tunnels.
 * This provides driveable surfaces for elevated roads. */
export function roadColliders(
  t: TerrainData,
  paths: Vec3Tuple[][],
  width: number,
  options: RoadGeometryOptions = {},
): RoadCollider[] {
  const { elevation, layer, profiled } = options
  if (elevation !== 'bridge') return []

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
      const heightA = profiled ? a[1] : clampedHeight(a[0], a[2])
      const heightB = profiled ? b[1] : clampedHeight(b[0], b[2])
      const pitch = Math.atan2(heightB - heightA, length)
      const midY = (heightA + heightB) / 2 + 0.035 - 0.15 / Math.cos(pitch)

      const yaw = Math.atan2(dx, -dz)

      colliders.push({
        position: [midX, midY, midZ],
        size: [width, 0.3, Math.hypot(length, heightB - heightA)],
        yaw,
        pitch,
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
  maxHeightDifference = Infinity,
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
        if (Math.abs(position[1] - (a[1] + t * (b[1] - a[1]))) > maxHeightDifference) continue
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

/** Conservative optional road deck. No discs, hidden boxes or terrain excavation.
 * A DEM triangle is affine: its maximum over a clipped road triangle occurs at
 * a clipping vertex. Raising both station ends above that maximum guarantees
 * clearance over the complete ribbon, including bumps between OSM nodes. */
export function smoothFloatRoadGeometry(
  t: TerrainData,
  paths: Vec3Tuple[][],
  width: number,
): SolidGeometry {
  const fallback = () => roadGeometry(t, paths, width)
  const chains: Vec3Tuple[][] = []
  const same = (a: Vec3Tuple, b: Vec3Tuple) => Math.hypot(a[0] - b[0], a[2] - b[2]) < 1e-6
  for (const path of paths) {
    if (path.length < 2) continue
    const last = chains.at(-1)
    if (last && same(last.at(-1)!, path[0])) last.push(...path.slice(1))
    else chains.push([...path])
  }
  const samples: Vec3Tuple[][] = []
  let count = 0
  for (const chain of chains) {
    // Closed rings need network-aware junction grading; preserve the raw surface.
    if (same(chain[0], chain.at(-1)!)) return fallback()
    const out: Vec3Tuple[] = [[chain[0][0], 0, chain[0][2]]]
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1],
        b = chain[i],
        length = Math.hypot(b[0] - a[0], b[2] - a[2])
      if (length < 0.01) continue
      const steps = Math.ceil(length / 5)
      if ((count += steps) > 4096) return fallback()
      for (let j = 1; j <= steps; j++)
        out.push([a[0] + ((b[0] - a[0]) * j) / steps, 0, a[2] + ((b[2] - a[2]) * j) / steps])
    }
    if (out.length > 1) samples.push(out)
  }
  const g = roadGeometry(t, samples, width, { elevation: 'bridge', profiled: true })
  const hx = ((t.columns - 1) * t.spacing) / 2,
    hz = ((t.rows - 1) * t.spacing) / 2
  let segment = 0
  for (const path of samples) {
    const floor = path.map(() => -Infinity),
      dist = [0]
    const firstSegment = segment
    for (let i = 1; i < path.length; i++, segment++) {
      dist.push(dist[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][2] - path[i - 1][2]))
      const corners = g.vertices.slice(segment * 4, segment * 4 + 4)
      if (corners.length !== 4) return fallback()
      let peak = -Infinity
      for (const f of [
        [0, 1, 2],
        [0, 2, 3],
      ]) {
        const [a, b, c] = f.map((k) => corners[k])
        if ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) <= 1e-6) return fallback()
        const patch = drapeRoad(
          t,
          f.map((k) => corners[k]),
          0,
        )
        for (const p of patch.vertices) peak = Math.max(peak, p[1])
      }
      for (const p of corners)
        peak = Math.max(
          peak,
          terrainHeight(t, Math.max(-hx, Math.min(hx, p[0])), Math.max(-hz, Math.min(hz, p[2]))),
        )
      const height = peak + SMOOTH_FLOAT_MIN_OFFSET + 0.002
      floor[i - 1] = Math.max(floor[i - 1], height)
      floor[i] = Math.max(floor[i], height)
    }
    // Sliding prefix sums keep smoothing linear even with densely sampled OSM nodes.
    const sums = [0]
    for (const value of floor) sums.push(sums.at(-1)! + value)
    let lo = 0,
      hi = 0
    const heights = floor.map((minimum, i) => {
      while (dist[i] - dist[lo] > SMOOTH_FLOAT_WINDOW) lo++
      while (hi + 1 < dist.length && dist[hi + 1] - dist[i] <= SMOOTH_FLOAT_WINDOW) hi++
      return Math.max(minimum, (sums[hi + 1] - sums[lo]) / (hi - lo + 1))
    })
    // Raise approaches instead of cutting into the terrain. Limit longitudinal grade to 15%.
    for (let i = 1; i < heights.length; i++)
      heights[i] = Math.max(heights[i], heights[i - 1] - (dist[i] - dist[i - 1]) * 0.15)
    for (let i = heights.length - 2; i >= 0; i--)
      heights[i] = Math.max(heights[i], heights[i + 1] - (dist[i + 1] - dist[i]) * 0.15)
    for (let i = 1; i < path.length; i++) {
      const base = (firstSegment + i - 1) * 4
      g.vertices[base][1] = g.vertices[base + 1][1] = heights[i - 1]
      g.vertices[base + 2][1] = g.vertices[base + 3][1] = heights[i]
    }
  }
  return g
}
