import { describe, expect, it } from 'vitest'
import { Simulation } from '../../src/simulation/simulation.js'
import { createEntity } from '../../src/entity/schema.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import {
  RemoteVehicle,
  blendWheels,
  entityStateSchema,
  quantizeWheels,
  type EntityState,
  type WheelVisuals,
} from '../../src/net/index.js'

const scene = () => ({
  version: 1 as const,
  name: 'Wheel visuals',
  entities: [
    {
      ...createEntity('ground', 'box', [0, -0.5, 0]),
      size: [200, 1, 200] as [number, number, number],
    },
    createEntity('spawn', 'spawn', [0, 1, 0]),
  ],
})

describe('wheel visuals channel', () => {
  it('quantises to a small grid and validates on the wire', () => {
    const q = quantizeWheels({
      steer: [0.12345, -0.5],
      suspension: [0.31234, 0.3],
      spinRate: [12.345, -3.21],
    })
    expect(q).toEqual({ steer: [0.123, -0.5], suspension: [0.312, 0.3], spinRate: [12.3, -3.2] })
    const state = {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
    }
    expect(entityStateSchema.safeParse({ ...state, wheels: q }).success).toBe(true)
    expect(
      entityStateSchema.safeParse({ ...state, wheels: { ...q, steer: Array(17).fill(0) } }).success,
    ).toBe(false)
  })
  it('blends per wheel and lets the newer wheel set win when the count changes', () => {
    const a: WheelVisuals = { steer: [0, 0], suspension: [0.3, 0.3], spinRate: [0, 10] }
    const b: WheelVisuals = { steer: [0.4, 0.2], suspension: [0.2, 0.3], spinRate: [10, 10] }
    const mid = blendWheels(a, b, 0.5)
    expect(mid.steer[0]).toBeCloseTo(0.2)
    expect(mid.suspension[0]).toBeCloseTo(0.25)
    expect(mid.spinRate[0]).toBeCloseTo(5)
    const six = {
      steer: [1, 1, 1, 1, 1, 1],
      suspension: [0, 0, 0, 0, 0, 0],
      spinRate: [0, 0, 0, 0, 0, 0],
    }
    expect(blendWheels(a, six, 0.7)).toBe(six)
  })
  it('hands interpolated wheels to the host and clears them on release', () => {
    const calls: (WheelVisuals | null)[] = []
    const host = {
      setEntityKinematic: () => true,
      moveKinematicEntity: () => true,
      setWheelVisualState: (_: string, w: WheelVisuals | null) => (calls.push(w), true),
    }
    const remote = new RemoteVehicle('copy', host)
    const at = (steer: number): EntityState => ({
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
      wheels: { steer: [steer], suspension: [0.3], spinRate: [0] },
    })
    remote.push(0, at(0), 0)
    remote.push(100, at(0.4), 100)
    remote.update(150) // 100 ms behind → halfway between the samples
    expect(calls.at(-1)!.steer[0]).toBeCloseTo(0.2)
    remote.release()
    expect(calls.at(-1)).toBeNull()
  })
  it('drives a vehicle’s wheel transforms from received values instead of raycasts', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    sim.addVehicles([presetVehicle('car', 'copy', [0, 1, -10])])
    for (let i = 0; i < 90; i++) sim.step(1 / 60)
    const own = sim.wheelVisualState('copy')!
    expect(own.steer.length).toBeGreaterThanOrEqual(4)
    expect([...own.steer, ...own.suspension, ...own.spinRate].every(Number.isFinite)).toBe(true)
    const before = sim.wheelTransforms('copy')
    const n = own.steer.length
    const override = {
      steer: own.steer.map((_, i) => (i === 0 ? 0.4 : 0)),
      suspension: own.suspension.map((s) => s - 0.05),
      spinRate: Array(n).fill(20),
    }
    expect(sim.setWheelVisualState('copy', override)).toBe(true)
    sim.step(1 / 60)
    const a = sim.wheelTransforms('copy')
    for (let i = 0; i < 6; i++) sim.step(1 / 60)
    const b = sim.wheelTransforms('copy')
    // Suspension: every wheel sits 5 cm higher on the (resting, level) body.
    for (let i = 0; i < n; i++)
      expect(a[i].position[1] - before[i].position[1]).toBeCloseTo(0.05, 2)
    // Steer: wheel 0 turns about the vertical; wheel 1 does not.
    const fwd = (q: number[]) => {
      // Forward (−Z) direction rotated by q, projected on the ground: removes the spin angle.
      const [x, y, z, w] = q
      return Math.atan2(-2 * (x * z + w * y), -(1 - 2 * (x * x + y * y)))
    }
    expect(Math.abs(fwd(a[0].rotation) - fwd(before[0].rotation))).toBeGreaterThan(0.3)
    expect(Math.abs(fwd(a[1].rotation) - fwd(before[1].rotation))).toBeLessThan(0.05)
    // Spin advances at the received rate.
    expect(a[2].rotation).not.toEqual(b[2].rotation)
    expect(sim.setWheelVisualState('copy', null)).toBe(true)
    expect(sim.setWheelVisualState('nope', override)).toBe(false)
    sim.dispose()
  })
})
