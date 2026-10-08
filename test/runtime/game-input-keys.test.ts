import { describe, expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { GameInput, finiteInput } from '../../src/runtime/input.js'
import { HeldKeys } from '../../src/runtime/held-keys.js'
import { Simulation } from '../../src/simulation/simulation.js'

/** Keyboard -> HeldKeys -> GameInput -> Simulation exactly as GameRuntime wires them. */
function rig() {
  const floor = createEntity('floor', 'box', [0, -0.5, -4000])
  floor.size = [10000, 1, 10000]
  const document = {
    version: 1 as const,
    name: 'Keys',
    entities: [
      floor,
      createEntity('spawn', 'spawn', [5, 1, 0]),
      presetVehicle('car', 's3', [0, 1.45, 0]),
    ],
  }
  const sim = new Simulation(document)
  for (let i = 0; i < 180; i++) sim.step(1 / 60)
  sim.startInVehicle('s3')
  const keys = new HeldKeys()
  const input = new GameInput()
  let now = 0
  const frame = (dt: number) => {
    now += dt * 1000
    keys.expire(now)
    const read = input.read(sim, document, Math.min(dt, 0.1), { keys: keys.values, yaw: 0 })
    sim.setInput(read)
    sim.step(Math.min(dt, 0.1))
    return read
  }
  return { sim, keys, frame, now: () => now }
}

describe('keyboard driving keys never stay stuck', () => {
  it('steering releases within half a second of the keyup', () => {
    const r = rig()
    r.keys.press('KeyW', false, r.now())
    r.keys.press('KeyD', false, r.now())
    let last = r.frame(1 / 60)
    for (let i = 0; i < 60; i++) last = r.frame(1 / 60)
    expect(last.right).toBeGreaterThan(0.9)
    r.keys.release('KeyD')
    for (let i = 0; i < 30; i++) {
      last = r.frame(1 / 60)
      r.keys.press('KeyW', true, r.now())
    }
    expect(Math.abs(last.right)).toBeLessThan(0.05)
    expect(last.forward).toBe(1)
    r.sim.dispose()
  })

  it('a long frame (200 ms) advances steering by at most the clamped step', () => {
    const r = rig()
    r.keys.press('KeyD', false, r.now())
    const first = r.frame(0.2)
    expect(first.right).toBeLessThan(0.3)
    expect(Number.isFinite(first.right)).toBe(true)
    r.sim.dispose()
  })

  it('throttle survives a steering tap while the OS has stopped repeating W', () => {
    const r = rig()
    r.keys.press('KeyW', false, r.now())
    for (let i = 0; i < 40; i++) {
      r.frame(1 / 60)
      if (i % 2 === 0) r.keys.press('KeyW', true, r.now())
    }
    r.keys.press('KeyD', false, r.now())
    r.frame(1 / 60)
    r.keys.release('KeyD')
    let last = r.frame(1 / 60)
    for (let i = 0; i < 60 * 5; i++) last = r.frame(1 / 60)
    expect(last.forward).toBe(1)
    expect(last.right).toBe(0)
    r.sim.dispose()
  })

  it('a lost keyup on the newest key frees steering and throttle after 1.5 s', () => {
    const r = rig()
    r.keys.press('KeyW', false, r.now())
    r.keys.press('KeyD', false, r.now())
    let last = r.frame(1 / 60)
    // keyup of D never arrives and nothing repeats.
    for (let i = 0; i < 60 * 1.4; i++) last = r.frame(1 / 60)
    expect(last.right).toBeGreaterThan(0.9)
    for (let i = 0; i < 60 * 0.6; i++) last = r.frame(1 / 60)
    expect(last.right).toBeLessThan(0.1)
    for (let i = 0; i < 30; i++) last = r.frame(1 / 60)
    expect(last.right).toBe(0)
    r.sim.dispose()
  })

  it('blur-style clear releases everything at once and ignores queued repeats', () => {
    const r = rig()
    r.keys.press('KeyW', false, r.now())
    r.keys.press('KeyD', false, r.now())
    r.frame(1 / 60)
    r.keys.clear()
    r.keys.press('KeyD', true, r.now())
    let last = r.frame(1 / 60)
    expect(last.forward).toBe(0)
    for (let i = 0; i < 30; i++) last = r.frame(1 / 60)
    expect(last.right).toBe(0)
    r.sim.dispose()
  })

  it('maps U/O/I/L to the two-wheeler rider counterweight', () => {
    const r = rig()
    const read = (codes: string[]) =>
      new GameInput().read(r.sim, { version: 1, name: 'x', entities: [] }, 1 / 60, {
        keys: new Set(codes),
        yaw: 0,
      })
    expect(read([])).toMatchObject({ riderRight: 0, riderForward: 0 })
    expect(read(['KeyO'])).toMatchObject({ riderRight: 1, riderForward: 0 })
    expect(read(['KeyU'])).toMatchObject({ riderRight: -1 })
    expect(read(['KeyI'])).toMatchObject({ riderForward: 1 })
    expect(read(['KeyL', 'KeyU'])).toMatchObject({ riderRight: -1, riderForward: -1 })
    r.sim.dispose()
  })

  it('sanitizes non-finite axes so the frame loop never throws', () => {
    const out = finiteInput({
      forward: Number.NaN,
      right: Number.POSITIVE_INFINITY,
      yaw: Number.NaN,
      lift: Number.NaN,
      turn: undefined,
      sprint: false,
      jump: false,
      brake: false,
    })
    expect([out.forward, out.right, out.yaw, out.lift, out.turn]).toEqual([0, 0, 0, 0, 0])
    const r = rig()
    const garbage = new GameInput().read(
      r.sim,
      { version: 1, name: 'x', entities: [] },
      Number.NaN,
      {
        keys: new Set(['KeyD']),
        yaw: Number.NaN,
        touch: { forward: Number.NaN, right: 0, lift: 0, turn: 0, brake: false },
      },
    )
    expect(() => r.sim.setInput(garbage)).not.toThrow()
    r.sim.dispose()
  })
})
