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

describe('avatar samples', () => {
  it('blends yaw on the shortest arc, keeps the older animation and extrapolates 250 ms at most', async () => {
    const { avatarSampleOps, lerpAngle } = await import('../../src/net/interpolation.js')
    const { quantizeAvatar, decodeAvatar, wrapAngle } = await import('../../src/net/protocol.js')
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 2)
    const a = { position: [0, 0, 0] as [number, number, number], yaw: 0, speed: 0, anim: 0 }
    const b = { ...a, position: [1, 0, 0] as [number, number, number], speed: 2, anim: 2 }
    expect(avatarSampleOps.blend(a, b, 0.5)).toMatchObject({ speed: 1, anim: 0 })
    expect(avatarSampleOps.blend(a, b, 1).anim).toBe(2)
    const buffer = new SnapshotBuffer(undefined, avatarSampleOps)
    buffer.push({ t: 0, state: a }, 0)
    buffer.push({ t: 100, state: b }, 100)
    // 1 s past the newest sample at 10 m/s: capped at 250 ms.
    expect(buffer.sample(1200)!.position[0]).toBeCloseTo(3.5)
    const q = quantizeAvatar({ position: [1.23456, 0, -2], yaw: 7, speed: 1.234, anim: 4 })
    expect(q).toEqual({ p: [1.23, 0, -2], y: +wrapAngle(7).toFixed(3), s: 1.23, a: 4 })
    expect(decodeAvatar(q).position).toEqual([1.23, 0, -2])
    // Held item: optional on the wire (absent = empty hands), switched like the animation.
    expect(decodeAvatar(q).weapon).toBe(0)
    const armed = quantizeAvatar({ ...a, weapon: 2 })
    expect(armed.w).toBe(2)
    expect(decodeAvatar(armed).weapon).toBe(2)
    expect(avatarSampleOps.blend({ ...a, weapon: 0 }, { ...b, weapon: 2 }, 0.5).weapon).toBe(0)
    // Character state: inventory switches, aim blends; absent fields stay off the wire.
    expect(q.i).toBeUndefined()
    const kit = quantizeAvatar({ ...a, inventory: { i: [[1, 1, 1]], h: [0, 1] }, aim: [7, 3] })
    expect(kit).toMatchObject({ i: [[1, 1, 1]], h: [0, 1], v: [+wrapAngle(7).toFixed(3), 1.57] })
    expect(decodeAvatar(kit)).toMatchObject({ inventory: { i: [[1, 1, 1]], h: [0, 1] } })
    expect(avatarSampleOps.blend({ ...a, aim: [0, 0] }, { ...b, aim: [1, 0.5] }, 0.5).aim).toEqual([
      0.5, 0.25,
    ])
    // Held item pose (body space): 1 cm / 1e-3 quaternion, normalised; blends.
    const held = quantizeAvatar({
      ...a,
      held: { position: [0.1234, 1.456, -0.5], quaternion: [0, 0, 0, 2] },
    })
    expect(held.g).toEqual([0.12, 1.46, -0.5, 0, 0, 0, 1])
    expect(decodeAvatar(held).held).toEqual({
      position: [0.12, 1.46, -0.5],
      quaternion: [0, 0, 0, 1],
    })
    expect(q.g).toBeUndefined()
    const mid = avatarSampleOps.blend(
      { ...a, held: { position: [0, 1, 0], quaternion: [0, 0, 0, 1] } },
      { ...b, held: { position: [0, 2, 0], quaternion: [0, 0, 0, 1] } },
      0.5,
    ).held!
    expect(mid.position[1]).toBeCloseTo(1.5)
    const { quantizeFire, decodeFire } = await import('../../src/net/protocol.js')
    const fire = quantizeFire({
      slot: 1,
      kind: 0,
      origin: [1.234, 2, 3],
      direction: [0, 0, -2],
      range: 12.3456,
    })
    expect(fire).toEqual({ w: 1, k: 0, o: [1.23, 2, 3], d: [0, 0, -1], r: 12.35 })
    expect(decodeFire(fire)).toMatchObject({ slot: 1, origin: [1.23, 2, 3], direction: [0, 0, -1] })
    expect(decodeFire({ ...fire, d: [0, 0, 9] })).toBeNull()
  })
})
