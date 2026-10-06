import {
  clampMirrorAdjustment,
  type MirrorAdjustment,
  type MirrorAngle,
} from '../render/entity/car-mirrors.js'

/** The subset of `Storage` the mirror settings use; `localStorage` fits. */
export type MirrorStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * Where a driver's mirror adjustment comes from, per mirror model (`mirrorModelKey`: body GLB URL,
 * plus the steering GLB when there is one): the player's saved choice, else the host default,
 * else the aim baked into the asset.
 */
export interface MirrorSettings {
  /** Host defaults by mirror model, degrees per side. Clamped to `mirrorAngleRange`. */
  defaults?: Readonly<Record<string, Readonly<Record<string, Partial<MirrorAngle>>>>>
  /** Persistence for the player's choice (e.g. `localStorage`). Omit or null to keep it in memory. */
  storage?: MirrorStorage | null
}

/** Storage key of one mirror model's saved adjustment. */
export function mirrorStorageKey(model: string): string {
  return `nabla.mirrors:${model}`
}

/** Saved adjustment of `model`, or undefined when none (or the stored value is unreadable). */
export function readMirrorAdjustment(
  storage: MirrorStorage | null | undefined,
  model: string,
): MirrorAdjustment | undefined {
  try {
    const raw = storage?.getItem(mirrorStorageKey(model))
    if (!raw) return undefined
    const value = JSON.parse(raw) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    return clampMirrorAdjustment(value as Record<string, Partial<MirrorAngle>>)
  } catch {
    return undefined
  }
}

/** Save `adjustment` for `model`; `undefined` forgets the saved choice. Storage errors are ignored. */
export function writeMirrorAdjustment(
  storage: MirrorStorage | null | undefined,
  model: string,
  adjustment: MirrorAdjustment | undefined,
): void {
  try {
    if (adjustment) storage?.setItem(mirrorStorageKey(model), JSON.stringify(adjustment))
    else storage?.removeItem(mirrorStorageKey(model))
  } catch {
    // Private mode or a full quota: the adjustment still applies for this session.
  }
}

/** Host default for `model`, clamped; `{}` (the authored aim) when the host set none. */
export function defaultMirrorAdjustment(
  settings: MirrorSettings | undefined,
  model: string,
): MirrorAdjustment {
  return clampMirrorAdjustment(settings?.defaults?.[model])
}

/** The adjustment a mirror model starts with: saved, else host default, else the authored aim. */
export function initialMirrorAdjustment(
  settings: MirrorSettings | undefined,
  model: string,
): MirrorAdjustment {
  return readMirrorAdjustment(settings?.storage, model) ?? defaultMirrorAdjustment(settings, model)
}

/** Degrees with a sign and one decimal, e.g. `+1.5°`, `0.0°`, `-3.0°`. */
export function formatMirrorDegrees(degrees: number): string {
  const value = Math.round(degrees * 10) / 10
  return `${value > 0 ? '+' : ''}${(value === 0 ? 0 : value).toFixed(1)}°`
}

/**
 * One log line per side plus the JSON a host default or a bake takes, e.g.
 * `left yaw -2.0° tilt +1.0°, right yaw -1.5° tilt 0.0° {"left":{"yaw":-2,"tilt":1},…}`.
 */
export function describeMirrorAdjustment(adjustment: MirrorAdjustment, sides: string[]): string {
  const parts = sides.map((side) => {
    const angle = adjustment[side] ?? { yaw: 0, tilt: 0 }
    return `${side} yaw ${formatMirrorDegrees(angle.yaw)} tilt ${formatMirrorDegrees(angle.tilt)}`
  })
  return `${parts.join(', ')} ${JSON.stringify(adjustment)}`
}
