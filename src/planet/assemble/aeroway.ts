/** Runways, taxiways and aprons. A closed ring is draped; a centerline becomes a road group. */
import type { MapFeature } from '../extract/contract.js'
import { clipSegment } from '../../math/planar/polygon.js'
import { createEntity } from '../../entity/schema.js'
import type { Vec3Tuple } from '../../math/frame/vectors.js'
import { drapeLandcoverPolygon } from '../land/drape.js'
import { type District, metric } from './district.js'

export function emitAeroway(d: District, f: MapFeature): boolean {
  const tags = f.tags
  if (!(tags.aeroway === 'runway' || tags.aeroway === 'taxiway' || tags.aeroway === 'apron'))
    return false
  const ring = f.rings[0]
  if (!ring) return true
  const closed =
    ring.coordinates.length >= 4 &&
    Math.hypot(
      ring.coordinates[0][0] - ring.coordinates.at(-1)![0],
      ring.coordinates[0][1] - ring.coordinates.at(-1)![1],
    ) < 1e-5
  const color =
    tags.aeroway === 'runway' ? '#2c3034' : tags.aeroway === 'taxiway' ? '#3c4146' : '#4a4f54'
  if (closed) {
    const rings = f.rings.map((r) => ({ ...r, points: r.coordinates.map(d.project) }))
    if (rings.some((r) => r.points.length < 4)) return true
    const geometry = drapeLandcoverPolygon(rings, d.data.terrain, 0.08)
    for (let first = 0; first < geometry.faces.length; first += 600) {
      const vertices: Vec3Tuple[] = []
      const seen = new Map<string, number>()
      const faces = geometry.faces.slice(first, first + 600).map((face) =>
        face.map((index) => {
          const point = geometry.vertices[index]
          const key = point.join(',')
          let local = seen.get(key)
          if (local === undefined) {
            local = vertices.length
            vertices.push(point)
            seen.set(key, local)
          }
          return local
        }),
      )
      const e = createEntity('osm-' + f.id.replace('/', '-') + '-aeroway-' + first / 600, 'solid')
      e.name = tags.name ?? tags.aeroway
      e.geometry = { vertices, edges: [], faces }
      e.color = color
      e.source = d.source(f)
      d.entities.push(e)
    }
  } else {
    const width = Math.min(80, Math.max(8, metric(tags.width, tags.aeroway === 'runway' ? 45 : 18)))
    const paths: Vec3Tuple[][] = []
    for (const part of f.rings) {
      const points = part.coordinates.map(d.project)
      for (let i = 1; i < points.length; i++) {
        const segment = clipSegment(points[i - 1], points[i], d.half, d.depth)
        if (segment) paths.push(segment)
      }
    }
    if (!paths.length) return true
    const e = createEntity('osm-' + f.id.replace('/', '-') + d.suffix, 'group')
    e.name = tags.name ?? tags.aeroway
    e.road = { paths, width, terrainId: d.terrain.id }
    e.color = color
    e.source = d.source(f)
    d.entities.push(e)
  }
  return true
}
