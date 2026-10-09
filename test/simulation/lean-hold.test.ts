/** Lean hold: a released steer keeps the lean at riding speed; the other side brings it back up. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { parseScene } from '../../src/scene/document.js'
import { holdSteering } from '../../src/simulation/vehicles/two-wheeled/runtime.js'
import { finishStartUp } from '../start-up.js'

describe('holdSteering', () => {
  it('keeps a released demand, takes a larger one and winds back on the other side', () => {
    expect(holdSteering(0.6, 0, true, 2, 0.1)).toBe(0.6)
    expect(holdSteering(0.6, 0.3, true, 2, 0.1)).toBe(0.6)
    expect(holdSteering(0.6, 1, true, 2, 0.1)).toBe(1)
    expect(holdSteering(0.6, -1, true, 2, 0.1)).toBeCloseTo(0.4)
    expect(holdSteering(0, -1, true, 2, 0.1)).toBe(-1)
    expect(holdSteering(0.6, 0, false, 2, 0.1)).toBe(0)
  })
})

let sim: Simulation
beforeEach(() => {
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [10000, 1, 10000]
  const bike = presetVehicle('vfr800', 'bike', [0, 0.6, 0])
  delete bike.vehicle!.twoWheeled!.pegLean
  sim = new Simulation(
    parseScene({
      version: 1,
      name: 'Lean hold',
      entities: [floor, bike, createEntity('spawn', 'spawn', [3, 1, 4])],
    }),
  )
})
afterEach(() => sim.dispose())

const run = (seconds: number, each?: () => void) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    sim.step(1 / 60)
    each?.()
  }
}
const info = () => sim.vehicleInfo('bike')

describe('vfr800 lean hold', () => {
  it('keeps the lean after the steer is released and rights up only when steered back', () => {
    run(1)
    sim.startInVehicle('bike')
    finishStartUp(sim)
    sim.setInput({ ...idleInput(), forward: 1 })
    run(4)
    sim.setInput({ ...idleInput(), forward: 0.3, right: 0.5 })
    run(2)
    const leaned = info().lean
    expect(leaned).toBeLessThan(-0.1)
    // Released: the lean stays (no self-righting) and the bike does not fall.
    sim.setInput({ ...idleInput(), forward: 0.3 })
    run(3)
    expect(info().lean).toBeLessThan(leaned * 0.8)
    expect(sim.twoWheeledPose('bike')!.fallen).toBe(false)
    // Steering to the other side brings it back towards upright.
    sim.setInput({ ...idleInput(), forward: 0.3, right: -1 })
    let least = Math.abs(info().lean)
    run(1, () => (least = Math.min(least, Math.abs(info().lean))))
    expect(least).toBeLessThan(0.05)
    expect(sim.twoWheeledPose('bike')!.fallen).toBe(false)
  })
})
