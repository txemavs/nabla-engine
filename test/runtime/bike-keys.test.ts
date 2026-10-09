import { describe, expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { GameInput } from '../../src/runtime/input.js'
import type { Simulation } from '../../src/simulation/simulation.js'

/** Two-wheeler keys (Txema 2026-10-09): Space front lever, S rear pedal, W+S full throttle. */
describe('two-wheeler keyboard mapping', () => {
  const bike = presetVehicle('vfr800', 'bike', [0, 1, 0])
  const document = { version: 1 as const, name: 'Bike', entities: [bike] }
  const read = (codes: string[], speedKmh: number) => {
    const sim = {
      player: { vehicleId: 'bike' },
      vehicleInfo: () => ({ flightMode: false, speedKmh, reversing: false }),
    } as unknown as Simulation
    return new GameInput().read(sim, document, 1 / 60, { keys: new Set(codes), yaw: 0 })
  }

  it('Space is the front lever: half without Shift, full with it', () => {
    expect(read(['Space'], 40)).toMatchObject({ frontBrake: 0.5, brake: false, forward: 0 })
    expect(read(['Space', 'ShiftLeft'], 40)).toMatchObject({ frontBrake: 1, brake: false })
  })

  it('S / ArrowDown is the rear pedal when rolling, the paddle back at a standstill', () => {
    expect(read(['KeyS'], 40)).toMatchObject({ brake: true, forward: 0, frontBrake: 0 })
    expect(read(['ArrowDown'], 40)).toMatchObject({ brake: true, forward: 0 })
    expect(read(['KeyS'], 0)).toMatchObject({ brake: false, forward: -0.5 })
  })

  it('W + S (or the arrows) is full throttle, like Shift, without braking', () => {
    expect(read(['KeyW'], 0)).toMatchObject({ forward: 0.5, sprint: false })
    expect(read(['KeyW', 'ShiftLeft'], 0)).toMatchObject({ forward: 1, sprint: true })
    for (const keys of [
      ['KeyW', 'KeyS'],
      ['ArrowUp', 'ArrowDown'],
    ])
      for (const speed of [0, 40])
        expect(read(keys, speed)).toMatchObject({
          forward: 1,
          sprint: true,
          brake: false,
          frontBrake: 0,
        })
  })

  it('W + S + Space (or the arrows + Space) is full throttle and full front brake: burnout on the spot', () => {
    for (const keys of [
      ['KeyW', 'KeyS', 'Space'],
      ['ArrowUp', 'ArrowDown', 'Space'],
    ])
      expect(read(keys, 0)).toMatchObject({ forward: 1, frontBrake: 1, sprint: true, brake: false })
  })
})
