/**
 * Drape a polygon onto the heightfield.
 *
 * Outer rings are filled. An inner ring becomes a hole only when it starts inside that outer ring.
 * Each triangle is clipped to the terrain the same way a road is, then dropped by `offset` metres.
 */
import { ShapeUtils, Vector2 } from 'three'
import { drapeRoad } from './roads/draped-road.js'
import type { Vec3Tuple } from '../../math/frame/vectors.js'
import type { SolidGeometry } from '../../math/solid/mesh.js'
import type { TerrainData } from './terrain.js'

export function drapeLandcoverPolygon(
  rings: { role: string; points: Vec3Tuple[] }[],
  terrain: TerrainData,
  offset = 0.015,
): SolidGeometry {
  const result: SolidGeometry = { vertices: [], edges: [], faces: [] }
  const clean = (points: Vec3Tuple[]) => {
    const out = points.map((p) => new Vector2(p[0], p[2]))
    if (out.length > 1 && out[0].distanceTo(out[out.length - 1]) < 0.001) out.pop()
    return out.filter((p, i) => i === 0 || p.distanceTo(out[i - 1]) > 0.001)
  }
  const contains = (ring: Vector2[], p: Vector2) => {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i],
        b = ring[j]
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
        inside = !inside
    }
    return inside
  }
  const closed = (points: Vec3Tuple[]) =>
    points.length >= 4 &&
    Math.hypot(points[0][0] - points.at(-1)![0], points[0][2] - points.at(-1)![2]) < 0.001
  const holes = rings
    .filter((r) => r.role === 'inner' && closed(r.points))
    .map((r) => clean(r.points))
  for (const outer of rings.filter((r) => r.role !== 'inner' && closed(r.points))) {
    const contour = clean(outer.points)
    if (contour.length < 3) continue
    const inner = holes.filter((h) => h.length >= 3 && contains(contour, h[0]))
    const vertices = [contour, ...inner].flat()
    for (const face of ShapeUtils.triangulateShape(contour, inner)) {
      const patch = drapeRoad(
        terrain,
        face.map((i) => [vertices[i].x, 0, vertices[i].y]),
        offset,
      )
      const base = result.vertices.length
      for (const v of patch.vertices) result.vertices.push(v)
      for (const f of patch.faces) result.faces.push(f.map((i) => i + base).reverse())
    }
  }
  return result
}
