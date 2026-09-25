/** OSM city, town and village labels. The point sits 20 m above the heightfield. */
import type { MapFeature } from '../extract/contract.js'
import { createEntity } from '../../stage/scene.js'
import { type District } from './district.js' 

export function emitPlace(d: District, f: MapFeature): boolean {
  const tags = f.tags
  if (!(tags.place && ['city', 'town', 'village'].includes(tags.place) && tags.name)) return false
  const coordinate = f.rings[0]?.coordinates[0]
  if (!coordinate) return true
  const p = d.project(coordinate)
  if (p[0] < -d.half || p[0] >= d.half || p[2] < -d.depth || p[2] >= d.depth) return true
  p[1] = d.height(p[0], p[2]) + 20
  const e = createEntity('osm-' + f.id.replace('/', '-'), 'group', p)
  e.name = tags.name.slice(0, 100)
  e.placeLabel = { text: e.name, category: tags.place as 'city' | 'town' | 'village' }
  e.motion = 'none'
  e.parentId = d.groups[6]
  e.source = d.source(f)
  d.entities.push(e)
  return true
}
