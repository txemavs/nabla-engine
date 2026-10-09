/** Planeta visual defaults and the player's saved override. */

export const planetVisualStorageKey = 'nabla.planetVisual'

export interface PlanetVisualSettings {
  sky: boolean
  sun: boolean
  sea: boolean
  clouds: boolean
  cloudStyle: 'low' | 'artistic'
  /** Coverage, 0..1. 0.4 is the Alto/Ultra "40%". */
  cloudAmount: number
  /**
   * 0..1. 0.8 is not one of the named pressure modes (0, 0.12, 0.55), so the menu
   * shows Personalizado.
   */
  cloudPressure: number
  /** Sun flare, 0..1. 0.8 is "Destello del sol" at 80%. */
  lensFlareAmount: number
}

/**
 * Planeta defaults when graphics quality is Alto or Ultra. Lower tiers keep the
 * previous engine defaults (cheap clouds, 35% cover, stable pressure, full flare).
 */
export const highPlanetVisual: PlanetVisualSettings = Object.freeze({
  sky: true,
  sun: true,
  sea: true,
  clouds: true,
  cloudStyle: 'artistic',
  cloudAmount: 0.4,
  cloudPressure: 0.8,
  lensFlareAmount: 0.8,
})

export function isHighQualityPreset(preset: string): boolean {
  return preset === 'high' || preset === 'ultra'
}

type PlanetStorage = Pick<Storage, 'getItem' | 'setItem'>

function finite01(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : undefined
}

/** The player's saved Planeta knobs, or undefined when nothing usable is stored. */
export function readSavedPlanetVisual(
  storage: PlanetStorage | null | undefined,
): PlanetVisualSettings | undefined {
  try {
    const raw = storage?.getItem(planetVisualStorageKey)
    if (!raw) return undefined
    const value = JSON.parse(raw) as Partial<PlanetVisualSettings>
    const cloudAmount = finite01(value.cloudAmount)
    const cloudPressure = finite01(value.cloudPressure)
    const lensFlareAmount = finite01(value.lensFlareAmount)
    if (
      typeof value.sky !== 'boolean' ||
      typeof value.sun !== 'boolean' ||
      typeof value.sea !== 'boolean' ||
      typeof value.clouds !== 'boolean' ||
      (value.cloudStyle !== 'low' && value.cloudStyle !== 'artistic') ||
      cloudAmount === undefined ||
      cloudPressure === undefined ||
      lensFlareAmount === undefined
    )
      return undefined
    return {
      sky: value.sky,
      sun: value.sun,
      sea: value.sea,
      clouds: value.clouds,
      cloudStyle: value.cloudStyle,
      cloudAmount,
      cloudPressure,
      lensFlareAmount,
    }
  } catch {
    return undefined
  }
}

/** Remember the player's Planeta knobs. Storage errors are ignored. */
export function writeSavedPlanetVisual(
  storage: PlanetStorage | null | undefined,
  visual: PlanetVisualSettings,
): void {
  try {
    storage?.setItem(planetVisualStorageKey, JSON.stringify(visual))
  } catch {
    // Private mode or a full quota: the choice still applies this session.
  }
}
