import type { Entity, Vec3Tuple } from '../../entity/schema.js'
import { hasVehiclePreset, presetVehicle, vehiclePreset, vehiclePresets } from './library.js'

/** Composite spawn id: white truck plus a hitched white trailer. Not a catalog preset. */
export const WHITE_TRUCK_TRAILER_CHOICE = 'white-truck-trailer'

/** Menu / URL label for {@link WHITE_TRUCK_TRAILER_CHOICE}. */
export const WHITE_TRUCK_TRAILER_LABEL = 'Camión con remolque'

/**
 * Trailer origin behind the tractor, metres along vehicle +Z.
 * Same placement as `test/simulation/trailer.test.ts` and the terrain-drive fleet.
 */
export const WHITE_TRAILER_PLACEMENT_OFFSET = 7.33

/** Hitch the trailer to the tractor using the authored `hitch` / `towAnchor` from the GLB rigs. */
export function hitchTrailer(tractor: Entity, trailer: Entity): void {
  const hitch = tractor.vehicle?.hitch
  const anchor = trailer.vehicle?.towAnchor
  if (!hitch || !anchor) throw new Error('Tow hitch geometry is missing on the tractor or trailer')
  if (!trailer.vehicle) throw new Error('Trailer has no vehicle definition')
  trailer.vehicle.tow = {
    vehicleId: tractor.id,
    hitch: [hitch[0], hitch[1], hitch[2]],
    anchor: [anchor[0], anchor[1], anchor[2]],
  }
}

/** Catalog presets plus the truck+trailer combo. `hasVehiclePreset` stays catalog-only. */
export function hasSpawnChoice(id: string): boolean {
  return id === WHITE_TRUCK_TRAILER_CHOICE || hasVehiclePreset(id)
}

/**
 * Catalog preset the player boards for this spawn id.
 * The combo starts in the truck. A passive trailer has no seat (`null`).
 */
export function spawnChoicePlayerPreset(id: string): string | null {
  if (id === WHITE_TRUCK_TRAILER_CHOICE) return 'white-truck'
  if (!hasVehiclePreset(id)) throw new Error(`No spawn choice "${id}"`)
  return vehiclePreset(id).vehicle.passive ? null : id
}

/** Menu rows: every catalog vehicle (including the passive trailer) and the coupled combo. */
export function vehicleSpawnChoices(): { id: string; label: string }[] {
  const choices = vehiclePresets().map((preset) => ({ id: preset.id, label: preset.label }))
  const truck = choices.findIndex((choice) => choice.id === 'white-truck')
  const combo = { id: WHITE_TRUCK_TRAILER_CHOICE, label: WHITE_TRUCK_TRAILER_LABEL }
  if (truck >= 0) choices.splice(truck + 1, 0, combo)
  else choices.push(combo)
  return choices
}

/**
 * One catalog vehicle, or the white truck with a coupled trailer for the combo id.
 * Does not add carrier stern portals (those stay editor-only, like the current add-vehicle menu).
 */
export function spawnChoiceEntities(
  choiceId: string,
  rootId: string,
  position?: Vec3Tuple,
): Entity[] {
  if (choiceId === WHITE_TRUCK_TRAILER_CHOICE) {
    const tractor = presetVehicle('white-truck', rootId, position)
    const [x, y, z] = tractor.transform.position
    const trailer = presetVehicle('white-trailer', `${rootId}-trailer`, [
      x,
      y,
      z + WHITE_TRAILER_PLACEMENT_OFFSET,
    ])
    hitchTrailer(tractor, trailer)
    return [tractor, trailer]
  }
  if (!hasVehiclePreset(choiceId)) throw new Error(`No spawn choice "${choiceId}"`)
  return [presetVehicle(choiceId, rootId, position)]
}
