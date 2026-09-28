/** River and stream centerlines, drawn only where an area polygon does not already cover them. */
import type { MapFeature } from '../extract/contract.js'
import { clipSegment } from '../../math/planar/polygon.js'
import type { Vec3Tuple } from '../../math/frame/vectors.js'
import { roadGeometry } from '../land/roads/draped-road.js'
import { getWaterwayWidth, isWaterwayCenterline, SURFACE_COLORS } from '../land/surface.js'
import { type District } from './district.js'

export function emitWaterway(d: District, f: MapFeature): boolean {
  const tags = f.tags
  if (!isWaterwayCenterline(tags)) return false
  if (tags.tunnel && tags.tunnel !== 'no') return true
  // Fallback: render river/stream centerlines as extruded water ribbons
  // when no area polygon exists. Width uses OSM width tag or type defaults.
  const width = getWaterwayWidth(tags)
  const paths: Vec3Tuple[][] = []
  for (const ring of f.rings) {
    const points = ring.coordinates.map(d.project)
    for (let i = 1; i < points.length; i++) {
      const segment = clipSegment(points[i - 1], points[i], d.half, d.depth)
      if (segment) paths.push(segment)
    }
  }
  if (paths.length) {
    // Visual-only surface: never a driveable road or a rigid-body collider.
    const geometry = roadGeometry(d.data.terrain, paths, width)
    geometry.faces = geometry.faces.filter((face) => {
      const points = face.map((i) => geometry.vertices[i])
      return !d.coveredByWater([
        points.reduce((sum, p) => sum + p[0], 0) / points.length,
        points.reduce((sum, p) => sum + p[2], 0) / points.length,
      ])
    })
    // Area polygons take visual precedence at the remaining shore boundary.
    for (const v of geometry.vertices) v[1] -= 0.025
    d.addSurface(f, geometry, 'waterway', SURFACE_COLORS.water, d.groups[4])
  }
  return true
}
