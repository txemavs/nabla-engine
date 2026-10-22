import { wrapAngle, type AvatarSample, type EntityState, type WheelVisuals } from './protocol.js'

export interface TimedState<S = EntityState> {
  /** Sender clock, milliseconds. */
  t: number
  state: S
}

/** How a buffer blends two samples and runs past the newest one. */
export interface SampleOps<S> {
  blend(a: S, b: S, alpha: number): S
  /** State `seconds` after `last`; `previous` is the sample before it, if any. */
  extrapolate(last: TimedState<S>, previous: TimedState<S> | undefined, seconds: number): S
}

/** Rigid bodies: lerp/slerp, extrapolated with their velocity. */
export const entityStateOps: SampleOps<EntityState> = {
  blend: (a, b, k) => blendStates(a, b, k),
  extrapolate: (last, _previous, seconds) => extrapolate(last.state, seconds),
}

/**
 * On-foot bodies: position lerp, shortest-arc yaw, speed lerp; the animation index is discrete
 * and taken from the older sample until the newer one is reached. Extrapolation uses the
 * velocity between the last two samples.
 */
export const avatarSampleOps: SampleOps<AvatarSample> = {
  blend: (a, b, alpha) => {
    const k = Math.min(Math.max(alpha, 0), 1)
    return {
      position: lerp3(a.position, b.position, k),
      yaw: lerpAngle(a.yaw, b.yaw, k),
      speed: a.speed + (b.speed - a.speed) * k,
      anim: k >= 1 ? b.anim : a.anim,
      weapon: k >= 1 ? b.weapon : a.weapon,
      inventory: k >= 1 ? b.inventory : a.inventory,
      aim:
        a.aim && b.aim
          ? [lerpAngle(a.aim[0], b.aim[0], k), a.aim[1] + (b.aim[1] - a.aim[1]) * k]
          : k >= 1
            ? b.aim
            : a.aim,
    }
  },
  extrapolate: (last, previous, seconds) => {
    if (seconds <= 0 || !previous) return last.state
    const dt = (last.t - previous.t) / 1000
    if (dt <= 0) return last.state
    const [a, b] = [previous.state.position, last.state.position]
    const k = seconds / dt
    return {
      ...last.state,
      position: [b[0] + (b[0] - a[0]) * k, b[1] + (b[1] - a[1]) * k, b[2] + (b[2] - a[2]) * k],
    }
  },
}

/** Shortest-arc interpolation between two angles (radians); the result is wrapped. */
export function lerpAngle(a: number, b: number, k: number): number {
  return wrapAngle(a + wrapAngle(b - a) * k)
}

export interface InterpolationOptions {
  /** Render this far behind the newest estimated sender time (ms). */
  delayMs: number
  /** Extrapolate with velocity at most this long past the newest sample (ms). */
  maxExtrapolationMs: number
  /** Samples kept per peer. */
  capacity: number
}

export const defaultInterpolation: InterpolationOptions = {
  delayMs: 100,
  maxExtrapolationMs: 250,
  capacity: 32,
}

/**
 * Jitter buffer for one remote entity. It maps the sender clock onto the local clock with the
 * smallest observed offset (the least-delayed packet), then samples `delayMs` in the past.
 */
export class SnapshotBuffer<S = EntityState> {
  private readonly samples: TimedState<S>[] = []
  private offset: number | null = null
  private readonly ops: SampleOps<S>
  constructor(
    readonly options: InterpolationOptions = defaultInterpolation,
    ops?: SampleOps<S>,
  ) {
    this.ops = ops ?? (entityStateOps as unknown as SampleOps<S>)
  }

  /** Sender time (ms) of the newest sample, or null when empty. */
  get newest(): number | null {
    return this.samples.length ? this.samples[this.samples.length - 1].t : null
  }

  get size(): number {
    return this.samples.length
  }

