/**
 * The player's per-model vehicle choices that are not lights (lights have their own
 * `nabla.vehicle-lights/1` record): exhaust outlet offset, smoke quantity and the reversing alarm.
 * Saved per model URL under `nabla.vehicle-preferences/1:<model>`, like the lights. The older
 * global keys (`nabla.truckExhaustOffset`, `nabla.truckExhaustAmount`, `nabla.reverseAlarm`)
 * are read as the defaults of a model that has no record yet.
 */
export interface VehiclePreferences {
  exhaustOffset: [number, number, number]
  exhaustAmount: number
  reverseAlarm: boolean
}

export type VehiclePreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

export const vehiclePreferencesKey = (model: string) => `nabla.vehicle-preferences/1:${model}`

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function parse(raw: string | null | undefined): unknown {
  try {
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

export function normalizeVehiclePreferences(value: unknown): VehiclePreferences {
  const record = (value && typeof value === 'object' ? value : {}) as Partial<
    Record<keyof VehiclePreferences, unknown>
  >
  const offset = record.exhaustOffset
  const amount = Number(record.exhaustAmount)
  return {
    exhaustOffset:
      Array.isArray(offset) && offset.length === 3 && offset.every(Number.isFinite)
        ? (offset.map((v: number) => clamp(v, -1, 1)) as [number, number, number])
        : [0, 0, 0],
    exhaustAmount:
      record.exhaustAmount !== undefined && Number.isFinite(amount) ? clamp(amount, 0, 2) : 1,
    reverseAlarm: record.reverseAlarm !== false,
  }
}

function legacyDefaults(storage: VehiclePreferenceStorage | undefined): VehiclePreferences {
  try {
    return normalizeVehiclePreferences({
      exhaustOffset: parse(storage?.getItem('nabla.truckExhaustOffset')),
      exhaustAmount: storage?.getItem('nabla.truckExhaustAmount') ?? undefined,
      reverseAlarm: storage?.getItem('nabla.reverseAlarm') !== '0',
    })
  } catch {
    return normalizeVehiclePreferences({})
  }
}

/** Saved choices of `model`, or the legacy global ones when it has none. Never throws. */
export function readVehiclePreferences(
  storage: VehiclePreferenceStorage | undefined,
  model: string,
): VehiclePreferences {
  let raw: string | null | undefined
  try {
    raw = storage?.getItem(vehiclePreferencesKey(model))
  } catch {
    raw = undefined
  }
  const saved = parse(raw)
  return saved === undefined
    ? legacyDefaults(storage)
    : normalizeVehiclePreferences({ ...legacyDefaults(storage), ...(saved as object) })
}

/** Merge `patch` into the saved choices of `model`; returns the stored result. */
export function writeVehiclePreferences(
  storage: VehiclePreferenceStorage | undefined,
  model: string,
  patch: Partial<VehiclePreferences>,
): VehiclePreferences {
  const next = normalizeVehiclePreferences({ ...readVehiclePreferences(storage, model), ...patch })
  try {
    storage?.setItem(vehiclePreferencesKey(model), JSON.stringify(next))
  } catch {
    /* Optional storage. */
  }
  return next
}
