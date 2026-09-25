import type { Entity } from '../schema.js'

/** A road is a nonphysical group whose terrain id points at a terrain entity. */
export function validateRoad(entity: Entity, byId: Map<string, Entity>): void {
  if (!entity.road) return
  if (
    entity.kind !== 'group' ||
    entity.sprite ||
    entity.portal ||
    byId.get(entity.road.terrainId)?.kind !== 'terrain'
  )
    throw new Error('Roads require a group and terrain reference')
}
