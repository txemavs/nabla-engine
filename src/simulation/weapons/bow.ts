/** Device-independent bow draw; physics integrates released arrows in the shared World. */
export interface BowSpec {
  maxDraw: number
  minDraw: number
  spring: number
  arrowMass: number
  maxSpeed: number
}
export const defaultBowSpec: Readonly<BowSpec> = {
  maxDraw: 0.45,
  minDraw: 0.06,
  spring: 120,
  arrowMass: 0.03,
  maxSpeed: 45,
}
export class BowDraw {
  readonly spec: BowSpec
  distance = 0
  drawing = false
  constructor(spec: Partial<BowSpec> = {}) {
    this.spec = { ...defaultBowSpec, ...spec }
    if (
      !Object.values(this.spec).every((n) => Number.isFinite(n) && n > 0) ||
      this.spec.minDraw >= this.spec.maxDraw
    )
      throw new RangeError('Invalid bow settings')
  }
  start(): void {
    this.drawing = true
    this.distance = 0
  }
  pull(distance: number): void {
    if (this.drawing)
      this.distance = Number.isFinite(distance)
        ? Math.max(0, Math.min(this.spec.maxDraw, distance))
        : 0
  }
  release(): number {
    const speed =
      this.drawing && this.distance >= this.spec.minDraw
        ? Math.min(
            this.spec.maxSpeed,
            Math.sqrt(this.spec.spring / this.spec.arrowMass) * this.distance,
          )
        : 0
    this.cancel()
    return speed
  }
  cancel(): void {
    this.distance = 0
    this.drawing = false
  }
}

/**
 * Hold-to-draw from a button (mouse, touch, gamepad): the pull grows linearly to `maxDraw` over
 * `fullDrawS`. The release speed then follows the same `BowDraw` rules as the headset bow.
 */
export function timedDraw(spec: Readonly<BowSpec>, heldSeconds: number, fullDrawS = 0.9): number {
  if (!Number.isFinite(heldSeconds) || heldSeconds <= 0 || !(fullDrawS > 0)) return 0
  return Math.min(spec.maxDraw, (spec.maxDraw * heldSeconds) / fullDrawS)
}
