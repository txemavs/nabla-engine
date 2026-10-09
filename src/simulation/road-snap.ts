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

/** Grid cell size in metres for {@link RoadSegmentIndex}. */
const INDEX_CELL_M = 64

/**
 * Uniform-grid index over road segments, for per-tick queries (wheel surface every fixed
 * step) where a linear scan over thousands of OSM roads stalls the frame. `nearest` returns
 * the same point as {@link nearestRoadPoint} over the same roads; ties go to the segment the
 * linear scan would meet first.
 */
export class RoadSegmentIndex {
  readonly size: number
  private readonly ax: Float64Array
  private readonly az: Float64Array
  private readonly bx: Float64Array
  private readonly bz: Float64Array
  private readonly width: Float64Array
  private readonly cells = new Map<string, number[]>()
  private readonly stamp: Uint32Array
  private query = 0

  constructor(roads: Iterable<RoadCenterline>) {
    const segs: number[] = []
    for (const road of roads) {
      const pts = road.points
      for (let i = 1; i < pts.length; i++) {
        const sx = pts[i].x - pts[i - 1].x,
          sz = pts[i].z - pts[i - 1].z
        if (sx * sx + sz * sz < 1e-4) continue
        segs.push(pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z, road.width)
      }
    }
    const n = segs.length / 5
    this.size = n
    this.ax = new Float64Array(n)
    this.az = new Float64Array(n)
    this.bx = new Float64Array(n)
    this.bz = new Float64Array(n)
    this.width = new Float64Array(n)
    this.stamp = new Uint32Array(n)
    for (let s = 0; s < n; s++) {
      const ax = (this.ax[s] = segs[s * 5]),
        az = (this.az[s] = segs[s * 5 + 1]),
        bx = (this.bx[s] = segs[s * 5 + 2]),
        bz = (this.bz[s] = segs[s * 5 + 3])
      this.width[s] = segs[s * 5 + 4]
      const x0 = Math.floor(Math.min(ax, bx) / INDEX_CELL_M),
        x1 = Math.floor(Math.max(ax, bx) / INDEX_CELL_M),
        z0 = Math.floor(Math.min(az, bz) / INDEX_CELL_M),
        z1 = Math.floor(Math.max(az, bz) / INDEX_CELL_M)
      for (let cx = x0; cx <= x1; cx++)
        for (let cz = z0; cz <= z1; cz++) {
          const key = `${cx},${cz}`
          const cell = this.cells.get(key)
          if (cell) cell.push(s)
          else this.cells.set(key, [s])
        }
    }
  }

  nearest(x: number, z: number, maxDistance = ROAD_SNAP_MAX_DISTANCE): RoadSnap | null {
    if (!this.size || !Number.isFinite(x) || !Number.isFinite(z) || !(maxDistance >= 0)) return null
    if (++this.query === 0xffffffff) {
      this.stamp.fill(0)
      this.query = 1
    }
    const q = this.query
    let bestSeg = -1,
      bestD = Infinity,
      bestT = 0
    const x0 = Math.floor((x - maxDistance) / INDEX_CELL_M),
      x1 = Math.floor((x + maxDistance) / INDEX_CELL_M),
      z0 = Math.floor((z - maxDistance) / INDEX_CELL_M),
      z1 = Math.floor((z + maxDistance) / INDEX_CELL_M)
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const cell = this.cells.get(`${cx},${cz}`)
        if (!cell) continue
        for (const s of cell) {
          if (this.stamp[s] === q) continue
          this.stamp[s] = q
          const ax = this.ax[s],
            az = this.az[s]
          const sx = this.bx[s] - ax,
            sz = this.bz[s] - az
          const len2 = sx * sx + sz * sz
          const t = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / len2))
          const d = Math.hypot(x - (ax + sx * t), z - (az + sz * t))
          if (d <= maxDistance && (d < bestD || (d === bestD && s < bestSeg))) {
            bestSeg = s
            bestD = d
            bestT = t
          }
        }
      }
    if (bestSeg < 0) return null
    const ax = this.ax[bestSeg],
      az = this.az[bestSeg]
    const sx = this.bx[bestSeg] - ax,
      sz = this.bz[bestSeg] - az
    const len = Math.hypot(sx, sz)
    return {
      x: ax + sx * bestT,
      z: az + sz * bestT,
      dx: sx / len,
      dz: sz / len,
      distance: bestD,
      width: this.width[bestSeg],
    }
  }
}
