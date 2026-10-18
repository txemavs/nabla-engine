/** Per-model vehicle light calibration; offsets are metres in vehicle space. */
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
function modelDefaults(model: string): VehicleLightTuning {
  return /(?:^|\/)vfr800fi-1999(?:-quest)?\.glb(?:[?#].*)?$/.test(model)
    ? { ...vehicleLightDefaults, rearY: -0.09, rearZ: 0.08 }
    : { ...vehicleLightDefaults }
}
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
export function readVehicleLights(model: string): VehicleLightTuning {
  if (!cache.has(model)) {
    let value = {}
    try {
      value = JSON.parse(globalThis.localStorage?.getItem(key(model)) ?? '{}')
    } catch {
      /* Optional storage. */
    }
    cache.set(model, normalizeVehicleLights({ ...modelDefaults(model), ...value }))
  }
  return { ...cache.get(model)! }
}
export function writeVehicleLights(
  model: string,
  patch?: Partial<VehicleLightTuning>,
): VehicleLightTuning {
  const value = patch
    ? normalizeVehicleLights({ ...readVehicleLights(model), ...patch })
    : modelDefaults(model)
  cache.set(model, value)
  try {
    if (patch) globalThis.localStorage?.setItem(key(model), JSON.stringify(value))
    else globalThis.localStorage?.removeItem(key(model))
  } catch {
    /* Live tuning still works without storage. */
  }
  return { ...value }
}
