/**
 * What the occupied vehicle lets the player adjust, derived from its data and what its model
 * bound (lamps, mirrors, exhaust). The settings list only these: an option that does not apply
 * to the vehicle is hidden, whatever the vehicle class.
 */
import type { VehicleDefinition } from '../entity/vehicle/field.js'

export interface VehicleOptions {
  /** Lamp groups the model can light (front beams, rear lamps). */
  lamps: { front: boolean; rear: boolean }
  /** Mirror glass with live reflections. */
  mirrors: boolean
  /** Exhaust controls: outlet position and smoke quantity; null without exhaust. */
  exhaust: {
    /** `vehicle.exhaust.adjustable`: the player can move the outlets. */
    position: boolean
    /** `smoke.amount: "manual"`: the player sets the quantity. */
    amount: boolean
    /** What the smoke quantity follows when it is not the player's: `full`, `load` or `rpm`. */
    follows: 'full' | 'load' | 'rpm' | 'manual'
  } | null
  /** Sounds of the vehicle the player can change. */
  sound: {
    /** The vehicle has an engine voice (the engine volume applies). */
    engine: boolean
    /** The vehicle sounds a reversing alarm (it can be switched off). */
    reverseAlarm: boolean
  }
}

export function vehicleOptions(
  vehicle: VehicleDefinition | undefined,
  facts: { lamps: { front: boolean; rear: boolean }; mirrors: boolean; exhaust: boolean },
): VehicleOptions {
  const data = vehicle?.exhaust
  const follows = data?.smoke?.amount ?? 'full'
  return {
    lamps: facts.lamps,
    mirrors: facts.mirrors,
    exhaust: facts.exhaust
      ? { position: !!data?.adjustable, amount: follows === 'manual', follows }
      : null,
    sound: {
      engine: !!vehicle && !vehicle.passive && !vehicle.boat && !vehicle.flight,
      reverseAlarm: !!vehicle?.reverseAlarm,
    },
  }
}
