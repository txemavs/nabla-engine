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

/** Per-runtime cache and provisional exhaust controls; persisted model records retain their legacy fallback. */
export class RuntimeVehiclePreferences {
  private readonly cache = new Map<string, VehiclePreferences>()
  private amount = 1
  private offset: [number, number, number] = [0, 0, 0]

  constructor(private readonly storage?: VehiclePreferenceStorage) {}

  read(model: string): VehiclePreferences {
    let value = this.cache.get(model)
    if (!value) this.cache.set(model, (value = readVehiclePreferences(this.storage, model)))
    return value
  }

  update(model: string, patch: Partial<VehiclePreferences>): VehiclePreferences {
    const next = writeVehiclePreferences(this.storage, model, patch)
    this.cache.set(model, next)
    return next
  }

  get exhaustAmount(): number {
    return this.amount
  }
  get exhaustOffset(): [number, number, number] {
    return [...this.offset]
  }

  setExhaustAmount(amount: number, apply: (amount: number) => void): number {
    if (!Number.isFinite(amount)) throw new Error('Invalid exhaust amount')
    this.amount = Math.max(0, Math.min(2, amount))
    apply(this.amount)
    return this.amount
  }

  setExhaustOffset(
    offset: [number, number, number],
    apply: (offset: [number, number, number]) => void,
  ): [number, number, number] {
    if (!offset.every(Number.isFinite)) throw new Error('Invalid exhaust offset')
    this.offset = offset.map((value) => Math.max(-1, Math.min(1, value))) as [
      number,
      number,
      number,
    ]
    apply(this.offset)
    return this.exhaustOffset
  }
}
