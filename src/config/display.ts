/** Browser presentation settings; the browser owns actual display synchronization. */

/** Live adaptation vs a host-fixed drawing-buffer scale. */
export type ResolutionScaleMode = 'auto' | 'manual'

/** Inclusive clamps for auto adaptation (healthy machines may reach 1). */
export const autoResolutionScaleRange = Object.freeze({ min: 0.5, max: 1 })

/** Inclusive clamps for an explicit host/manual scale. */
export const manualResolutionScaleRange = Object.freeze({ min: 0.25, max: 1 })

export interface DisplaySettings {
  /** Maximum automatic frame submissions per second; 0 follows browser cadence. */
  maxFps: number
  /**
   * Drawing-buffer multiplier relative to the selected quality profile.
   * In `manual` mode this is the host-fixed value (0.25..1).
   * In `auto` mode this is the live adapted value, starting at 0.5 and clamped to 0.5..1.
   */
  resolutionScale: number
  /**
   * `auto` raises scale when the frame budget is healthy and lowers toward 0.5 when struggling.
   * `manual` freezes `resolutionScale` at the host value (slider, URL, or API).
   */
  resolutionScaleMode: ResolutionScaleMode
}

export const displayDefaults: Readonly<DisplaySettings> = Object.freeze({
  maxFps: 0,
  resolutionScale: 0.5,
  resolutionScaleMode: 'auto',
})

/**
 * Validate per-runtime overrides; the minimum FPS cap preserves normal fixed-step catch-up.
 * An explicit `resolutionScale` without `resolutionScaleMode` selects `manual` so hosts that
 * pass a fixed scale keep that scale. Omitting both keeps the auto default (0.5 start).
 */
export function resolveDisplaySettings(value: Partial<DisplaySettings> = {}): DisplaySettings {
  const hasScale = value.resolutionScale !== undefined
  const hasMode = value.resolutionScaleMode !== undefined
  const resolutionScaleMode: ResolutionScaleMode = hasMode
    ? value.resolutionScaleMode!
    : hasScale
      ? 'manual'
      : displayDefaults.resolutionScaleMode
  const resolutionScale =
    value.resolutionScale !== undefined
      ? value.resolutionScale
      : resolutionScaleMode === 'auto'
        ? displayDefaults.resolutionScale
        : 1
  const result: DisplaySettings = {
    maxFps: value.maxFps !== undefined ? value.maxFps : displayDefaults.maxFps,
    resolutionScale,
    resolutionScaleMode,
  }
  if (
    result.maxFps !== 0 &&
    (!Number.isInteger(result.maxFps) || result.maxFps < 30 || result.maxFps > 360)
  )
    throw new RangeError('maxFps must be 0 or an integer from 30 to 360')
  if (result.resolutionScaleMode !== 'auto' && result.resolutionScaleMode !== 'manual')
    throw new RangeError('resolutionScaleMode must be "auto" or "manual"')
  const range =
    result.resolutionScaleMode === 'auto' ? autoResolutionScaleRange : manualResolutionScaleRange
  if (
    !Number.isFinite(result.resolutionScale) ||
    result.resolutionScale < range.min ||
    result.resolutionScale > range.max
  )
    throw new RangeError(
      `resolutionScale must be between ${range.min} and ${range.max} in ${result.resolutionScaleMode} mode`,
    )
  return result
}
