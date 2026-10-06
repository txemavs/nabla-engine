import { expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import {
  createDrivetrain,
  shiftGear,
  stepDrivetrain,
  engineBrakingForce,
} from '../../src/simulation/vehicles/drivetrain.js'
import { finishStartUp } from '../start-up.js'
it('holds manual gears, rejects overrev reductions and increases retention in lower gears', () => {
  const v = presetVehicle('car', 's3').vehicle!,
    spec = v.powertrain!,
    state = { ...createDrivetrain(), parked: false }
  state.gear = 3
  expect(shiftGear(state, spec, v.wheelRadius, 60, -1)).toBe(false)
  expect(state.gear).toBe(3)
  state.gear = 4
  for (let i = 0; i < 60; i++) stepDrivetrain(state, spec, v.wheelRadius, 15, 0, false, 1 / 60)
  expect(state.gear).toBe(4)
  const high = Math.abs(engineBrakingForce(state, spec, v.wheelRadius, 15))
  expect(shiftGear(state, spec, v.wheelRadius, 15, -1)).toBe(true)
  for (let i = 0; i < 60; i++) stepDrivetrain(state, spec, v.wheelRadius, 15, 0, false, 1 / 60)
  expect(Math.abs(engineBrakingForce(state, spec, v.wheelRadius, 15))).toBeGreaterThan(high)
  expect(engineBrakingForce(state, spec, v.wheelRadius, 0)).toBeCloseTo(0)
})
it('loses speed after throttle release, exposes manual mode and can resume automatic', () => {
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [2000, 1, 2000]
  const sim = new Simulation({
    version: 1,
    name: 'Retention',
    entities: [
      floor,
      presetVehicle('car', 's3', [0, 0.7, 0]),
      createEntity('spawn', 'spawn', [0, 1, 4]),
    ],
  })
  const ticks = (n: number) => {
    for (let i = 0; i < n; i++) sim.step(1 / 60)
  }
  try {
    ticks(180)
    sim.startInVehicle('s3')
    finishStartUp(sim)
    sim.setInput({ ...idleInput(), forward: 1 })
    // Entered in P: the pedal first waits out the D engagement dwell and torque cut.
    ticks(240 + 27)
    const before = sim.vehicleInfo('s3').speedKmh
    sim.setInput(idleInput())
    sim.shiftVehicle(-1)
    expect(sim.vehicleInfo('s3').manualTransmission).toBe(true)
    ticks(180)
    expect(sim.vehicleInfo('s3').speedKmh).toBeLessThan(before - 8)
    sim.automaticTransmission()
    expect(sim.vehicleInfo('s3').manualTransmission).toBe(false)
  } finally {
    sim.dispose()
  }
})
