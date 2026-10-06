/**
 * Nearest drivable road centreline for the R reset ("recover") action.
 * Positions are metres in the simulation's local frame; only X/Z are compared.
 */

/** One road centreline in world X/Z. `OsmChartRoad` (navigation roads) satisfies this shape. */
export interface RoadCenterline {
  points: readonly { x: number; z: number }[]
  /** Carriageway width in metres. */
  width: number
}

export interface RoadSnap {
  x: number
  z: number
  /** Unit X/Z direction of the road segment at the snap point. */
  dx: number
  dz: number
  distance: number
  width: number
}

/** Default search radius; beyond this the reset just uprights the vehicle in place. */
export const ROAD_SNAP_MAX_DISTANCE = 400

/**
 * Closest point on any centreline within `maxDistance` of (x, z), or null.
 * Bounding boxes (`minX`… when present, as on OSM chart roads) skip far roads cheaply.
 */
export function nearestRoadPoint(
  x: number,
  z: number,
  roads: Iterable<RoadCenterline & Partial<Record<'minX' | 'maxX' | 'minZ' | 'maxZ', number>>>,
  maxDistance = ROAD_SNAP_MAX_DISTANCE,
): RoadSnap | null {
  let best: RoadSnap | null = null
  for (const road of roads) {
    const limit = best ? best.distance : maxDistance
    if (
      road.minX !== undefined &&
      (x < road.minX! - limit ||
        x > road.maxX! + limit ||
        z < road.minZ! - limit ||
        z > road.maxZ! + limit)
    )
      continue
    const pts = road.points
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1].x,
        az = pts[i - 1].z
      const sx = pts[i].x - ax,
        sz = pts[i].z - az
      const len2 = sx * sx + sz * sz
      if (len2 < 1e-4) continue
      const t = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / len2))
      const px = ax + sx * t,
        pz = az + sz * t
      const d = Math.hypot(x - px, z - pz)
      if (d <= maxDistance && (!best || d < best.distance)) {
        const len = Math.sqrt(len2)
        best = { x: px, z: pz, dx: sx / len, dz: sz / len, distance: d, width: road.width }
      }
    }
  }
  return best
}
