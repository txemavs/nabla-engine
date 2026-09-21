import type { Vec3Tuple } from './scene.js'
import type { SolidGeometry } from './solid.js'
import { terrainHeight, type TerrainData } from './terrain.js'
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
