/** Phase-1 two-wheeled controller on the vfr800 preset: stand, ride, lean, brake, crawl, reset. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { parseScene } from '../../src/scene/document.js'
import { twoWheeledDefaults } from '../../src/config/simulation.js'
import { finishStartUp } from '../start-up.js'

const MAX_LEAN = twoWheeledDefaults.maxLean

let sim: Simulation
beforeEach(() => {
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [10000, 1, 10000]
  sim = new Simulation(
    parseScene({
      version: 1,
      name: 'Bike ride',
      entities: [
        floor,
        presetVehicle('vfr800', 'bike', [0, 0.6, 0]),
        createEntity('spawn', 'spawn', [3, 1, 4]),
      ],
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
const ride = () => {
  sim.startInVehicle('bike')
  finishStartUp(sim)
}

describe('vfr800 two-wheeled controller', () => {
  it('stands upright unoccupied and parked, with both tyres loaded', () => {
    run(5)
    expect(Math.abs(info().lean)).toBeLessThan(0.01)
    expect(info().twoWheeled).toBe(true)
    expect(info().leanAllowance).toBe(twoWheeledDefaults.fallLean)
    expect(sim.wheelContactInfo('bike').every((wheel) => wheel.isInContact)).toBe(true)
    const pose = sim.twoWheeledPose('bike')!
    expect(pose.frontCompression).toBeGreaterThan(0.01)
    expect(pose.rearCompression).toBeGreaterThan(0.01)
    expect(sim.twoWheeledPose('nope')).toBeNull()
  })

  it('accelerates through the gears in a straight line without leaning', () => {
    run(1)
    ride()
    sim.setInput({ ...idleInput(), forward: 1 })
    let to100 = 0,
      maxLean = 0
    run(10, () => {
      maxLean = Math.max(maxLean, Math.abs(info().lean))
      if (!to100 && info().speedKmh >= 100) to100 = sim.stats.ticks
    })
    expect(to100).toBeGreaterThan(0)
    expect(info().speedKmh).toBeGreaterThan(150)
    expect(info().gear).toBeGreaterThanOrEqual(3)
    expect(info().rpm).toBeGreaterThan(5000)
    expect(maxLean).toBeLessThan(0.02)
    // Wheels spin forward: negative roll about +X, the car wheel convention.
    expect(sim.twoWheeledPose('bike')!.rearRoll).toBeLessThan(-10)
  })

  it('leans into turns by speed and steer, within maxLean, and does not fall', () => {
    run(1)
    ride()
    sim.setInput({ ...idleInput(), forward: 1 })
    run(5)
    for (const [right, sign] of [
      [1, -1],
      [-1, 1],
    ] as const) {
      sim.setInput({ ...idleInput(), forward: 0.3, right })
      let peak = 0
      run(4, () => (peak = Math.max(peak, Math.abs(info().lean))))
      // Turning right leans right (negative), at the steady-turn lean capped by maxLean.
      expect(Math.sign(info().lean)).toBe(sign)
      expect(Math.abs(info().lean)).toBeGreaterThan(MAX_LEAN * 0.8)
      expect(peak).toBeLessThan(MAX_LEAN + 0.08)
      expect(Math.sign(info().turnRate)).toBe(-right)
      expect(sim.twoWheeledPose('bike')!.fallen).toBe(false)
    }
    // A gentle input leans less.
    sim.setInput({ ...idleInput(), forward: 0.3, right: 0.2 })
    run(3)
    expect(Math.abs(info().lean)).toBeLessThan(MAX_LEAN * 0.6)
    expect(Math.abs(info().lean)).toBeGreaterThan(0.02)
  })

  it('stops with either brake; the front brake is the stronger one', () => {
    const stopFrom = (input: Partial<ReturnType<typeof idleInput>>) => {
      sim.setInput({ ...idleInput(), forward: 1 })
      run(4)
      const start = info().speedKmh
      sim.setInput({ ...idleInput(), ...input })
      run(1.5)
      const drop = start - info().speedKmh
      run(10)
      return { start, drop, end: info().speedKmh, lean: info().lean }
    }
    run(1)
    ride()
    const front = stopFrom({ forward: -1 })
    const rear = stopFrom({ brake: true })
    for (const result of [front, rear]) {
      expect(result.start).toBeGreaterThan(80)
      expect(result.end).toBeLessThan(2)
      expect(Math.abs(result.lean)).toBeLessThan(0.05)
    }
    // With the combined brakes the pedal also works the front caliper (placeholder shares), and
    // the lever is held back by the stoppie assist, so the gap is smaller than with independent
    // brakes; the lever still stops clearly harder.
    expect(front.drop).toBeGreaterThan(rear.drop * 1.25)
    // No reverse: holding the front brake at a stop never engages R.
    sim.setInput({ ...idleInput(), forward: -1 })
    run(3)
    expect(info().gear).toBeGreaterThanOrEqual(0)
    expect(info().reversing).toBe(false)
  })

  it('crawls and turns at walking pace with the balance assist holding it up', () => {
    run(1)
    ride()
    sim.setInput({ ...idleInput(), forward: 0.05, right: 1 })
    let peak = 0
    run(4, () => {
      if (info().speedKmh > 8) sim.setInput({ ...idleInput(), right: 1 })
      else sim.setInput({ ...idleInput(), forward: 0.05, right: 1 })
      peak = Math.max(peak, Math.abs(info().lean))
    })
    expect(info().speedKmh).toBeGreaterThan(0.5)
    expect(peak).toBeLessThan(0.35)
    expect(sim.twoWheeledPose('bike')!.fallen).toBe(false)
    expect(Math.abs(sim.twoWheeledPose('bike')!.steeringAngle)).toBeGreaterThan(0.3)
  })

  it('falls over without the assist when stopped, and R stands it back up', () => {
    // Knock it over: disable the assist, push sideways.
    const bike = (
      sim as unknown as {
        vehicles: Map<
          string,
          {
            twoWheeled: { tuning: { balanceAssist: boolean } }
            body: { angularVelocity: { z: number }; wakeUp(): void }
          }
        >
      }
    ).vehicles.get('bike')!
    const tuning = bike.twoWheeled.tuning
    tuning.balanceAssist = false
    run(0.5)
    bike.body.angularVelocity.z = 1
    bike.body.wakeUp()
    run(4)
    expect(Math.abs(info().lean)).toBeGreaterThan(twoWheeledDefaults.fallLean)
    expect(sim.twoWheeledPose('bike')!.fallen).toBe(true)
    tuning.balanceAssist = true
    ride()
    sim.recoverVehicle()
    run(4)
    expect(Math.abs(info().lean)).toBeLessThan(0.05)
    expect(sim.twoWheeledPose('bike')!.fallen).toBe(false)
  })
})
