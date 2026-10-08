/**
 * Refined inline engine voice (inline-4 turbo by default, optional inline-5 warble), built on the
 * same firing-pulse synthesis as the V4 (`v4-engine.ts`): evenly spaced firings every
 * 720°/cylinders, wider and rounder pulses, a gentle saturator and a lower lowpass, so the note
 * is smooth, deep and harmonic instead of buzzy. An inline-5 fires every 144°; slightly unequal
 * pulse strengths (`warble`, standing in for the unequal exhaust runners) add the half-order
 * warble of the classic five. A smooth band of intake tone rises with load. The turbo whistle and
 * the blow-off chuff are scaled down (`turboWhistle`, `blowOff`), and there are no crackles.
 * Timbre values are gameplay choices, not measurements.
 */
export const inlineEngineDefaults = Object.freeze({
  cylinders: 4,
  /** Pulse-strength spread for the half-order warble (0 = perfectly even). Used for 5. */
  warble: 0.12,
  harmonics: 40,
  /** Wider pulses than the V4 (0.025): fewer high harmonics, a rounder note. */
  pulseWidth: 0.07,
  idleGain: 0.028,
  loadGain: 0.045,
  /** Gentle saturation (the V4 uses 2.2). */
  drive: 1.1,
  cutoffBaseHz: 140,
  cutoffPerRpm: 0.07,
  cutoffLoadHz: 380,
  filterQ: 0.6,
  /** Smooth induction tone under load: low band, around twice the firing rate. */
  intakeGain: 0.01,
  intakeBaseHz: 250,
  intakeFiringMultiple: 2,
  /** Turbo whistle and blow-off multipliers against the road-car note's turbo. */
  turboWhistle: 0.5,
  blowOff: 0.12,
})

/** Evenly spaced firing angles in the 720° cycle for an inline engine. */
export function inlineFiringAngles(cylinders: number): number[] {
  if (!Number.isInteger(cylinders) || cylinders < 1 || cylinders > 12)
    throw new Error('Cylinders must be an integer from 1 to 12')
  return Array.from({ length: cylinders }, (_, i) => Math.round((i * 720 * 1e6) / cylinders) / 1e6)
}

/**
 * Pulse strengths per firing: all 1 for an even engine, a fixed uneven pattern scaled by
 * `warble` for the five (deterministic, so the note is steady).
 */
export function inlinePulseWeights(cylinders: number, warble: number): number[] {
  const pattern = [0, 1, -0.6, 0.7, -1.1, 0.4, -0.3, 0.9, -0.8, 0.2, -0.5, 0.6]
  const spread = cylinders === 5 ? Math.max(0, Math.min(0.5, warble)) : 0
  return Array.from({ length: cylinders }, (_, i) => 1 + spread * pattern[i % pattern.length])
}
