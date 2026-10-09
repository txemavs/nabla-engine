/**
 * Shift hooligan modifier on the vfr800: launch burnout, assist-free wheelie and stoppie (both
 * crash when held too long) and the stationary burnout. Without Shift nothing changes (the
 * other vfr800 suites cover that).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import type { PlayerInput } from '../../src/simulation/contracts.js'
import { parseScene } from '../../src/scene/document.js'
import { twoWheeledDefaults } from '../../src/config/simulation.js'
import { finishStartUp } from '../start-up.js'

let sim: Simulation | undefined
afterEach(() => {
  sim?.dispose()
  sim = undefined
})

function ride() {
  const floor = createEntity('floor', 'box', [0, -0.5, -4000])
  floor.size = [10000, 1, 10000]
  const bike = presetVehicle('vfr800', 'bike', [0, 0.6, 0])
  sim = new Simulation(
    parseScene({
      version: 1,
      name: 'Hooligan',
      entities: [floor, bike, createEntity('spawn', 'spawn', [3, 1, 4])],
    }),
  )
  const s = sim
  for (let i = 0; i < 60; i++) s.step(1 / 60)
  s.startInVehicle('bike')
  finishStartUp(s)
  const pose = () => s.twoWheeledPose('bike')!
  const rearSlip = () => s.wheelContactInfo('bike')[1]?.slip ?? 0
  const position = () => s.entityTransform('bike').position
  const run = (seconds: number, input: Partial<PlayerInput>) => {
    let max = -Infinity,
      min = Infinity
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      s.setInput({ ...idleInput(), ...input })
      s.step(1 / 60)
      max = Math.max(max, pose().pitch)
      min = Math.min(min, pose().pitch)
    }
    return { max, min }
  }
  return { pose, rearSlip, position, run }
}

const deg = Math.PI / 180

describe('Shift + throttle: launch burnout', () => {
  it('spins the rear well past road speed with smoke while still driving forward', () => {
    const { run, pose, rearSlip } = ride()
    run(1, { forward: 1, sprint: true })
    expect(pose().hooligan).toBe('burnout')
    expect(pose().roadSpeed).toBeGreaterThan(5 / 3.6)
    expect(pose().rearWheelSpeed / pose().roadSpeed).toBeGreaterThan(2)
    expect(rearSlip()).toBeGreaterThan(0.5)
    expect(pose().fallen).toBe(false)
  })

  it('does not spin the rear without Shift', () => {
    const { run, pose } = ride()
    run(1, { forward: 1 })
    expect(pose().rearWheelSpeed / pose().roadSpeed).toBeLessThan(1.05)
  })
})

describe('Shift + rider back + throttle: assist-free wheelie', () => {
  it('climbs far past the assisted wheelie and loops into a crash when held', () => {
    const { run, pose } = ride()
    const early = run(1.8, { forward: 1, sprint: true, riderForward: -1 })
    expect(pose().crashed).toBe(false)
    expect(early.max).toBeGreaterThan(twoWheeledDefaults.pitchAssist.wheelieMaxAngle + 10 * deg)
    run(3, { forward: 1, sprint: true, riderForward: -1 })
    expect(pose().crashed).toBe(true)
    expect(pose().fallen).toBe(true)
  })

  it('stays within the assisted wheelie without Shift', () => {
    const { run } = ride()
    const { max } = run(4, { forward: 1, riderForward: -1 })
    expect(max).toBeLessThan(twoWheeledDefaults.pitchAssist.wheelieMaxAngle + 5 * deg)
  })
})

describe('Shift + lever + pedal + throttle: stationary burnout', () => {
  it('keeps the bike in place and upright while the rear spins with smoke', () => {
    const { run, pose, rearSlip, position } = ride()
    const start = position()
    run(3, { forward: 1, frontBrake: 1, brake: true, sprint: true })
    const end = position()
    expect(pose().hooligan).toBe('stationary-burnout')
    expect(Math.hypot(end[0] - start[0], end[2] - start[2])).toBeLessThan(0.5)
    expect(pose().rearWheelSpeed).toBeGreaterThan(10)
    expect(rearSlip()).toBeGreaterThan(0.9)
    expect(Math.abs(pose().lean)).toBeLessThan(3 * deg)
    expect(pose().fallen).toBe(false)
  })
})

describe('W + S + Space (throttle + lever, no pedal): stationary burnout and donut', () => {
  const burn = { forward: 1, frontBrake: 1, sprint: true }
  const heading = (s: Simulation) => {
    const q = s.entityTransform('bike').rotation
    // Forward (-Z) rotated by the quaternion, projected on the ground.
    const [x, y, z, w] = q
    const fx = -(2 * (x * z + w * y)),
      fz = -(1 - 2 * (x * x + y * y))
    return Math.atan2(fx, -fz)
  }

  it('holds the bike in place, spins the rear with continuous slip and no braking flag', () => {
    const { run, pose, rearSlip, position } = ride()
    const start = position()
    run(3, burn)
    const end = position()
    expect(pose().hooligan).toBe('stationary-burnout')
    expect(Math.hypot(end[0] - start[0], end[2] - start[2])).toBeLessThan(0.5)
    expect(pose().rearWheelSpeed).toBeGreaterThan(10)
    expect(rearSlip()).toBeGreaterThan(0.9)
    expect(sim!.vehicleInfo('bike').braking).toBe(false)
    expect(Math.abs(pose().lean)).toBeLessThan(5 * deg)
  })

  it('steering leans the bike into the circle up to 45° and spins faster the more it leans', () => {
    const { run, pose, position } = ride()
    run(1, burn)
    const start = position()
    const turn = (from: number) => {
      const d = heading(sim!) - from
      return Math.atan2(Math.sin(d), Math.cos(d))
    }
    let maxLean = 0
    const sample = (seconds: number) => {
      const h = heading(sim!)
      for (let i = 0; i < Math.round(seconds * 60); i++) {
        run(1 / 60, { ...burn, right: 1 })
        maxLean = Math.max(maxLean, Math.abs(pose().lean))
      }
      return { lean: Math.abs(pose().lean), turn: turn(h) }
    }
    const early = sample(0.4)
    const late = sample(0.4)
    const full = sample(0.6)
    expect(early.lean).toBeLessThan(late.lean)
    expect(Math.abs(late.turn)).toBeGreaterThan(Math.abs(early.turn))
    expect(full.lean).toBeGreaterThan(35 * deg)
    expect(maxLean).toBeLessThanOrEqual(46 * deg)
    // Leaning to the right (negative) with right steering, i.e. into the circle.
    expect(pose().lean).toBeLessThan(0)
    expect(Math.abs(full.turn)).toBeGreaterThan(40 * deg)
    expect(pose().hooligan).toBe('stationary-burnout')
    expect(pose().fallen).toBe(false)
    const end = position()
    expect(Math.hypot(end[0] - start[0], end[2] - start[2])).toBeLessThan(2.5)
    // Throttle off (lever still held): back upright and the rotation stops.
    run(2, { frontBrake: 1, sprint: true, right: 1 })
    expect(Math.abs(pose().lean)).toBeLessThan(5 * deg)
    const h = heading(sim!)
    run(0.5, { frontBrake: 1, sprint: true, right: 1 })
    expect(Math.abs(turn(h))).toBeLessThan(3 * deg)
    expect(pose().fallen).toBe(false)
    // Left steering goes the other way.
    const other = ride()
    other.run(1, burn)
    const g0 = heading(sim!)
    other.run(1.5, { ...burn, right: -1 })
    expect(other.pose().lean).toBeGreaterThan(0)
    expect(Math.sign(turn(g0))).toBe(-Math.sign(full.turn))
  })

  it('letting go of the lever launches with a wheelie kick', () => {
    const { run, pose } = ride()
    run(1.5, burn)
    const launch = run(1.2, { forward: 1, sprint: true })
    expect(pose().roadSpeed).toBeGreaterThan(5 / 3.6)
    expect(launch.max).toBeGreaterThan(3 * deg)
  })
})

describe('Shift while braking: assist-free stoppie', () => {
  it('lifts the rear coming to a stop and lands when Shift is let go', () => {
    const { run, pose } = ride()
    run(2.2, { forward: 1 })
    const lift = run(1, { forward: -1, sprint: true })
    expect(lift.min).toBeLessThan(-20 * deg)
    expect(pose().crashed).toBe(false)
    run(3, { forward: -1 })
    expect(pose().crashed).toBe(false)
    expect(Math.abs(pose().pitch)).toBeLessThan(5 * deg)
  })

  it('goes over the front and crashes when Shift is held', () => {
    const { run, pose } = ride()
    run(2.2, { forward: 1 })
    run(4, { forward: -1, sprint: true })
    expect(pose().crashed).toBe(true)
    expect(pose().fallen).toBe(true)
  })
})
