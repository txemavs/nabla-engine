/** Lean hold with manual hang-off toward the lean; otherwise a slower self-righting return. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { parseScene } from '../../src/scene/document.js'
import { holdSteering } from '../../src/simulation/vehicles/two-wheeled/runtime.js'
import { finishStartUp } from '../start-up.js'

const tuning = { rate: 2, returnSeconds: 0.3 }

describe('holdSteering', () => {
  it('holds a released demand with the throttle closed and winds back on the other side', () => {
    expect(holdSteering(0.6, 0, 0, tuning, 0.1)).toBe(0.6)
    expect(holdSteering(0.6, 0.3, 0, tuning, 0.1)).toBe(0.6)
    expect(holdSteering(0.6, 1, 0, tuning, 0.1)).toBe(1)
    expect(holdSteering(0.6, -1, 0, tuning, 0.1)).toBeCloseTo(0.4)
    expect(holdSteering(0, -1, 0, tuning, 0.1)).toBe(-1)
  })
  it('returns with throttle, faster the more throttle, at once at full throttle', () => {
    const half = holdSteering(0.6, 0, 0.5, tuning, 0.1)
    const most = holdSteering(0.6, 0, 0.9, tuning, 0.1)
    expect(half).toBeLessThan(0.6)
    expect(most).toBeLessThan(half)
    expect(holdSteering(0.6, 0, 1, tuning, 0.1)).toBe(0)
    expect(holdSteering(0.6, -0.5, 0.3, tuning, 0.1)).toBe(-0.5)
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
const leanIntoRightTurn = () => {
  run(1)
  sim.startInVehicle('bike')
  finishStartUp(sim)
  sim.setInput({ ...idleInput(), forward: 1 })
  run(4)
  sim.setInput({ ...idleInput(), forward: 0.3, right: 0.5 })
  run(2)
  return info().lean
}
/** Seconds from the steer release (at `forward` throttle) until the lean is under 20 %. */
const rightingTime = (forward: number) => {
  const leaned = leanIntoRightTurn()
  sim.setInput({ ...idleInput(), forward })
  let ticks = 0
  while (ticks < 600 && Math.abs(info().lean) > Math.abs(leaned) * 0.2) {
    run(1 / 60)
    ticks++
  }
  return ticks / 60
}

describe('vfr800 lean hold', () => {
  it('keeps the lean with the throttle closed and rights only when steered back', () => {
    const leaned = leanIntoRightTurn()
    expect(leaned).toBeLessThan(-0.1)
    sim.setInput({ ...idleInput() })
    run(2)
    expect(info().lean).toBeLessThan(leaned * 0.8)
    expect(sim.twoWheeledPose('bike')!.fallen).toBe(false)
    sim.setInput({ ...idleInput(), right: -1 })
    let least = Math.abs(info().lean)
    run(1.5, () => (least = Math.min(least, Math.abs(info().lean))))
    expect(least).toBeLessThan(0.08)
    expect(sim.twoWheeledPose('bike')!.fallen).toBe(false)
  })

  it('self-rights with throttle, slower with partial throttle', () => {
    const full = rightingTime(1)
    sim.dispose()
    beforeEachAgain()
    const partial = rightingTime(0.4)
    console.log('righting seconds', { full, partial })
    expect(full).toBeLessThan(1.5)
    expect(partial).toBeGreaterThan(full * 1.3)
    expect(partial).toBeLessThan(5)
  })
})

function beforeEachAgain() {
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
}
