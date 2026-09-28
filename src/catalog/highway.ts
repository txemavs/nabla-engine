import { createEntity, type Entity } from '../entity/schema.js'
import type { Vec3Tuple } from '../math/frame/vectors.js'

/** Highway mast. The position is the head, not the ground contact. */
export function createHighwayLamp(id: string, position: Vec3Tuple, name: string): Entity {
  return {
    ...createEntity(id, 'box', position),
    name,
    color: '#6d7680',
    size: [0.24, 9, 0.24],
    light: { color: '#ffe0ad', intensity: 900, distance: 32, enabled: true, nightOnly: true },
  }
}
