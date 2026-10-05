import { describe, expect, it } from 'vitest'
import { roadVehicleDefaults } from '../../src/config/simulation.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { vehicleField } from '../../src/entity/vehicle/field.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import {
  createDrivetrain,
  gearboxTuning,
  shiftGear,
  stepDrivetrain,
} from '../../src/simulation/vehicles/drivetrain.js'
import { createWheeledVehicle } from '../../src/simulation/vehicles/wheeled/runtime.js'
import { Body, Box, Vec3 } from '../../src/simulation/physics.js'

const car = () => presetVehicle('car', 's3').vehicle!
const truck = () => presetVehicle('white-truck', 'truck').vehicle!
const dt = 1 / 60

function flatSim(entity: string, catalog: string, withTrailer = false) {
  const floor = createEntity('floor', 'box', [0, -0.5, -4000])
  floor.size = [10000, 1, 10000]
  const vehicle = presetVehicle(catalog, entity, [0, 1.45, 0])
  const entities = [floor, createEntity('spawn', 'spawn', [5, 1, 0]), vehicle]
  if (withTrailer) {
    const trailer = presetVehicle('white-trailer', 'trailer', [0, 1.45, 7.33])
    trailer.vehicle!.tow = {
      vehicleId: entity,
      hitch: vehicle.vehicle!.hitch!,
      anchor: trailer.vehicle!.towAnchor!,
    }
    entities.push(trailer)
  }
  const sim = new Simulation({ version: 1, name: 'Gear feel', entities })
  for (let i = 0; i < 180; i++) sim.step(dt)
  sim.startInVehicle(entity)
  return sim
}

describe('automatic and manual gear changes', () => {
  it('cuts torque for the configured shift time, counts the change and respects the cooldown', () => {
    for (const v of [car(), truck()]) {
      const spec = v.powertrain!
      const tuning = gearboxTuning(spec)
      const state = createDrivetrain()
      // Wheel speed that couples gear 1 just above the upshift point.
      const wheelRpm = (tuning.upshiftRpm * 1.02) / (spec.ratios[0] * spec.finalDrive)
      const speed = (wheelRpm * 2 * Math.PI * v.wheelRadius) / 60
      stepDrivetrain(state, spec, v.wheelRadius, speed, 1, false, dt)
      expect(state.gear).toBe(2)
      expect(state.shiftCount).toBe(1)
      // Automatic changes are counted but silent.
      expect(state.clackCount).toBe(0)
      expect(state.shiftRemaining).toBeCloseTo(tuning.seconds, 5)
      expect(state.load).toBeCloseTo(tuning.torqueFraction)
      expect(state.cooldown).toBeGreaterThan(tuning.cooldownSeconds - 2 * dt)
      // Full torque returns only after the shift time.
      for (let i = 0; i < Math.ceil(tuning.seconds / dt) + 1; i++)
        stepDrivetrain(state, spec, v.wheelRadius, speed, 1, false, dt)
      expect(state.load).toBe(1)
      expect(state.shiftCount).toBe(1)
    }
  })

  it('counts manual shifts and refuses a second one during the torque cut', () => {
    const v = car()
    const state = createDrivetrain()
    state.gear = 3
    expect(shiftGear(state, v.powertrain!, v.wheelRadius, 10, 1)).toBe(true)
    expect(state.shiftCount).toBe(1)
    expect(state.shiftRemaining).toBeCloseTo(roadVehicleDefaults.gearShiftSeconds)
    expect(shiftGear(state, v.powertrain!, v.wheelRadius, 10, 1)).toBe(false)
    expect(state.shiftCount).toBe(1)
  })

  it('keeps the car shift points of the previous tuning when nothing is overridden', () => {
    const tuning = gearboxTuning(car().powertrain)
    expect(tuning.upshiftRpm).toBeCloseTo(6400)
    expect(tuning.downshiftRpm).toBeCloseTo(2300)
    expect(tuning.overrevRpm).toBeCloseTo(6500)
    expect(tuning.launchRpm).toBeCloseTo(2400)
    expect(tuning.rpmResponse).toBe(16)
  })
})

