import { ShapeUtils, Vector2 } from 'three'

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
/** Assign each courtyard to its smallest containing outer ring, exactly once.
 * Applying every hole to every outer creates repeated walls and crossed roof caps. */
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