  /** Insert a sample received at local time `receivedAt` (ms). Late duplicates are ignored. */
  push(sample: TimedState<S>, receivedAt: number): void {
    const offset = receivedAt - sample.t
    // Track the fastest path, but let it drift up slowly so a clock skew cannot pin it forever.
    this.offset = this.offset === null ? offset : Math.min(offset, this.offset + 0.05)
    const index = this.samples.findIndex((s) => s.t >= sample.t)
    if (index >= 0 && this.samples[index].t === sample.t) return
    if (index < 0) this.samples.push(sample)
    else this.samples.splice(index, 0, sample)
    while (this.samples.length > this.options.capacity) this.samples.shift()
  }

  /** Interpolated state at local time `now` (ms), or null before the first sample. */
  sample(now: number): S | null {
    if (!this.samples.length || this.offset === null) return null
    const target = now - this.offset - this.options.delayMs
    const first = this.samples[0]
    if (target <= first.t) return first.state
    for (let i = 1; i < this.samples.length; i++) {
      const b = this.samples[i]
      if (b.t < target) continue
      const a = this.samples[i - 1]
      const alpha = (target - a.t) / Math.max(b.t - a.t, 1e-6)
      // Drop samples that can no longer be needed.
      if (i > 1) this.samples.splice(0, i - 1)
      return this.ops.blend(a.state, b.state, alpha)
    }
    const last = this.samples[this.samples.length - 1]
    const ahead = Math.min(target - last.t, this.options.maxExtrapolationMs) / 1000
    return this.ops.extrapolate(last, this.samples[this.samples.length - 2], ahead)
  }
}

export function blendStates(a: EntityState, b: EntityState, alpha: number): EntityState {
  const k = Math.min(Math.max(alpha, 0), 1)
  return {
    position: lerp3(a.position, b.position, k),
    rotation: slerp(a.rotation, b.rotation, k),
    velocity: lerp3(a.velocity, b.velocity, k),
    angularVelocity: lerp3(a.angularVelocity, b.angularVelocity, k),
    ...(a.wheels || b.wheels ? { wheels: blendWheels(a.wheels, b.wheels, k) } : {}),
  }
}

/** Per-wheel linear blend; when the wheel counts differ (vehicle changed) the newer one wins. */
export function blendWheels(
  a: WheelVisuals | undefined,
  b: WheelVisuals | undefined,
  k: number,
): WheelVisuals {
  if (!a || !b || a.steer.length !== b.steer.length) return (k < 0.5 ? (a ?? b) : (b ?? a))!
  const mix = (x: number[], y: number[]) => x.map((v, i) => v + ((y[i] ?? v) - v) * k)
  return {
    steer: mix(a.steer, b.steer),
    suspension: mix(a.suspension, b.suspension),
    spinRate: mix(a.spinRate, b.spinRate),
  }
}

function extrapolate(state: EntityState, seconds: number): EntityState {
  if (seconds <= 0) return state
  const [x, y, z] = state.position
  const [vx, vy, vz] = state.velocity
  return { ...state, position: [x + vx * seconds, y + vy * seconds, z + vz * seconds] }
}

function lerp3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  k: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

/** Shortest-arc quaternion slerp of [x, y, z, w] tuples; the result is normalised. */
export function slerp(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
  k: number,
): [number, number, number, number] {
  let [bx, by, bz, bw] = b
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw
  if (cos < 0) {
    cos = -cos
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }
  let wa = 1 - k
  let wb = k
  if (cos < 0.9995) {
    const angle = Math.acos(cos)
    const sin = Math.sin(angle)
    wa = Math.sin((1 - k) * angle) / sin
    wb = Math.sin(k * angle) / sin
  }
  const q: [number, number, number, number] = [
    a[0] * wa + bx * wb,
    a[1] * wa + by * wb,
    a[2] * wa + bz * wb,
    a[3] * wa + bw * wb,
  ]
  const length = Math.hypot(...q) || 1
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length]
}