describe('truck gearbox', () => {
  it('has its own heavier gearbox and clack profile than the car', () => {
    const t = truck().powertrain!
    const c = car().powertrain!
    const tt = gearboxTuning(t)
    const ct = gearboxTuning(c)
    expect(t.ratios).toHaveLength(6)
    expect(tt.seconds).toBeGreaterThanOrEqual(ct.seconds * 3)
    expect(tt.cooldownSeconds).toBeGreaterThan(ct.cooldownSeconds)
    expect(tt.directionSeconds).toBeGreaterThan(ct.directionSeconds)
    expect(tt.directionShiftSeconds).toBeGreaterThan(ct.directionShiftSeconds)
    expect(tt.rpmResponse).toBeLessThan(ct.rpmResponse)
    expect(tt.torqueFraction).toBeLessThan(ct.torqueFraction)
    expect(tt.upshiftRpm).toBeLessThan(t.maxRpm!)
    expect(tt.upshiftRpm).toBeGreaterThan(tt.downshiftRpm)
    // The sound is the truck's own: lower, longer, with an air release; the car has none.
    const tc = t.shift!.clack!
    expect(tc.clunkHz!).toBeLessThan(80)
    expect(tc.clickHz!).toBeLessThan(1200)
    expect(tc.decaySeconds!).toBeGreaterThan(0.15)
    expect(tc.airSeconds!).toBeGreaterThan(0.2)
    expect(tc.gain!).toBeGreaterThan(1)
    expect(c.shift?.clack?.airSeconds ?? 0).toBe(0)
  })

  it('never hunts: a ratio step lands between the downshift and upshift points', () => {
    const spec = truck().powertrain!
    const { upshiftRpm, downshiftRpm } = gearboxTuning(spec)
    for (let g = 1; g < spec.ratios.length; g++) {
      const step = spec.ratios[g - 1] / spec.ratios[g]
      expect(upshiftRpm / step).toBeGreaterThan(downshiftRpm * 1.1)
      expect(downshiftRpm * step).toBeLessThan(upshiftRpm * 0.95)
    }
  })

  it('climbs through six gears, drops rpm at every change and never pins the governor', () => {
    const sim = flatSim('truck', 'white-truck')
    try {
      sim.setInput({ ...idleInput(), forward: 1 })
      let gear = 1
      let peak = 0
      let before = 0
      let watch: { rpm: number; lowest: number; ticks: number } | null = null
      const drops: number[] = []
      const counted: number[] = []
      for (let i = 0; i < 60 * 30; i++) {
        sim.step(dt)
        const info = sim.vehicleInfo('truck')
        peak = Math.max(peak, info.rpm)
        if (info.gear !== gear) {
          expect(info.gear).toBe(gear + 1)
          counted.push(info.gearShifts)
          watch = { rpm: before, lowest: info.rpm, ticks: 0 }
          gear = info.gear
        }
        if (watch && ++watch.ticks <= 30) {
          watch.lowest = Math.min(watch.lowest, info.rpm)
          if (watch.ticks === 30) drops.push(watch.rpm - watch.lowest)
        }
        before = info.rpm
      }
      expect(gear).toBe(6)
      expect(counted).toEqual([1, 2, 3, 4, 5])
      // Within half a second of every change the engine has visibly dropped.
      expect(drops).toHaveLength(5)
      for (const drop of drops) expect(drop).toBeGreaterThan(200)
      expect(peak).toBeLessThan(2300)
    } finally {
      sim.dispose()
    }
  })

  it('runs to the governed top speed in sixth without leaving it', () => {
    const sim = flatSim('truck', 'white-truck', true)
    try {
      sim.setInput({ ...idleInput(), forward: 1 })
      for (let i = 0; i < 60 * 60; i++) sim.step(dt)
      const info = sim.vehicleInfo('truck')
      expect(info.gear).toBe(6)
      expect(info.rpm).toBeLessThan(2300)
      expect(info.speedKmh).toBeGreaterThan(110)
    } finally {
      sim.dispose()
    }
  })
})

