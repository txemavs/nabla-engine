/**
 * Render clock for pipelined worker physics: the frame never waits for the worker's step. It
 * renders a time just behind the newest worker snapshot and interpolates every pose between the
 * two snapshots around that time. Snapshot times are the worker's own fixed-step clock
 * (`ticks × FIXED_STEP`), so the result does not depend on when replies arrive.
 */
import type { Transform, Vec3Tuple } from '../entity/schema.js'

export interface TimedSnapshot<S> {
  snapshot: S
  /** Simulation seconds of the snapshot's fixed poses. */
  time: number
}

/** A pose that moves farther than this between two snapshots is a teleport: no blending. */
export const TELEPORT_METRES = 25

export class SnapshotClock<S> {
  previous: TimedSnapshot<S> | null = null
  latest: TimedSnapshot<S> | null = null
  /** Simulation seconds being rendered; null until two snapshots exist. */
  renderTime: number | null = null

  /** Record a worker snapshot. A snapshot with the same time replaces the newest one. */
  push(snapshot: S, time: number): void {
    if (this.latest && time > this.latest.time) this.previous = this.latest
    else if (this.latest && time < this.latest.time) {
      // A new simulation (or a reset clock): start over.
      this.previous = null
      this.renderTime = null
    }
    this.latest = { snapshot, time }
  }

  /**
   * Advance the rendered time by a frame. It stays inside [previous, latest]: behind, it catches
   * up to the older snapshot; ahead of the newest, it holds there instead of extrapolating.
   */
  advance(elapsed: number): void {
    if (!this.latest) return
    const floor = this.previous?.time ?? this.latest.time
    const ceiling = this.latest.time
    const next = (this.renderTime ?? floor) + Math.max(0, elapsed)
    this.renderTime = Math.min(ceiling, Math.max(floor, next))
  }

  /** Blend factor between previous (0) and latest (1) at the rendered time. */
  get alpha(): number {
    const a = this.previous,
      b = this.latest
    if (!a || !b || this.renderTime === null || b.time <= a.time) return 1
    return Math.min(1, Math.max(0, (this.renderTime - a.time) / (b.time - a.time)))
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

export function lerpTransform(a: Transform, b: Transform, t: number): Transform {
  const d = Math.hypot(
    b.position[0] - a.position[0],
    b.position[1] - a.position[1],
    b.position[2] - a.position[2],
  )
  if (t >= 1 || d > TELEPORT_METRES) return b
  return {
    position: lerpVec(a.position, b.position, t),
    rotation: nlerpQuat(a.rotation, b.rotation, t),
  }
}
