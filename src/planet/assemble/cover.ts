/** Landcover and water areas, draped on the heightfield and parented to their group. */
import type { MapFeature } from '../extract/contract.js'
import { createEntity } from '../../entity/schema.js'
import type { Vec3Tuple } from '../../math/frame/vectors.js'
import { drapeLandcoverPolygon } from '../land/drape.js'
import {
  classifySurface,
  isLandcoverFeature,
  isWaterFeature,
  SURFACE_COLORS,
  SURFACE_LAYERS,
} from '../land/surface.js'
import { type District } from './district.js'

export function emitCover(d: District, f: MapFeature): boolean {
  const tags = f.tags
  if (!isLandcoverFeature(tags)) return false
  const surface = classifySurface(tags)
  const isWater = isWaterFeature(tags)
  const rings = f.rings.map((r) => ({ ...r, points: r.coordinates.map(d.project) }))
  if (!rings.length || rings.some((r) => r.points.length < 4)) return true
  // Clip into each tile, rather than assigning a whole polygon to its centroid.
  // Chunk the result to retain the editor's bounded solid topology.
  const geometry = drapeLandcoverPolygon(
    rings,
    d.data.terrain,
    0.005 + SURFACE_LAYERS[surface] * 0.002,
  )
  for (let first = 0; first < geometry.faces.length; first += 600) {
    const faces = geometry.faces.slice(first, first + 600)
    const vertices: Vec3Tuple[] = [],
      indices: number[][] = []
    const seen = new Map<string, number>()
    for (const face of faces)
      indices.push(
        face.map((i) => {
          const v = geometry.vertices[i],
            key = v.join(',')
          let index = seen.get(key)
          if (index === undefined) {
            index = vertices.length
            vertices.push(v)
            seen.set(key, index)
          }
          return index
        }),
      )
    const e = createEntity(`osm-${f.id.replace('/', '-')}-land${d.suffix}-${first / 600}`, 'solid')
    e.motion = 'none'
    e.geometry = { vertices, edges: [], faces: indices }
    e.name = tags.name ?? `${surface} · ${f.id}`
    e.color = SURFACE_COLORS[surface]
    e.parentId = isWater ? d.groups[4] : d.groups[3]
    e.source = d.source(f)
    e.landcover = { surface, isWater }
    d.entities.push(e)
  }
  return true
}
