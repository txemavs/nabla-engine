/**
 * Released arrows on foot: device-independent flight (gravity, no drag) that collides through a
 * host cast, so a hit is the simulation's own shot query (`Simulation.shoot`), in the worker and
 * on the main thread alike. Arrows stick where they hit and expire after `lifetimeS`.
 */
export type Vec3 = [number, number, number]
export type ArrowCast = (
  from: Vec3,
  direction: Vec3,
  length: number,
) => { point: Vec3; normal: Vec3; entityId?: string | null } | null

export interface ArrowFlightSpec {
  arrowMass: number
  gravity: number
  lifetimeS: number
  limit: number
}
export const defaultArrowFlight: Readonly<ArrowFlightSpec> = {
  arrowMass: 0.03,
  gravity: 9.81,
  lifetimeS: 20,
  limit: 24,
}

export interface ArrowPose {
  position: Vec3
  /** Unit flight direction (the direction it was flying when it stuck). */
  direction: Vec3
  stuck: boolean
}
export interface ArrowImpact {
  point: Vec3
  normal: Vec3
  direction: Vec3
  entityId: string | null
  speed: number
  /** Momentum handed to what it hit, N·s. */
  momentum: number
}

interface Arrow {
  position: Vec3
  velocity: Vec3
  direction: Vec3
  age: number
  stuck: boolean
}

const length3 = (v: Vec3) => Math.hypot(v[0], v[1], v[2])

export class ArrowFlight {
  readonly spec: ArrowFlightSpec
  private arrows: Arrow[] = []
  constructor(spec: Partial<ArrowFlightSpec> = {}) {
    this.spec = { ...defaultArrowFlight, ...spec }
    const { arrowMass, gravity, lifetimeS, limit } = this.spec
    if (
      ![arrowMass, gravity, lifetimeS, limit].every(Number.isFinite) ||
      arrowMass <= 0 ||
      gravity < 0 ||
      lifetimeS <= 0 ||
      limit < 1
    )
      throw new RangeError('Invalid arrow flight settings')
  }
  get count(): number {
    return this.arrows.length
  }
  /** Loose one arrow; the oldest goes when the pool is full. Ignores a zero-speed release. */
  launch(origin: Vec3, direction: Vec3, speed: number): boolean {
    const n = length3(direction)
    if (!(speed > 0) || !(n > 0) || ![...origin, ...direction].every(Number.isFinite)) return false
    const dir: Vec3 = [direction[0] / n, direction[1] / n, direction[2] / n]
    this.arrows.push({
      position: [...origin],
      velocity: [dir[0] * speed, dir[1] * speed, dir[2] * speed],
      direction: dir,
      age: 0,
      stuck: false,
    })
    while (this.arrows.length > this.spec.limit) this.arrows.shift()
    return true
  }
  /** Advance `dt` seconds; returns the hits of this step. */
  update(dt: number, cast: ArrowCast): ArrowImpact[] {
    const impacts: ArrowImpact[] = []
    if (!(dt > 0)) return impacts
    const g = this.spec.gravity
    for (const arrow of this.arrows) {
      arrow.age += dt
      if (arrow.stuck) continue
      const [px, py, pz] = arrow.position
      const [vx, vy, vz] = arrow.velocity
      const next: Vec3 = [px + vx * dt, py + vy * dt - 0.5 * g * dt * dt, pz + vz * dt]
      const step: Vec3 = [next[0] - px, next[1] - py, next[2] - pz]
      const distance = length3(step)
      arrow.velocity = [vx, vy - g * dt, vz]
      const speed = length3(arrow.velocity)
      if (distance <= 0) continue
      const dir: Vec3 = [step[0] / distance, step[1] / distance, step[2] / distance]
      const hit = cast(arrow.position, dir, distance)
      arrow.direction = dir
      if (hit) {
        arrow.position = [...hit.point]
        arrow.stuck = true
        arrow.velocity = [0, 0, 0]
        impacts.push({
          point: [...hit.point],
          normal: [...hit.normal],
          direction: dir,
          entityId: hit.entityId ?? null,
          speed,
          momentum: this.spec.arrowMass * speed,
        })
      } else arrow.position = next
    }
    this.arrows = this.arrows.filter((arrow) => arrow.age < this.spec.lifetimeS)
    return impacts
  }
  poses(): ArrowPose[] {
    return this.arrows.map((a) => ({
      position: [...a.position],
      direction: [...a.direction],
      stuck: a.stuck,
    }))
  }
  reset(): void {
    this.arrows = []
  }
}
