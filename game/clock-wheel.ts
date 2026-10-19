/**
 * Mouse-wheel steps for the menu clock. A notch of a mouse is one step; a trackpad sends many small
 * deltas, which add up until they make one. `up` (negative `deltaY`) is a step forward in time.
 */
export interface WheelStepper {
  /** Whole steps (+ forward in time, − back) completed by this event, 0 while it accumulates. */
  push(deltaY: number, deltaMode?: number, now?: number): number
}

/** Pixels of wheel travel that make one step (a typical mouse notch is 100). */
export const wheelStepPixels = 100
/** A gap in the gesture after which a half-finished step is forgotten, ms. */
export const wheelIdleMs = 400

export function createWheelStepper(): WheelStepper {
  let sum = 0
  let last = -Infinity
  return {
    push(deltaY, deltaMode = 0, now = Date.now()) {
      if (!Number.isFinite(deltaY) || deltaY === 0) return 0
      if (now - last > wheelIdleMs) sum = 0
      last = now
      // Lines and pages are converted to pixels.
      sum += deltaY * (deltaMode === 1 ? 40 : deltaMode === 2 ? 100 : 1)
      const steps = Math.trunc(Math.abs(sum) / wheelStepPixels)
      if (!steps) return 0
      const direction = sum < 0 ? 1 : -1
      sum -= -direction * steps * wheelStepPixels
      return direction * steps
    },
  }
}
