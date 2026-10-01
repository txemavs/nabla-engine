import { hasVehiclePreset } from '../src/catalog/vehicles/library.js'

/**
 * True when this machine has the vehicle preset. Presets under assets/custom are
 * git-ignored, so tests that need them skip on a clean clone and CI.
 */
export function hasLocalPreset(id: string): boolean {
  return hasVehiclePreset(id)
}
