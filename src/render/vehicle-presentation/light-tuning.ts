/**
 * Vehicle light calibration shared by every vehicle; offsets are metres in vehicle space, beam
 * cutoffs are degrees. A vehicle's JSON (`vehicle.lights.tuning`) overrides these defaults and the
 * player's saved choice (per model, schema `nabla.vehicle-lights/1`) overrides both.
 */
export const vehicleLightDefaults = {
  low: 0,
  high: 1,
  frontX: 0,
  frontY: 0,
  frontZ: 0,
  rearX: 0,
  rearY: 0,
  rearZ: 0,
  rearIntensity: 1,
  rearReach: 1,
}
export type VehicleLightTuning = typeof vehicleLightDefaults
const cache = new Map<string, VehicleLightTuning>()
const key = (model: string) => 'nabla.vehicle-lights.' + model
export function normalizeVehicleLights(value: Partial<VehicleLightTuning>): VehicleLightTuning {
  const result = { ...vehicleLightDefaults }
  for (const name of Object.keys(result) as (keyof VehicleLightTuning)[]) {
    const number = value?.[name]
    if (typeof number !== 'number' || !Number.isFinite(number)) continue
    const scale = name === 'rearIntensity' || name === 'rearReach'
    const angle = name === 'low' || name === 'high'
    result[name] = Math.max(
      scale ? 0 : angle ? -5 : -2,
      Math.min(scale ? 3 : angle ? 5 : 2, number),
    )
  }
  return result
}
/** Calibration of a model: engine defaults, then the vehicle's own defaults, then the saved choice. */
export function readVehicleLights(
  model: string,
  defaults: Partial<VehicleLightTuning> = {},
): VehicleLightTuning {
  if (!cache.has(model)) {
    let value = {}
    try {
      value = JSON.parse(globalThis.localStorage?.getItem(key(model)) ?? '{}')
    } catch {
      /* Optional storage. */
    }
    cache.set(model, normalizeVehicleLights({ ...vehicleLightDefaults, ...defaults, ...value }))
  }
  return { ...cache.get(model)! }
}
/** Saves a patch for the model, or without one clears the saved choice back to the defaults. */
export function writeVehicleLights(
  model: string,
  patch?: Partial<VehicleLightTuning>,
  defaults: Partial<VehicleLightTuning> = {},
): VehicleLightTuning {
  const value = patch
    ? normalizeVehicleLights({ ...readVehicleLights(model, defaults), ...patch })
    : normalizeVehicleLights({ ...vehicleLightDefaults, ...defaults })
  cache.set(model, value)
  try {
    if (patch) globalThis.localStorage?.setItem(key(model), JSON.stringify(value))
    else globalThis.localStorage?.removeItem(key(model))
  } catch {
    /* Live tuning still works without storage. */
  }
  return { ...value }
}
