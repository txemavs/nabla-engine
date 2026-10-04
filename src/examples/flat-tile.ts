import { createEntity, type Entity } from '../entity/schema.js'
import type { SceneDocument } from '../scene/document.js'

/** Synthetic ground, not a claim of land or measured bathymetry in the Gulf of Guinea. */
export const FLAT_TEST_TILES = Object.freeze([
  Object.freeze({ z: 15, x: 16383, y: 16383 }),
  Object.freeze({ z: 15, x: 16384, y: 16383 }),
  Object.freeze({ z: 15, x: 16383, y: 16384 }),
  Object.freeze({ z: 15, x: 16384, y: 16384 }),
])
export const FLAT_TEST_ORIGIN = Object.freeze({ latitude: 0, longitude: 0, altitude: 0 })
export const FLAT_TEST_BASE = '/examples/flat-z15'

/** Four adjoining tiles surround the spawn at (0,0), on the planet at sea level. */
export function createFlatTestScene(vehicle?: Entity): SceneDocument {
  const spawn = createEntity('spawn', 'spawn', [0, 2, 0])
  const entities = [spawn]
  if (vehicle) {
    const copy = structuredClone(vehicle)
    copy.transform.position = [0, 2, 0]
    entities.push(copy)
  }
  return {
    version: 1,
    name: 'Planetary vehicle test · Z15 0,0',
    geography: { ...FLAT_TEST_ORIGIN, imagery: 'offline', planetary: true },
    water: { mode: 'manual', level: 0, amplitude: 0 },
    sky: { mode: 'fixed', at: '2026-03-20T12:00:00.000Z' },
    entities,
  }
}
