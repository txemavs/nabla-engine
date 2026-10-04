/** Browser presentation settings; the browser owns actual display synchronization. */
export interface DisplaySettings {
  /** Maximum automatic frame submissions per second; 0 follows browser cadence. */
  maxFps: number
  /** Drawing-buffer multiplier relative to the selected quality profile, inclusive range 0.25..1. */
  resolutionScale: number
}

export const displayDefaults: Readonly<DisplaySettings> = Object.freeze({
  maxFps: 0,
  resolutionScale: 1,
})

/** Validate per-runtime overrides; the minimum cap preserves normal fixed-step catch-up. */
export function resolveDisplaySettings(value: Partial<DisplaySettings> = {}): DisplaySettings {
  const result = { ...displayDefaults, ...value }
  if (
    result.maxFps !== 0 &&
    (!Number.isInteger(result.maxFps) || result.maxFps < 30 || result.maxFps > 360)
  )
    throw new RangeError('maxFps must be 0 or an integer from 30 to 360')
  if (
    !Number.isFinite(result.resolutionScale) ||
    result.resolutionScale < 0.25 ||
    result.resolutionScale > 1
  )
    throw new RangeError('resolutionScale must be between 0.25 and 1')
  return result
}
