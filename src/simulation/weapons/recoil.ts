/**
 * Muzzle rise as aim displacement, not camera shake. Each shot lifts the muzzle by `riseDeg`
 * over `climbMs`; the grip brings back `naturalReturn` of it over `returnMs`; the rest stays
 * on the aim and the shooter has to pull it down. Offsets sum over shots.
 */
export interface RecoilSpec {
  riseDeg: number
  naturalReturn: number
  climbMs: number
  returnMs: number
}

/** Muzzle rise (rad, positive up) `age` ms after one shot. */
export function riseAfter(spec: RecoilSpec, age: number): number {
  if (!(age > 0)) return 0
  const rise = (spec.riseDeg * Math.PI) / 180
  const climb = 1 - Math.exp(-age / spec.climbMs)
  const back = spec.naturalReturn * (1 - Math.exp(-age / spec.returnMs))
  return rise * climb * (1 - back)
}

/** Running muzzle rise over many shots; `step(now)` returns the change since the last call. */
export class MuzzleRise {
  private shots: number[] = []
  private settled = 0
  private last = 0

  constructor(private readonly spec: RecoilSpec) {}

  shot(now: number): void {
    this.shots.push(now)
  }

  /** Total rise (rad) at `now`. */
  total(now: number): number {
    const horizon = Math.max(this.spec.climbMs, this.spec.returnMs) * 12
    while (this.shots.length && now - this.shots[0] > horizon) {
      this.settled += riseAfter(this.spec, now - this.shots[0])
      this.shots.shift()
    }
    return this.settled + this.shots.reduce((sum, at) => sum + riseAfter(this.spec, now - at), 0)
  }

  /** Change in rise (rad) since the previous call. */
  step(now: number): number {
    const total = this.total(now)
    const delta = total - this.last
    this.last = total
    return delta
  }

  reset(): void {
    this.shots = []
    this.settled = 0
    this.last = 0
  }
}
