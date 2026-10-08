/**
 * Ejected brass motion: gravity, bounces off whatever the ray query hits (restitution along the
 * surface normal, friction along it) and a spin. A casing slower than a few cm/s on a surface
 * comes to rest and stops querying. Each lives `lifetime` seconds, then despawns; the pool keeps
 * the newest. Presentation (`Casings`) only draws the poses.
 */
import { simulationDefaults } from '../../config/simulation.js'
import type { Vec3Tuple } from '../../entity/schema.js'

export interface CasingSpec {
  ejectSpeedMs: number
  restitution: number
  friction: number
  lifetimeS: number
}

export interface CasingPose {
  position: Vec3Tuple
  spin: Vec3Tuple
  angle: number
  /** xyzw. Identity when omitted (brass does not need a rest orientation). */
  orientation?: [number, number, number, number]
}

interface Casing {
  position: [number, number, number]
  velocity: [number, number, number]
  spin: [number, number, number]
  angle: number
  age: number
  resting: boolean
  orientation?: [number, number, number, number]
}

/** World ray query: first solid from `from` along unit `direction` within `length`. */
export type CasingCast = (
  from: Vec3Tuple,
  direction: Vec3Tuple,
  length: number,
) => { point: Vec3Tuple; normal: Vec3Tuple } | null

const MAX = 24
/** Below this normal speed (m/s) a hit is a rest, not a bounce. */
const REST_SPEED = 0.3
/** Casing radius-ish standoff from the surface, m. */
const STANDOFF = 0.005

export class CasingMotion {
  private casings: Casing[] = []
  /** Impact speeds (m/s) of the bounces in the last step, for the tinkle. */
  bounces: number[] = []

  constructor(
    private readonly spec: CasingSpec,
    private readonly gravity = simulationDefaults.gravity,
    private readonly capacity = MAX,
    private readonly standoff = STANDOFF,
  ) {}

  get count(): number {
    return this.casings.length
  }

  /**
   * Eject one casing from `origin` to the shooter's right (`right`), a little up (`up`), at the
   * spec speed plus a small spread, on top of the shooter's own `carry` velocity.
   */
  eject(
    origin: Vec3Tuple,
    right: Vec3Tuple,
    up: Vec3Tuple,
    carry: Vec3Tuple = [0, 0, 0],
    random = Math.random,
  ): void {
    if (this.casings.length >= this.capacity) this.casings.shift()
    const spread = () => 1 + (random() - 0.5) * 0.3
    const speed = this.spec.ejectSpeedMs * spread()
    const lift = this.spec.ejectSpeedMs * 0.5 * spread()
    this.casings.push({
      position: [...origin],
      velocity: [0, 1, 2].map((i) => carry[i] + right[i] * speed + up[i] * lift) as [
        number,
        number,
        number,
      ],
      spin: [random() - 0.5, random() - 0.5, random() - 0.5],
      angle: 0,
      age: 0,
      resting: false,
    })
  }

  /**
   * Let one body go from `origin` with an explicit `velocity` (m/s). Same bounce, rest and
   * lifetime as an ejection. `orientation` is xyzw. Used for a magazine that drops out of the
   * grip instead of being thrown sideways.
   */
  release(
    origin: Vec3Tuple,
    velocity: Vec3Tuple,
    spin: Vec3Tuple = [0.2, 0.4, 0.15],
    orientation: [number, number, number, number] = [0, 0, 0, 1],
  ): void {
    if (this.casings.length >= this.capacity) this.casings.shift()
    this.casings.push({
      position: [...origin],
      velocity: [...velocity],
      spin: [...spin],
      angle: 0,
      age: 0,
      resting: false,
      orientation: [...orientation],
    })
  }

  /** Advance every casing by `dt` seconds against the world (`cast`). */
  update(dt: number, cast: CasingCast): void {
    const step = Math.min(0.05, Math.max(0, dt))
    this.bounces = []
    const live: Casing[] = []
    for (const casing of this.casings) {
      casing.age += step
      if (casing.age >= this.spec.lifetimeS) continue
      if (casing.resting) {
        live.push(casing)
        continue
      }
      live.push(casing)
      if (step === 0) continue
      const v = casing.velocity
      v[1] -= this.gravity * step
      const move: Vec3Tuple = [v[0] * step, v[1] * step, v[2] * step]
      const length = Math.hypot(...move)
      casing.angle += Math.hypot(...casing.spin) * 40 * step
      const hit =
        length > 1e-6
          ? cast(casing.position, move.map((m) => m / length) as Vec3Tuple, length + this.standoff)
          : null
      if (!hit) {
        casing.position = [0, 1, 2].map((i) => casing.position[i] + move[i]) as [
          number,
          number,
          number,
        ]
        continue
      }
      const n = hit.normal
      const into = v[0] * n[0] + v[1] * n[1] + v[2] * n[2]
      casing.position = [0, 1, 2].map((i) => hit.point[i] + n[i] * this.standoff) as [
        number,
        number,
        number,
      ]
      if (into >= 0) continue
      const tangent = [0, 1, 2].map((i) => v[i] - n[i] * into)
      if (-into < REST_SPEED && n[1] > 0.6) {
        casing.velocity = [0, 0, 0]
        casing.resting = true
        continue
      }
      this.bounces.push(-into)
      casing.velocity = [0, 1, 2].map(
        (i) => tangent[i] * (1 - this.spec.friction) - n[i] * into * this.spec.restitution,
      ) as [number, number, number]
      casing.spin = casing.spin.map((w) => w * 0.7) as [number, number, number]
    }
    this.casings = live
  }

  poses(): CasingPose[] {
    return this.casings.map((casing) => ({
      position: [...casing.position] as Vec3Tuple,
      spin: [...casing.spin] as Vec3Tuple,
      angle: casing.angle,
      orientation: casing.orientation ? [...casing.orientation] : undefined,
    }))
  }

  reset(): void {
    this.casings = []
    this.bounces = []
  }
}
