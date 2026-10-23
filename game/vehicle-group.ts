/**
 * Which options of the occupied vehicle the Principal tab lists. The group is titled with the
 * vehicle's name and shows only what applies to it; on foot the settings window hides the whole
 * group (this still reports every section as usable).
 */
import type { VehicleOptions } from '../src/runtime/vehicle-options.js'

/** Sections of the vehicle group, in the order they are listed. */
export const vehicleGroupSections = [
  'settings-options-driver',
  'settings-car-beams',
  'settings-vehicle-sound',
  'settings-truck-exhaust',
  'settings-rear-light-nudge',
] as const
export type VehicleGroupSection = (typeof vehicleGroupSections)[number]

/** The occupied vehicle as the settings see it (`GameRuntime.occupiedVehicle`). */
export interface OccupiedVehicleView {
  options?: VehicleOptions
  lamps?: { front: boolean; rear: boolean }
  mirrors?: boolean
  exhaust?: boolean
}

export interface VehicleGroupVisibility {
  sections: Readonly<Record<VehicleGroupSection, boolean>>
  /** Rows inside a section that do not apply (`scene-mirrors` of the driver section). */
  mirrors: boolean
  reverseAlarm: boolean
  exhaustPosition: boolean
  exhaustAmount: boolean
}

export function vehicleGroupVisibility(
  occupied: OccupiedVehicleView | null | undefined,
): VehicleGroupVisibility {
  if (!occupied)
    return {
      sections: {
        'settings-options-driver': true,
        'settings-car-beams': true,
        'settings-vehicle-sound': true,
        'settings-truck-exhaust': true,
        'settings-rear-light-nudge': true,
      },
      mirrors: true,
      reverseAlarm: true,
      exhaustPosition: true,
      exhaustAmount: true,
    }
  const lamps = occupied.options?.lamps ?? occupied.lamps ?? { front: true, rear: true }
  const exhaust =
    occupied.options?.exhaust ??
    (occupied.exhaust ? { position: true, amount: true, follows: 'manual' as const } : null)
  const sound = occupied.options?.sound ?? { engine: true, reverseAlarm: false }
  return {
    sections: {
      // Driver pose and steering wheel apply to every vehicle you can sit in.
      'settings-options-driver': true,
      'settings-car-beams': lamps.front || lamps.rear,
      'settings-vehicle-sound': sound.engine || sound.reverseAlarm,
      'settings-truck-exhaust': !!exhaust && (exhaust.position || exhaust.amount),
      'settings-rear-light-nudge': lamps.rear,
    },
    mirrors: occupied.options?.mirrors ?? occupied.mirrors ?? true,
    reverseAlarm: sound.reverseAlarm,
    exhaustPosition: !!exhaust?.position,
    exhaustAmount: !!exhaust?.amount,
  }
}
