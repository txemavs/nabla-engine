import { describe, expect, it } from 'vitest'
import {
  MAX_EXTRAPOLATION,
  SnapshotTimeline,
  lerpTransform,
} from '../../src/simulation/snapshot-clock.js'
import type { Transform } from '../../src/entity/schema.js'

const STEP = 1 / 60
const at = (x: number, yaw = 0): Transform => ({
  position: [x, 0, 0],
  rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
})

/** Deterministic jitter: replies every 1–4 frames, each carrying the ticks sent so far. */
function jittery(frames: number, frame = 1 / 144) {
  const timeline = new SnapshotTimeline<number>(2 * STEP)
  let sent = 0,
    seed = 7
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  let wait = 0
  const renders: number[] = []
  for (let i = 0; i < frames; i++) {
    sent += frame
    if (wait-- <= 0) {
      const ticks = Math.floor(sent / STEP)
      timeline.push(ticks, ticks * STEP)
      wait = Math.floor(rand() * 4)
    }
    timeline.advance(frame)
    if (timeline.renderTime !== null) renders.push(timeline.renderTime)
  }
  return { timeline, renders, frame }
}

describe('pipelined physics: one render timeline', () => {
  it('render time never moves backwards and advances smoothly with jittery replies', () => {
    const { renders, frame } = jittery(3000)
    const steps = renders.slice(1).map((t, i) => t - renders[i])
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(0)
    // After settling, each frame advances close to one frame of time: no jumps, no stalls.
    const settled = steps.slice(500)
    expect(Math.max(...settled)).toBeLessThan(frame * 1.6)
    expect(Math.min(...settled)).toBeGreaterThan(frame * 0.4)
  })

  it('renders behind the newest snapshot, inside the buffer', () => {
    const { timeline } = jittery(2000)
    const sample = timeline.sample()!
    expect(timeline.renderTime!).toBeLessThanOrEqual(timeline.latest!.time + MAX_EXTRAPOLATION)
    expect(sample.t).toBeGreaterThanOrEqual(0)
    expect(sample.t).toBeLessThanOrEqual(1 + MAX_EXTRAPOLATION / STEP)
  })

  it('bridges an underrun briefly, then holds', () => {
    const timeline = new SnapshotTimeline<number>(0)
    timeline.push(0, 0)
    timeline.push(1, STEP)
    for (let i = 0; i < 100; i++) timeline.advance(STEP) // no more replies
    const sample = timeline.sample()!
    expect(sample.t).toBeCloseTo(1 + MAX_EXTRAPOLATION / STEP)
  })

  it('a snapshot at the same time replaces the newest; an older time starts over', () => {
    const timeline = new SnapshotTimeline<string>(0)
    timeline.push('a', 1)
    timeline.push('b', 2)
    timeline.push('b2', 2)
    expect(timeline.entries.map((e) => e.snapshot)).toEqual(['a', 'b2'])
    timeline.push('new', 0)
    expect(timeline.entries.map((e) => e.snapshot)).toEqual(['new'])
    expect(timeline.renderTime).toBeNull()
  })

  it('blends poses, extrapolates past 1, and shows a teleport as is', () => {
    const mid = lerpTransform(at(0, 0), at(2, Math.PI / 2), 0.5, STEP)
    expect(mid.position[0]).toBeCloseTo(1)
    expect(Math.atan2(mid.rotation[1], mid.rotation[3]) * 2).toBeCloseTo(Math.PI / 4)
    expect(lerpTransform(at(0), at(1), 1.5, STEP).position[0]).toBeCloseTo(1.5)
    const jump = at(500)
    expect(lerpTransform(at(0), jump, 0.5, STEP)).toBe(jump)
    // Fast but real motion (300 km/h over 4 ticks) is blended.
    expect(lerpTransform(at(0), at(5.6), 0.5, 4 * STEP).position[0]).toBeCloseTo(2.8)
  })
})
