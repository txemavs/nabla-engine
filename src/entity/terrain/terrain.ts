import type { Entity } from '../schema.js'

/** A terrain entity owns a static grid. The payload is illegal on any other kind. */
export function validateTerrain(entity: Entity): void {
  if (entity.kind === 'terrain') {
    if (
      !entity.terrain ||
      entity.terrain.heights.length !== entity.terrain.columns * entity.terrain.rows ||
      (entity.terrain.colors && entity.terrain.colors.length !== entity.terrain.heights.length) ||
      entity.motion === 'dynamic' ||
      entity.visual ||
      entity.surface
    )
      throw new Error('Invalid terrain grid')
  } else if (entity.terrain) throw new Error('Terrain requires a terrain entity')
}
