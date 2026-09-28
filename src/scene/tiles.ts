/**
 * Entities installed for one streamed tile, including children of its groups.
 * The origin tile `0_0` has no id suffix; every other tile appends `-${key}`.
 */
import type { Entity } from '../entity/schema.js'
import type { SceneDocument } from './document.js'

export function mapTileEntities(doc: SceneDocument, key: string): Entity[] {
  const suffix = key === '0_0' ? '' : `-${key}`
  const ids = new Set(
    [
      'world-terrain',
      'world-buildings',
      'world-roads',
      'world-trees',
      'world-landcover',
      'world-water',
      'world-railways',
      'world-places',
    ].map((id) => id + suffix),
  )
  const children = new Map<string, string[]>()
  for (const entity of doc.entities)
    if (entity.parentId) {
      const siblings = children.get(entity.parentId) ?? []
      siblings.push(entity.id)
      children.set(entity.parentId, siblings)
    }
  const queue = [...ids]
  for (let i = 0; i < queue.length; i++)
    for (const child of children.get(queue[i]) ?? [])
      if (!ids.has(child)) {
        ids.add(child)
        queue.push(child)
      }
  return doc.entities.filter((e) => ids.has(e.id))
}
