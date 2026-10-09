/**
 * Live lighting knobs for look tuning (Ajustes → Opciones → Luz). Defaults are the shipped
 * look: the values euskadi.online runs (engine 8d18dba), so the sliders start where the game
 * already is. Saved per browser as `nabla.lightTuning`; «Copiar valores» exports them as JSON.
 */
import { lightingDefaults } from '../config/lighting.js'
import { PLANET_DEFAULTS } from '../render/planet/world-environment.js'

export interface LightTuning {
  /** Tone-mapping exposure (renderer.toneMappingExposure). */
  exposure: number
  /** Multiplier on the sun / moon directional light (full day 3.2). */
  sun: number
  /** Multiplier on the ambient light (full day 0.22). */
  ambient: number
  /** Multiplier on vehicle environment reflections (envMapIntensity, motorcycle chrome and glass). */
  reflections: number
  /** Multiplier on the vehicle paint colour (S3 `Pintura*`, truck/trailer `White paint`). */
  paint: number
  /** Shadows drawn at all (off = shadow intensity 0, no shader recompile). */
  shadows: boolean
  /** Shadow darkness, 0 (no shadow) .. 1 (full). */
  shadowIntensity: number
}

export const lightTuningDefaults: Readonly<LightTuning> = Object.freeze({
  exposure: PLANET_DEFAULTS.exposure,
  sun: 1,
  ambient: 1,
  reflections: 1,
  paint: 1,
  shadows: true,
  shadowIntensity: 1,
})

/** Slider ranges: [min, max, step]. */
export const lightTuningRanges: Readonly<
  Record<Exclude<keyof LightTuning, 'shadows'>, readonly [number, number, number]>
> = Object.freeze({
  exposure: [0.3, 2.5, 0.01],
  sun: [0, 3, 0.01],
  ambient: [0, 6, 0.05],
  reflections: [0, 3, 0.01],
  paint: [0.3, 2, 0.01],
  shadowIntensity: [0, 1, 0.01],
})

/** The absolute full-day intensities the multipliers apply to (for display). */
export const lightTuningBase = Object.freeze({
  sun: 3.2,
  ambient: lightingDefaults.ambientIntensity,
})

export const lightTuningStorageKey = 'nabla.lightTuning'

/** Clamp a partial tuning onto `base`; junk fields keep the base value. */
export function normalizeLightTuning(
  patch: Partial<LightTuning> | null | undefined,
  base: LightTuning = lightTuningDefaults,
): LightTuning {
  const out = { ...base }
  for (const key of Object.keys(lightTuningRanges) as (keyof typeof lightTuningRanges)[]) {
    const value = patch?.[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const [min, max] = lightTuningRanges[key]
    out[key] = Math.min(max, Math.max(min, value))
  }
  if (typeof patch?.shadows === 'boolean') out.shadows = patch.shadows
  return out
}

type TuningStorage = Pick<Storage, 'getItem' | 'setItem'>

export function readLightTuning(storage: TuningStorage | null | undefined): LightTuning {
  try {
    const raw = storage?.getItem(lightTuningStorageKey)
    if (!raw) return { ...lightTuningDefaults }
    const value = JSON.parse(raw) as unknown
    return normalizeLightTuning(value && typeof value === 'object' ? value : undefined)
  } catch {
    return { ...lightTuningDefaults }
  }
}

export function writeLightTuning(
  storage: TuningStorage | null | undefined,
  tuning: LightTuning,
): void {
  try {
    storage?.setItem(lightTuningStorageKey, JSON.stringify(tuning))
  } catch {
    // Private mode or a full quota: the values still apply this session.
  }
}
