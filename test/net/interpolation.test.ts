import { describe, expect, it } from 'vitest'
import { SnapshotBuffer, slerp } from '../../src/net/interpolation.js'
import type { EntityState } from '../../src/net/protocol.js'

const at = (x: number, vx = 0): EntityState => ({
  position: [x, 0, 0],
  rotation: [0, 0, 0, 1],
  velocity: [vx, 0, 0],
  angularVelocity: [0, 0, 0],
})

describe('SnapshotBuffer', () => {
  it('renders 100 ms behind the sender, interpolating between bracketing samples', () => {
    const buffer = new SnapshotBuffer()
    // Sender clock starts at 5000, receiver at 0 with a constant 20 ms latency.
    for (let i = 0; i <= 10; i++) buffer.push({ t: 5000 + i * 50, state: at(i) }, i * 50 + 20)
    // Receiver time 520 -> sender 500 -> minus 100 ms -> sender 400 = sample 8.
    expect(buffer.sample(520)!.position[0]).toBeCloseTo(8)
    expect(buffer.sample(545)!.position[0]).toBeCloseTo(8.5)
  })
  it('orders late packets, ignores duplicates and extrapolates for a bounded time', () => {
    const buffer = new SnapshotBuffer()
    buffer.push({ t: 0, state: at(0, 10) }, 0)
    buffer.push({ t: 100, state: at(1, 10) }, 100)
    buffer.push({ t: 50, state: at(0.5, 10) }, 130)
    buffer.push({ t: 50, state: at(99, 10) }, 131)
    expect(buffer.size).toBe(3)
    expect(buffer.sample(175)!.position[0]).toBeCloseTo(0.75)
    // 1 s after the last sample: only 250 ms of extrapolation at 10 m/s.
    expect(buffer.sample(1200)!.position[0]).toBeCloseTo(3.5)
  })
  it('returns null before the first sample and holds the oldest one early on', () => {
    const buffer = new SnapshotBuffer()
    expect(buffer.sample(0)).toBeNull()
    buffer.push({ t: 0, state: at(2) }, 0)
    expect(buffer.sample(0)!.position[0]).toBe(2)
  })
})

describe('slerp', () => {
  it('takes the shortest arc and returns unit quaternions', () => {
    const half = Math.SQRT1_2
    const q = slerp([0, 0, 0, 1], [0, -half, 0, -half], 0.5)
    expect(Math.hypot(...q)).toBeCloseTo(1)
    expect(q[3]).toBeGreaterThan(0.9)
  })
})
