import { createEntity, type Entity } from '../entity/schema.js'
import type { Vec3Tuple } from '../math/frame/vectors.js'

/** Neighbourhood globe on a thin pole. */
export function createGlobeLamp(id: string, position: Vec3Tuple, name: string): Entity {
  return {
    ...createEntity(id, 'box', position),
    name,
    color: '#6d7680',
    size: [0.12, 5, 0.12],
    light: {
      color: '#fff1d2',
      intensity: 280,
      distance: 16,
      enabled: true,
      nightOnly: true,
      shape: 'globe',
    },
  }
}
