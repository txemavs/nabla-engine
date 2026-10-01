import { expect, it } from 'vitest'
import { presetVehicle, hasVehiclePreset } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { parseScene } from '../../src/scene/document.js'
import {
  createDrivetrain,
  isDriven,
  stepDrivetrain,
} from '../../src/simulation/vehicles/drivetrain.js'

it('limits delivered power, selects seven gears and reverses without gear hunting', () => {
  const v = presetVehicle('car', 's3').vehicle!
  const state = createDrivetrain()
  const gears = new Set<number>()
  for (let i = 0; i < 6000; i++) {
    const speed = i / 60
    stepDrivetrain(state, v.powertrain!, v.wheelRadius, speed, 1, false, 1 / 60)
    gears.add(state.gear)
    expect(state.force * speed).toBeLessThanOrEqual(400 * 735.49875 * 0.9 + 0.01)
    expect(state.rpm).toBeLessThanOrEqual(6900)
  }
  expect([...gears]).toEqual([1, 2, 3, 4, 5, 6, 7])
  stepDrivetrain(state, v.powertrain!, v.wheelRadius, 0, -1, false, 1 / 60)
  expect(state.gear).toBe(-1)
  expect(state.force).toBeLessThan(0)
  if (hasVehiclePreset('police'))
    expect(
      [0, 1, 2, 3].map((i) => isDriven(presetVehicle('police', 'p').vehicle!.drivenWheels, i)),
    ).toEqual([true, true, false, false])
})

it('accelerates, shifts, brakes and holds a burnout on Rapier ground', () => {
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [2000, 1, 2000]
  const car = presetVehicle('car', 's3', [0, 0.62, 0])
  const sim = new Simulation(
    parseScene({
      version: 1,
      name: 'S3',
      entities: [floor, car, createEntity('spawn', 'spawn', [0, 1, 4])],
    }),
  )
  const ticks = (n: number) => {
    for (let i = 0; i < n; i++) sim.step(1 / 60)
  }
  try {
    ticks(180)
    sim.startInVehicle('s3')
    sim.setInput({ ...idleInput(), forward: 1, brake: true })
    ticks(180)
    expect(sim.vehicleInfo('s3').tireSlip).toBeGreaterThan(0.9)
    expect(sim.vehicleInfo('s3').speedKmh).toBeLessThan(12)
    sim.setInput({ ...idleInput(), forward: 1 })
    ticks(480)
    const info = sim.vehicleInfo('s3')
    console.log('S3 after 8s', info.speedKmh, info.gear, info.rpm)
    expect(info.speedKmh).toBeGreaterThan(90)
    expect(info.gear).toBeGreaterThan(1)
    expect(sim.entityTransform('s3').position[1]).toBeGreaterThan(0.3)
    sim.setInput({ ...idleInput(), forward: -1 })
    ticks(120)
    expect(sim.vehicleInfo('s3').speedKmh).toBeLessThan(info.speedKmh)
  } finally {
    sim.dispose()
  }
})

it('keeps reverse while coasting backwards fast and never selects gear zero', () => {
  const v = presetVehicle('car', 's3').vehicle!
  const state = createDrivetrain()
  stepDrivetrain(state, v.powertrain!, v.wheelRadius, 0, -1, false, 1 / 60)
  expect(state.gear).toBe(-1)
  // A descent or a collision can exceed the powered reverse speed limit.
  // Opposite throttle is also converted to zero while the simulation brakes.
  for (let i = 0; i < 180; i++) {
    stepDrivetrain(state, v.powertrain!, v.wheelRadius, -20, 0, false, 1 / 60)
    expect(state.gear).toBe(-1)
    expect(state.force).toBe(0)
    expect(Number.isFinite(state.rpm)).toBe(true)
  }
  stepDrivetrain(state, v.powertrain!, v.wheelRadius, 0, 1, false, 1 / 60)
  expect(state.gear).toBe(1)
  expect(state.force).toBeGreaterThan(0)
})

it('recovers invalid gear indices before calculating wheel force', () => {
  const v = presetVehicle('car', 's3').vehicle!
  for (const gear of [0, -2, 8, 1.5, NaN]) {
    const state = { ...createDrivetrain(), gear }
    stepDrivetrain(state, v.powertrain!, v.wheelRadius, 0, 1, false, 1 / 60)
    expect(state.gear).toBe(1)
    expect(Number.isFinite(state.force)).toBe(true)
    expect(Number.isFinite(state.rpm)).toBe(true)
  }
})