describe('brake, stop, then engage reverse', () => {
  for (const [entity, catalog] of [
    ['s3', 'car'],
    ['truck', 'white-truck'],
  ] as const) {
    it(`${entity}: stays in drive and brakes while rolling, stops, dwells, then clacks into R`, () => {
      const sim = flatSim(entity, catalog)
      try {
        sim.setInput({ ...idleInput(), forward: 1 })
        for (let i = 0; i < 60 * 6; i++) sim.step(dt)
        const cruising = sim.vehicleInfo(entity)
        expect(cruising.speedKmh).toBeGreaterThan(25)
        expect(cruising.gear).toBeGreaterThan(0)
        sim.setInput({ ...idleInput(), forward: -1 })
        const spec = presetVehicle(catalog, entity).vehicle!.powertrain!
        const dwell = gearboxTuning(spec).directionSeconds
        let stoppedFor = 0
        let engagedAfter = -1
        let shiftsBefore = sim.vehicleInfo(entity).gearShifts
        let lastForwardSpeed = Infinity
        for (let i = 0; i < 60 * 40; i++) {
          sim.step(dt)
          const info = sim.vehicleInfo(entity)
          // Downshifts while braking are allowed; only the reverse engagement is checked below.
          if (info.gear > 0) {
            shiftsBefore = info.gearShifts
            if (info.speedKmh / 3.6 < roadVehicleDefaults.directionChangeSpeed) stoppedFor += dt
            else stoppedFor = 0
            lastForwardSpeed = info.speedKmh / 3.6
          } else {
            engagedAfter = stoppedFor
            // Exactly one counted change brought it into R, at standstill.
            expect(info.gearShifts).toBe(shiftsBefore + 1)
            expect(lastForwardSpeed).toBeLessThanOrEqual(roadVehicleDefaults.directionChangeSpeed)
            break
          }
        }
        expect(engagedAfter).toBeGreaterThanOrEqual(dwell - 2 * dt)
        expect(engagedAfter).toBeLessThan(dwell + 0.25)
        expect(engagedAfter).toBeLessThan(1)
        // Torque is still cut for the engagement moment; the vehicle has not moved backwards.
        expect(sim.vehicleInfo(entity).shifting).toBe(true)
        expect(Math.abs(sim.vehicleInfo(entity).speedKmh)).toBeLessThan(2)
        for (let i = 0; i < 60 * 3; i++) sim.step(dt)
        expect(sim.vehicleInfo(entity).reversing).toBe(true)
        expect(sim.vehicleInfo(entity).shifting).toBe(false)
      } finally {
        sim.dispose()
      }
    })
  }

  it('the truck dwells and shifts longer than the car', () => {
    const t = gearboxTuning(truck().powertrain)
    const c = gearboxTuning(car().powertrain)
    expect(t.directionSeconds + t.directionShiftSeconds).toBeGreaterThan(
      c.directionSeconds + c.directionShiftSeconds,
    )
  })
})

describe('gearbox configuration', () => {
  it('validates shift tuning in the schema and the runtime', () => {
    const base = car()
    expect(
      vehicleField.safeParse({
        ...base,
        powertrain: { ...base.powertrain, shift: { clack: { clunkHz: 60, airSeconds: 0.4 } } },
      }).success,
    ).toBe(true)
    expect(
      vehicleField.safeParse({
        ...base,
        powertrain: { ...base.powertrain, shift: { clack: { unknown: 1 } } },
      }).success,
    ).toBe(false)
    expect(
      vehicleField.safeParse({
        ...base,
        powertrain: { ...base.powertrain, shift: { seconds: 0 } },
      }).success,
    ).toBe(false)
    const body = new Body({ mass: 1000 })
    body.addShape(new Box(new Vec3(1, 0.5, 2)))
    const definition = {
      hubs: base.hubs as never,
      wheelRadius: base.wheelRadius,
      suspensionRest: base.suspensionRest,
      stiffness: base.stiffness,
      engineForce: base.engineForce,
      brakeForce: base.brakeForce,
    }
    expect(() =>
      createWheeledVehicle(body, {
        ...definition,
        powertrain: { ...base.powertrain!, shift: { upshiftRpm: 2000, downshiftRpm: 3000 } },
      }),
    ).toThrow('Invalid wheeled vehicle definition')
    expect(() =>
      createWheeledVehicle(body, {
        ...definition,
        powertrain: { ...base.powertrain!, shift: { seconds: Number.NaN } },
      }),
    ).toThrow('Invalid wheeled vehicle definition')
  })
})
