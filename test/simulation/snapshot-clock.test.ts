import { describe, expect, it } from 'vitest'
import {
  SnapshotClock,
  lerpTransform,
  TELEPORT_METRES,
} from '../../src/simulation/snapshot-clock.js'
import type { Transform } from '../../src/entity/schema.js'

const at = (x: number, yaw = 0): Transform => ({
  position: [x, 0, 0],
  rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
})

describe('pipelined physics: snapshot render clock', () => {
  it('renders between the last two snapshots, by simulation time', () => {
    const clock = new SnapshotClock<string>()
    clock.push('a', 1)
    clock.push('b', 1.1)
    clock.advance(0) // starts at the older snapshot
    expect(clock.alpha).toBe(0)
    clock.advance(0.05)
    expect(clock.alpha).toBeCloseTo(0.5)
    clock.advance(0.2) // never extrapolates past the newest
    expect(clock.alpha).toBe(1)
    clock.push('c', 1.2)
    clock.advance(0.05)
    expect(clock.previous!.snapshot).toBe('b')
    expect(clock.alpha).toBeCloseTo(0.5)
  })

  it('catches up when it falls behind the older snapshot', () => {
    const clock = new SnapshotClock<number>()
    clock.push(0, 0)
    clock.push(1, 0.1)
    clock.advance(0)
    clock.push(2, 1)
    clock.push(3, 1.1)
    clock.advance(0.01)
    expect(clock.renderTime).toBeCloseTo(1)
  })

  it('a snapshot at the same time replaces the newest; an older time starts over', () => {
    const clock = new SnapshotClock<string>()
    clock.push('a', 1)
    clock.push('b', 2)
    clock.push('b2', 2)
    expect(clock.previous!.snapshot).toBe('a')
    expect(clock.latest!.snapshot).toBe('b2')
    clock.push('new', 0)
    expect(clock.previous).toBeNull()
    expect(clock.renderTime).toBeNull()
  })

  it('blends positions and rotations, and does not blend a teleport', () => {
    const mid = lerpTransform(at(0, 0), at(2, Math.PI / 2), 0.5)
    expect(mid.position[0]).toBeCloseTo(1)
    expect(Math.atan2(mid.rotation[1], mid.rotation[3]) * 2).toBeCloseTo(Math.PI / 4)
    const jump = at(TELEPORT_METRES + 1)
    expect(lerpTransform(at(0), jump, 0.5)).toBe(jump)
  })
})
