/** OSM trees as upright sprites on the heightfield. */
import type { MapFeature } from '../extract/contract.js'
import { createEntity } from '../../stage/scene.js'
import { treeSprite } from '../../entity/sprite/sprite.js'
import { type District } from './district.js' 

export function emitTree(d: District, f: MapFeature): boolean {
  const tags = f.tags
  if (tags.natural !== 'tree') return false
  const p = d.project(f.rings[0].coordinates[0])
  if (!d.inside(p)) return true
  p[1] = d.height(p[0], p[2])
  const e = createEntity('osm-' + f.id.replace('/', '-'), 'group', p)
  e.name = 'Árbol OSM'
  e.sprite = treeSprite(0)
  e.size = [6, 6, 0.1]
  e.parentId = d.groups[2]
  e.source = d.source(f)
  d.entities.push(e)
  return true
}
