/**
 * Outer walls and courtyards of one OSM building way.
 *
 * Each courtyard attaches to the smallest outer ring that contains it, exactly once.
 * A hole applied to every outer would repeat walls and cross roof caps.
 * Contours are clockwise and holes are counter-clockwise, which is what the solid extruder expects.
 */
import { ShapeUtils, Vector2 } from 'three'

/** True when `p` is inside the ring or within 1 mm of an edge. */
function contains(ring: Vector2[], p: Vector2): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i]
    const dx = b.x - a.x,
      dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
    if (Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < 0.001) return true
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside
  }
  return inside
}

/** Group outer and inner rings into polygons. Rings shorter than three points are dropped. */
export function buildingRings(rings: { role: string; points: Vector2[] }[]) {
  const clean = (points: Vector2[]) => {
    const out: Vector2[] = []
    for (const p of points)
      if (!out.length || p.distanceTo(out[out.length - 1]) > 0.001) out.push(p.clone())
    if (out.length > 1 && out[0].distanceTo(out[out.length - 1]) < 0.001) out.pop()
    return out
  }
  const normalized = rings
    .map((r) => ({ role: r.role, points: clean(r.points) }))
    .filter((r) => r.points.length >= 3)
  const outers = normalized
    .filter((r) => r.role !== 'inner')
    .map((r) => ({ contour: r.points, holes: [] as Vector2[][] }))
  for (const inner of normalized.filter((r) => r.role === 'inner')) {
    const owner = outers
      .filter((outer) =>
        inner.points.every(
          (p, i) =>
            contains(outer.contour, p) &&
            contains(
              outer.contour,
              p
                .clone()
                .add(inner.points[(i + 1) % inner.points.length])
                .multiplyScalar(0.5),
            ),
        ),
      )
      .sort(
        (a, b) => Math.abs(ShapeUtils.area(a.contour)) - Math.abs(ShapeUtils.area(b.contour)),
      )[0]
    owner?.holes.push(inner.points)
  }
  for (const outer of outers) {
    if (!ShapeUtils.isClockWise(outer.contour)) outer.contour.reverse()
    for (const hole of outer.holes) if (ShapeUtils.isClockWise(hole)) hole.reverse()
  }
  return outers
}
