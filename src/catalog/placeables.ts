/**
 * Scenery a player or host can drop into a running game, next to vehicles: the Stargate portal,
 * the 2.5D gallery, a tree sprite and the two street lamps. Studio's add menu creates the same
 * entities at its 3D cursor; the game places them in front of the player.
 *
 * Every factory returns entities in a local placement frame: the origin is the ground contact
 * point, −Z points away from the player and +Y is up. `GameRuntime.placeEntities` turns that
 * frame by the player's heading and rests each top-level entity on the terrain under it,
 * keeping its local height above the ground.
 */
import { createEntity, type Entity } from '../entity/schema.js'
import { createPortal } from '../entity/portal/portal.js'
import { treeSprite } from '../entity/sprite/sprite.js'
import { createGallery } from '../examples/gallery.js'
import { createGlobeLamp } from './globe.js'
import { createHighwayLamp } from './highway.js'

export type PlaceableId = 'portal' | 'gallery' | 'sprite' | 'streetlight' | 'globe'

export interface PlaceableEntry {
  id: PlaceableId
  /** Spanish label shown in the game add menu. */
  label: string
  /** Metres ahead of the player (or of the occupied vehicle's nose) where it is placed. */
  ahead: number
}

/** Order of the game add menu, after the vehicle presets. */
export const placeables: readonly PlaceableEntry[] = [
  { id: 'portal', label: 'Portal', ahead: 4 },
  { id: 'gallery', label: 'Galería 2.5D', ahead: 2 },
  { id: 'sprite', label: 'Sprite', ahead: 6 },
  { id: 'streetlight', label: 'Farola de autopista', ahead: 4 },
  { id: 'globe', label: 'Farola de barrio', ahead: 3 },
]

export function hasPlaceable(id: string): id is PlaceableId {
  return placeables.some((entry) => entry.id === id)
}

export function placeable(id: string): PlaceableEntry {
  const entry = placeables.find((item) => item.id === id)
  if (!entry) throw new Error(`Unknown placeable: ${id}`)
  return entry
}

/**
 * A standalone Stargate mouth (the black `portal.frame.glb` frame with a tablet on its back),
 * closed and unlinked, with the aperture centred `h / 2` above the ground so the lower bar sits
 * below the surface and cars can drive through. Its front (+Z) faces the player.
 */
export function createPlaceablePortal(id: string, name = 'Portal'): Entity {
  const portal = createPortal(id)
  portal.name = name
  portal.transform.position = [0, portal.size[1] / 2, 0]
  return portal
}

/** Studio's "Sprite": the tree billboard, 7 m tall, standing on the ground. */
export function createPlaceableSprite(id: string, name = 'Sprite · árbol'): Entity {
  const sprite = createEntity(id, 'group', [0, 0, 0])
  sprite.name = name
  sprite.size = [7, 7, 0.1]
  sprite.sprite = treeSprite(0)
  return sprite
}

/**
 * `createGallery` moved so its window stands at the origin, facing the player. The stage (back
 * mouth, floor, backdrop, trees and moving targets) stays 139 m to the left.
 */
export function createPlaceableGallery(prefix: string): Entity[] {
  const entities = createGallery(prefix)
  const window = entities.find((e) => e.id === `${prefix}-window`)!
  const [wx, , wz] = window.transform.position
  for (const e of entities) {
    const [x, y, z] = e.transform.position
    e.transform.position = [x - wx, y, z - wz]
  }
  return entities
}

/**
 * Entities for one add-menu entry, in the local placement frame described above. `id` prefixes
 * every entity id; hosts usually let `placeEntities` replace them.
 */
export function createPlaceable(kind: PlaceableId, id: string): Entity[] {
  const entry = placeable(kind)
  if (kind === 'portal') return [createPlaceablePortal(id)]
  if (kind === 'sprite') return [createPlaceableSprite(id)]
  if (kind === 'gallery') return createPlaceableGallery(id)
  // Lamp factories take the centre of the pole; rest its foot on the ground.
  const lamp =
    kind === 'globe'
      ? createGlobeLamp(id, [0, 0, 0], entry.label)
      : createHighwayLamp(id, [0, 0, 0], entry.label)
  lamp.transform.position = [0, lamp.size[1] / 2, 0]
  return [lamp]
}
