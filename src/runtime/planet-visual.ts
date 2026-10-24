/** Planeta visual defaults and the player's saved override. */

export const planetVisualStorageKey = 'nabla.planetVisual'

export interface PlanetVisualSettings {
  /** Rain intensity, 0 (off)..1. */
  rainLinked?: boolean
  rainAmount?: number
  /** Independent celestial visibility; absent legacy values inherit sky. */
  moon?: boolean
  stars?: boolean
  /** Horizon-only magnification, 1..16; default is 5. */
  moonHorizonScale?: number
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
  /** Sun flare, 0..1. 0.5 is the default 50%. */
  lensFlareAmount: number
}

/**
 * Planeta defaults when graphics quality is Alto or Ultra. Lower tiers keep the
 * previous engine defaults (cheap clouds, 35% cover, stable pressure, 50% flare).
 */
export const highPlanetVisual: PlanetVisualSettings = Object.freeze({
  rainLinked: false,
  rainAmount: 0,
  moon: true,
  stars: true,
  moonHorizonScale: 5,
  sky: true,
  sun: true,
  sea: true,
  clouds: true,
  cloudStyle: 'artistic',
  cloudAmount: 0.4,
  cloudPressure: 0.8,
  lensFlareAmount: 0.5,
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
): Required<PlanetVisualSettings> | undefined {
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
      rainLinked: value.rainLinked === true,
      rainAmount: finite01(value.rainAmount) ?? 0,
      moon: typeof value.moon === 'boolean' ? value.moon : value.sky,
      stars: typeof value.stars === 'boolean' ? value.stars : value.sky,
      moonHorizonScale:
        typeof value.moonHorizonScale === 'number' &&
        Number.isFinite(value.moonHorizonScale) &&
        value.moonHorizonScale >= 1 &&
        value.moonHorizonScale <= 16
          ? value.moonHorizonScale
          : 5,
      sky: value.sky,
      sun: value.sun,
      sea: value.sea,
      clouds: value.clouds,
      cloudStyle: value.rainLinked === true ? 'artistic' : value.cloudStyle,
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
