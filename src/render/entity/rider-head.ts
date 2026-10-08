/**
 * Presentation-only easing of a two-wheeler rider's head: the cockpit eye follows the rider's
 * body shift and tuck through a critically damped spring, so every key press, steering input or
 * automatic body position eases in over about a second and a half instead of snapping (no
 * overshoot from rest, physics jitter filtered out). The physics centre-of-mass shift and the
 * handling are untouched.
 */
import { criticalStep } from './driving-camera.js'

/** Eased values (shift x, shift z, tuck) and their rates for one vehicle. */
export interface RiderHeadEase {
  value: number[]
  rate: number[]
}

/** Longest step taken at once, seconds; a stalled frame never throws the head about. */
const maxStep = 0.25

/**
 * Advance `ease` towards `target` by `dt` seconds at natural frequency `response` (1/s; settles
 * within 2% in about 5.8 / response seconds). A missing or mismatched state, or a non-positive
 * response, snaps to the target.
 */
export function easeRiderHead(
  ease: RiderHeadEase | undefined,
  target: readonly number[],
  response: number,
  dt: number,
): RiderHeadEase {
  if (!ease || ease.value.length !== target.length || !(response > 0))
    return { value: [...target], rate: target.map(() => 0) }
  const step = Math.min(maxStep, Math.max(0, Number.isFinite(dt) ? dt : 0))
  for (let i = 0; i < target.length; i++) {
    const [error, rate] = criticalStep(ease.value[i] - target[i], ease.rate[i], response, step)
    ease.value[i] = target[i] + error
    ease.rate[i] = rate
  }
  return ease
}
