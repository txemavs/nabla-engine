/**
 * Planar geometry shared by roads, landcover and water.
 * Metres in the local frame. These tests do not know about OSM tags.
 */

/** Ray cast. A point on the boundary is outside. Callers that need the shore to count decide that themselves. */
export function pointInPolygon(point: [number, number], ring: [number, number][]): boolean {
  let inside = false
  const [x, y] = point
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

type Vec3 = [number, number, number]

/**
 * Clip a centre line to an axis-aligned box centred on the origin.
 * X and Z are limited to ±halfX and ±halfZ. Y is interpolated along the segment.
 * Returns null when the segment misses the box. The draper still clips the full width.
 */
export function clipSegment(a: Vec3, b: Vec3, halfX: number, halfZ: number): Vec3[] | null {
  let lo = 0,
    hi = 1
  for (const [axis, half] of [
    [0, halfX],
    [2, halfZ],
  ] as const) {
    const delta = b[axis] - a[axis]
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(a[axis]) > half) return null
      continue
    }
    const u = (-half - a[axis]) / delta,
      v = (half - a[axis]) / delta
    lo = Math.max(lo, Math.min(u, v))
    hi = Math.min(hi, Math.max(u, v))
    if (hi <= lo) return null
  }
  return [lo, hi].map((f) => a.map((value, i) => value + (b[i] - value) * f) as Vec3)
}
