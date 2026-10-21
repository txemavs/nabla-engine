/**
 * One render timeline for pipelined worker physics. The frame never waits for the worker: it
 * renders a simulation time a little behind the newest worker snapshot and blends the buffered
 * snapshots around that time, and every render-facing read (vehicles, wheels, player, camera
 * anchors) comes from that one blended state.
 *
 * - Snapshot times are the worker's fixed-step clock (`ticks × FIXED_STEP`), independent of when
 *   replies arrive.
 * - The render time follows `local clock + smoothed (worker time − arrival time) − delay`: the
 *   offset is averaged over arrivals so irregular replies do not move it, corrections are eased
 *   in over about half a second, and the render time never moves backwards.
 * - When the buffer runs dry (render time past the newest snapshot) poses extrapolate for at
 *   most {@link MAX_EXTRAPOLATION} seconds, then hold; nothing snaps.
 */
import type { Transform, Vec3Tuple } from '../entity/schema.js'

export interface TimedSnapshot<S> {
  snapshot: S
  /** Simulation seconds of the snapshot's fixed poses. */
  time: number
}

/** Snapshots kept to bracket the render time. */
export const SNAPSHOT_BUFFER = 4
/** Longest underrun bridged by extrapolation before poses hold, seconds. */
export const MAX_EXTRAPOLATION = 0.05
/** A render error larger than this (new simulation, long stall) resynchronises at once. */
export const RESYNC_SECONDS = 0.5
/** Faster than this between two snapshots is a teleport (relocation, respawn): no blending. */
export const TELEPORT_SPEED = 400

export interface TimelineSample<S> {
  a: TimedSnapshot<S>
  b: TimedSnapshot<S>
  /** Blend from a (0) to b (1); above 1 extrapolates past b. */
  t: number
}

export class SnapshotTimeline<S> {
  readonly entries: TimedSnapshot<S>[] = []
  /** Local seconds, advanced by frames. */
  private local = 0
  /** Smoothed worker time minus local arrival time. */
  private offset: number | null = null
  /** Simulation seconds being rendered; null before the first frame with a snapshot. */
  renderTime: number | null = null

  /** @param delay How far behind the estimated worker time to render, seconds. */
  constructor(readonly delay: number) {}

  get latest(): TimedSnapshot<S> | null {
    return this.entries[this.entries.length - 1] ?? null
  }

  push(snapshot: S, time: number): void {
    const last = this.latest
    if (last && time < last.time) {
      // A new simulation: start over.
      this.entries.length = 0
      this.offset = null
      this.renderTime = null
    }
    if (last && time === last.time) this.entries[this.entries.length - 1] = { snapshot, time }
    else this.entries.push({ snapshot, time })
    if (this.entries.length > SNAPSHOT_BUFFER) this.entries.shift()
    const sample = time - this.local
    this.offset = this.offset === null ? sample : this.offset + (sample - this.offset) * 0.1
  }

  /** Advance the rendered time by a frame: monotonic, eased toward the estimated worker time. */
  advance(elapsed: number): void {
    const dt = Math.max(0, elapsed)
    this.local += dt
    if (this.offset === null || !this.latest) return
    const target = this.local + this.offset - this.delay
    if (this.renderTime === null) {
      this.renderTime = Math.min(target, this.latest.time)
      return
    }
    let next = this.renderTime + dt
    const error = target - next
    if (Math.abs(error) > RESYNC_SECONDS) next = target
    else next += error * Math.min(1, dt * 2)
    this.renderTime = Math.max(this.renderTime, next)
  }

  /** The two snapshots around the render time and the blend between them. */
  sample(): TimelineSample<S> | null {
    const entries = this.entries
    if (!entries.length) return null
    const last = entries[entries.length - 1]
    const time = this.renderTime ?? last.time
    if (entries.length === 1 || time <= entries[0].time) {
      const first = entries.length === 1 ? last : entries[0]
      return { a: first, b: first, t: 1 }
    }
    for (let i = 1; i < entries.length; i++) {
      const a = entries[i - 1],
        b = entries[i]
      if (time <= b.time) return { a, b, t: (time - a.time) / (b.time - a.time) }
    }
    const a = entries[entries.length - 2]
    const ahead = Math.min(time - last.time, MAX_EXTRAPOLATION)
    return { a, b: last, t: 1 + ahead / (last.time - a.time) }
  }
}

export function lerpVec(a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Normalized lerp along the shorter arc (snapshots are a few ticks apart). */
export function nlerpQuat(
  a: Transform['rotation'],
  b: Transform['rotation'],
  t: number,
): Transform['rotation'] {
  const sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1
  const q = [0, 1, 2, 3].map((i) => a[i] + (sign * b[i] - a[i]) * t)
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]
}

/** Pose at `t` between a (0) and b (1), `span` seconds apart; a teleport shows b. */
export function lerpTransform(a: Transform, b: Transform, t: number, span = 0): Transform {
  if (t === 1) return b
  const d = Math.hypot(
    b.position[0] - a.position[0],
    b.position[1] - a.position[1],
    b.position[2] - a.position[2],
  )
  if (d > 1 + TELEPORT_SPEED * Math.max(span, 1 / 60)) return b
  return {
    position: lerpVec(a.position, b.position, t),
    rotation: nlerpQuat(a.rotation, b.rotation, t),
  }
}

/** Angle lerp along the shorter way (radians). */
export function lerpAngle(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + d * t
}

/**
 * Blend two worker reads of the same shape: numbers lerp, arrays and objects blend per field,
 * anything else (flags, ids, strings) takes `b`. Lean, steering, suspension and velocities sampled
 * by the worker then follow the render timeline instead of stepping at the reply rate.
 */
export function blendNumbers<T>(a: T, b: T, t: number): T {
  if (typeof a === 'number' && typeof b === 'number') return (a + (b - a) * t) as T
  if (Array.isArray(a) && Array.isArray(b))
    return (a.length === b.length ? a.map((v, i) => blendNumbers(v, b[i], t)) : b) as T
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const from = a as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(b))
      out[key] = key in from ? blendNumbers(from[key], value, t) : value
    return out as T
  }
  return b
}
