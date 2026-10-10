/** Browser presentation settings; the browser owns actual display synchronization. */

/** Live adaptation vs a host-fixed drawing-buffer scale. */
export type ResolutionScaleMode = 'auto' | 'manual'

/** Inclusive clamps for auto adaptation (healthy machines may reach 1). */
export const autoResolutionScaleRange = Object.freeze({ min: 0.5, max: 1 })

/**
 * Inclusive clamps for an explicit host/manual scale. Above 1 supersamples (renders more pixels
 * than the preset's pixel ratio); the runtime also caps the final pixel ratio ({@link maxPixelRatio}).
 */
export const manualResolutionScaleRange = Object.freeze({ min: 0.25, max: 2 })

/** Upper bound for the final drawing-buffer pixel ratio (preset ratio × scale), to bound GPU memory. */
export const maxPixelRatio = 3

/** Where auto mode starts when the host gives no scale. */
export const autoResolutionScaleStart = 0.5

/**
 * Fixed (manual) scale per quality preset when the host leaves resolution unset — a ladder
 * from Ultra down. Presets without a step of their own (`custom` "Predeterminada", unknown
 * names, no preset) use 100%. Auto stays available (`resolutionScaleMode: 'auto'`).
 */
export const presetResolutionScales: Readonly<Record<string, number>> = Object.freeze({
  ultra: 1.3,
  high: 1.15,
  balanced: 0.8,
  low: 0.5,
  mobile: 0.45,
  minimal: 0.4,
})

/** {@link presetResolutionScales} entry for `preset`, 1 (100%) when it has none. */
export function presetResolutionScale(preset?: string): number {
  return (
    (preset !== undefined && Object.hasOwn(presetResolutionScales, preset)
      ? presetResolutionScales[preset]
      : undefined) ?? 1
  )
}

export interface DisplaySettings {
  /** Maximum automatic frame submissions per second; 0 follows browser cadence. */
  maxFps: number
  /**
   * Drawing-buffer multiplier relative to the selected quality profile.
   * In `manual` mode this is the host-fixed value (0.25..2).
   * In `auto` mode this is the live adapted value, starting at 0.5 and clamped to 0.5..1.
   * Unset, it is the preset's fixed {@link presetResolutionScales} step (Ultra 1.3, Alta 1.15 … Mínima 0.4).
   */
  resolutionScale: number
  /**
   * `auto` raises scale when the frame budget is healthy and lowers toward 0.5 when struggling.
   * `manual` freezes `resolutionScale` at the host value (slider, URL, or API).
   */
  resolutionScaleMode: ResolutionScaleMode
}

/** Defaults without a quality preset: a fixed 100% (see {@link presetResolutionScale}). */
export const displayDefaults: Readonly<DisplaySettings> = Object.freeze({
  maxFps: 0,
  resolutionScale: presetResolutionScale(),
  resolutionScaleMode: 'manual',
})

/**
 * Validate per-runtime overrides; the minimum FPS cap preserves normal fixed-step catch-up.
 * An explicit `resolutionScale` without `resolutionScaleMode` selects `manual` so hosts that
 * pass a fixed scale keep that scale. Omitting both fixes the quality preset's default
 * ({@link presetResolutionScales}: Ultra 1.3, Alta 1.15, Equilibrada 0.8, Baja 0.5, Móvil 0.45,
 * Mínima 0.4; others 1). `resolutionScaleMode: 'auto'` without a scale starts adaptation
 * at 0.5; `'manual'` without a scale is 1.
 */
export function resolveDisplaySettings(
  value: Partial<DisplaySettings> = {},
  preset?: string,
): DisplaySettings {
  const hasMode = value.resolutionScaleMode !== undefined
  // An explicit scale, or none at all (preset step), is fixed unless auto is asked for.
  const resolutionScaleMode: ResolutionScaleMode = value.resolutionScaleMode ?? 'manual'
  const resolutionScale =
    value.resolutionScale !== undefined
      ? value.resolutionScale
      : resolutionScaleMode === 'auto'
        ? autoResolutionScaleStart
        : hasMode
          ? 1
          : presetResolutionScale(preset)
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
