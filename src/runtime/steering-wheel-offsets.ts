import {
  clampSteeringWheelOffset,
  steeringWheelCentred,
  type SteeringWheelOffset,
} from '../render/entity/steering-wheel.js'

/** The subset of `Storage` the steering-wheel settings use; `localStorage` fits. */
export type SteeringWheelStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * Where a driver's steering-wheel adjustment comes from, per steering model (its GLB URL):
 * the player's saved choice, else the host default, else the GLB pose itself.
 */
export interface SteeringWheelSettings {
  /** Host defaults by steering model, metres. Clamped to `steeringWheelOffsetRange`. */
  defaults?: Readonly<Record<string, Partial<SteeringWheelOffset>>>
  /** Persistence for the player's choice (e.g. `localStorage`). Omit or null to keep it in memory. */
  storage?: SteeringWheelStorage | null
}

/** Storage key of one steering model's saved adjustment. */
export function steeringWheelStorageKey(model: string): string {
  return `nabla.steeringWheel:${model}`
}

/** Saved adjustment of `model`, or undefined when none (or the stored value is unreadable). */
export function readSteeringWheelOffset(
  storage: SteeringWheelStorage | null | undefined,
  model: string,
): SteeringWheelOffset | undefined {
  try {
    const raw = storage?.getItem(steeringWheelStorageKey(model))
    if (!raw) return undefined
    const value = JSON.parse(raw) as unknown
    if (!value || typeof value !== 'object') return undefined
    return clampSteeringWheelOffset(value as Partial<SteeringWheelOffset>)
  } catch {
    return undefined
  }
}

/** Save `offset` for `model`; `undefined` forgets the saved choice. Storage errors are ignored. */
export function writeSteeringWheelOffset(
  storage: SteeringWheelStorage | null | undefined,
  model: string,
  offset: SteeringWheelOffset | undefined,
): void {
  try {
    if (offset) storage?.setItem(steeringWheelStorageKey(model), JSON.stringify(offset))
    else storage?.removeItem(steeringWheelStorageKey(model))
  } catch {
    // Private mode or a full quota: the adjustment still applies for this session.
  }
}

/** Host default for `model`, clamped; centred when the host set none. */
export function defaultSteeringWheelOffset(
  settings: SteeringWheelSettings | undefined,
  model: string,
): SteeringWheelOffset {
  const value = settings?.defaults?.[model]
  return value ? clampSteeringWheelOffset(value) : { ...steeringWheelCentred }
}

/** The adjustment a steering model starts with: saved, else host default, else centred. */
export function initialSteeringWheelOffset(
  settings: SteeringWheelSettings | undefined,
  model: string,
): SteeringWheelOffset {
  return (
    readSteeringWheelOffset(settings?.storage, model) ?? defaultSteeringWheelOffset(settings, model)
  )
}

/** Centimetres with a sign and one decimal, e.g. `+1.5 cm`, `0.0 cm`, `-3.0 cm`. */
export function formatSteeringWheelCm(metres: number): string {
  const cm = Math.round(metres * 1000) / 10
  return `${cm > 0 ? '+' : ''}${(cm === 0 ? 0 : cm).toFixed(1)} cm`
}

/**
 * One log line with both readings: centimetres for people and the metres a host default or a
 * GLB bake takes, e.g. `distance +1.5 cm, height -0.5 cm {"distance":0.015,"height":-0.005}`.
 */
export function describeSteeringWheelOffset(offset: SteeringWheelOffset): string {
  return (
    `distance ${formatSteeringWheelCm(offset.distance)}, ` +
    `height ${formatSteeringWheelCm(offset.height)} ${JSON.stringify(offset)}`
  )
}
