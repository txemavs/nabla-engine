import { describe, expect, it } from 'vitest'
import { Scene, Vector3 } from 'three'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { s3Instruments } from '../../src/catalog/monitors/s3-instruments.js'
import { roadVehicleDefaults } from '../../src/config/simulation.js'
import { createEntity } from '../../src/entity/schema.js'
import { gearLabel } from '../../src/entity/vehicle/gear-label.js'
import { VehicleEffects } from '../../src/runtime/vehicle-effects.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { finishStartUp } from '../start-up.js'
import {
  createDrivetrain,
  effectivePowertrain,
  engineBrakingForce,
  gearboxTuning,
  gearForSpeed,
  selectNeutralOrPark,
  stepDrivetrain,
} from '../../src/simulation/vehicles/drivetrain.js'

const dt = 1 / 60
const vehicles = [
  ['s3', 'car'],
  ['truck', 'white-truck'],
] as const

describe('parking on a slope', () => {
  it.each(['car', 'vfr800'] as const)(
    'holds %s against forward and sideways downhill creep and releases on drive',
    (catalog) => {
      const slope = 0.12
      for (const yaw of [0, Math.PI / 2]) {
        const floor = createEntity('floor', 'box', [0, -0.5, 0])
        floor.size = [100, 1, 100]
        floor.transform.rotation = [0, 0, Math.sin(slope / 2), Math.cos(slope / 2)]
        const bike = presetVehicle(catalog, 'vehicle', [0, 1, 0])
        bike.transform.rotation = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]
        const s = new Simulation({
          version: 1,
          name: 'Slope',
          entities: [floor, bike, createEntity('spawn', 'spawn', [5, 1, 0])],
        })
        try {
          for (let i = 0; i < 180; i++) s.step(dt)
          const start = s.entityTransform('vehicle').position
          for (let i = 0; i < 600; i++) s.step(dt)
          const end = s.entityTransform('vehicle').position
          expect(Math.hypot(end[0] - start[0], end[2] - start[2])).toBeLessThan(0.05)
          expect(s.vehicleInfo('vehicle').parked).toBe(true)
          s.startInVehicle('vehicle')
          finishStartUp(s)
          for (let i = 0; i < 120; i++) {
            s.setInput({ ...idleInput(), forward: 1 })
            s.step(dt)
          }
          expect(s.vehicleInfo('vehicle').parked).toBe(false)
          expect(s.vehicleInfo('vehicle').speedKmh).toBeGreaterThan(5)
        } finally {
          s.dispose()
        }
      }
    },
  )
})

describe('N and P selector, unit level', () => {
  it('uses the documented default timings', () => {
    expect(roadVehicleDefaults.neutralSeconds).toBe(0.4)
    expect(roadVehicleDefaults.parkSeconds).toBe(1.5)
    const car = gearboxTuning(presetVehicle('car', 's3').vehicle!.powertrain)
    expect([car.neutralSeconds, car.parkSeconds]).toEqual([0.4, 1.5])
    const truck = gearboxTuning(presetVehicle('white-truck', 'truck').vehicle!.powertrain)
    expect([truck.neutralSeconds, truck.parkSeconds]).toEqual([0.8, 2.5])
  })

  it('D -> N after neutralSeconds -> P after parkSeconds, then nothing moves it', () => {
    const state = { ...createDrivetrain(), gear: 1, parked: false }
    const tuning = gearboxTuning()
    let t = 0
    const run = (seconds: number, handbrake: boolean) => {
      for (let i = 0; i < Math.round(seconds / dt); i++) {
        selectNeutralOrPark(state, 0, 0, handbrake, dt, tuning)
        t += dt
      }
    }
    run(tuning.neutralSeconds - 0.1, true)
    expect(state.gear).toBe(1)
    run(0.15, true)
    expect(state.gear).toBe(0)
    expect(state.parked).toBe(false)
    expect(state.clackCount).toBe(0)
    run(tuning.parkSeconds - 0.1, true)
    expect(state.parked).toBe(false)
    run(0.15, true)
    expect(state.parked).toBe(true)
    expect(state.clackCount).toBe(1)
    expect(state.shiftCount).toBe(2)
    run(30, false)
    run(30, true)
    expect([state.gear, state.parked, state.clackCount]).toEqual([0, true, 1])
    expect(t).toBeGreaterThan(60)
  })

  it('does not go to N while a pedal is down, rolling, or without the handbrake', () => {
    const tuning = gearboxTuning()
    for (const [speed, throttle, handbrake] of [
      [0, 1, true],
      [0, -1, true],
      [3, 0, true],
      [0, 0, false],
    ] as const) {
      const state = { ...createDrivetrain(), gear: 1, parked: false }
      for (let i = 0; i < 600; i++)
        selectNeutralOrPark(state, speed, throttle, handbrake, dt, tuning)
      expect(state.gear).toBe(1)
    }
  })

  it('releasing the handbrake in N keeps N, and the park timer restarts on the next stop', () => {
    const state = { ...createDrivetrain(), gear: 1, parked: false }
    const tuning = gearboxTuning()
    for (let i = 0; i < 60; i++) selectNeutralOrPark(state, 0, 0, true, dt, tuning)
    expect(state.gear).toBe(0)
    for (let i = 0; i < 60 * 10; i++) selectNeutralOrPark(state, 0, 0, false, dt, tuning)
    expect([state.gear, state.parked]).toEqual([0, false])
    // Almost a full park time with the handbrake, interrupted, must not accumulate.
    for (let i = 0; i < 80; i++) selectNeutralOrPark(state, 0, 0, true, dt, tuning)
    selectNeutralOrPark(state, 0, 0, false, dt, tuning)
    for (let i = 0; i < 80; i++) selectNeutralOrPark(state, 0, 0, true, dt, tuning)
    expect(state.parked).toBe(false)
  })

  it('N and P deliver no drive force, no engine braking and no NaN', () => {
    const v = presetVehicle('car', 's3').vehicle!
    for (const parked of [false, true]) {
      const state = { ...createDrivetrain(), gear: 0, parked }
      stepDrivetrain(state, v.powertrain!, v.wheelRadius, 0, 0, false, dt)
      expect(state.force).toBe(0)
      expect(state.gear).toBe(0)
      expect(engineBrakingForce(state, v.powertrain!, v.wheelRadius, 5)).toBe(0)
      expect(Number.isFinite(state.rpm)).toBe(true)
    }
  })

  it('W from P engages D after the dwell with one clack; S engages R', () => {
    const v = presetVehicle('car', 's3').vehicle!
    const dwell = gearboxTuning(v.powertrain).directionSeconds
    for (const [pedal, gear] of [
      [1, 1],
      [-1, -1],
    ] as const) {
      const state = { ...createDrivetrain(), gear: 0, parked: true }
      let held = 0
      let engaged = -1
      for (let i = 0; i < 120 && engaged < 0; i++) {
        stepDrivetrain(state, v.powertrain!, v.wheelRadius, 0, pedal, true, dt)
        held += dt
        if (state.gear !== 0) engaged = held
        else expect(state.force).toBe(0)
      }
      expect(state.gear).toBe(gear)
      expect(state.parked).toBe(false)
      expect(engaged).toBeGreaterThanOrEqual(dwell - 2 * dt)
      expect(engaged).toBeLessThan(dwell + 0.1)
      expect(state.clackCount).toBe(1)
    }
  })

  it('from N rolling forward W engages immediately in a suitable gear; S still waits for a stop', () => {
    const v = presetVehicle('car', 's3').vehicle!
    const speed = 25 // m/s
    const state = { ...createDrivetrain(), gear: 0, parked: false }
    stepDrivetrain(state, v.powertrain!, v.wheelRadius, speed, 1, false, dt)
    // The S3 starts in Normal: its shift points come from the Normal engine mode.
    const normal = effectivePowertrain(v.powertrain!, 'normal')
    expect(state.gear).toBe(
      gearForSpeed(normal, v.wheelRadius, speed, gearboxTuning(normal).upshiftRpm),
    )
    expect(state.gear).toBeGreaterThan(2)
    const reverse = { ...createDrivetrain(), gear: 0, parked: false }
    for (let i = 0; i < 60; i++)
      stepDrivetrain(reverse, v.powertrain!, v.wheelRadius, speed, -1, false, dt)
    expect(reverse.gear).toBe(0)
    expect(reverse.changingDirection).toBe(true)
  })
})

describe('N and P in a driven vehicle', () => {
  for (const [entity, catalog] of vehicles) {
    it(`${entity}: handbrake stop -> N -> P, stays P with handbrake released, W -> D, S -> R`, () => {
      const floor = createEntity('floor', 'box', [0, -0.5, -4000])
      floor.size = [10000, 1, 10000]
      const document = {
        version: 1 as const,
        name: 'Park',
        entities: [
          floor,
          createEntity('spawn', 'spawn', [5, 1, 0]),
          presetVehicle(catalog, entity, [0, 1.45, 0]),
        ],
      }
      const sim = new Simulation(document)
      for (let i = 0; i < 180; i++) sim.step(dt)
      sim.startInVehicle(entity)
      const calls: unknown[] = []
      const audio = { gearChange: (profile: unknown) => calls.push(profile) } as never
      const stub = new Proxy(audio as object, {
        get: (target, key) => (key in target ? (target as never)[key] : () => {}),
      }) as never
      const effects = new VehicleEffects(new Scene(), stub)
      const tuning = gearboxTuning(presetVehicle(catalog, entity).vehicle!.powertrain)
      const eye = new Vector3()
      const step = (seconds: number, input: Partial<ReturnType<typeof idleInput>>) => {
        for (let i = 0; i < Math.round(seconds / dt); i++) {
          sim.setInput({ ...idleInput(), ...input })
          sim.step(dt)
          effects.updateAudio(sim, document, eye)
        }
      }
      const info = () => sim.vehicleInfo(entity)
      try {
        step(5, { forward: 1 })
        expect(info().speedKmh).toBeGreaterThan(15)
        expect(info().gear).toBeGreaterThan(0)
        const clacksDriving = calls.length
        // Handbrake while rolling: still in D until it has really stopped.
        let stoppedAt = -1
        let neutralAt = -1
        let parkedAt = -1
        let t = 0
        for (let i = 0; i < 60 * 40 && parkedAt < 0; i++) {
          step(dt, { brake: true })
          t += dt
          const now = info()
          if (
            stoppedAt < 0 &&
            Math.abs(now.speedKmh) / 3.6 < roadVehicleDefaults.directionChangeSpeed
          )
            stoppedAt = t
          if (neutralAt < 0 && now.gear === 0) neutralAt = t
          if (now.parked) parkedAt = t
          if (stoppedAt < 0) expect(now.gear).toBeGreaterThan(0)
        }
        expect(stoppedAt).toBeGreaterThan(0)
        expect(neutralAt - stoppedAt).toBeGreaterThanOrEqual(tuning.neutralSeconds - 3 * dt)
        expect(neutralAt - stoppedAt).toBeLessThan(tuning.neutralSeconds + 0.2)
        expect(parkedAt - neutralAt).toBeGreaterThanOrEqual(tuning.parkSeconds - 3 * dt)
        expect(parkedAt - neutralAt).toBeLessThan(tuning.parkSeconds + 0.2)
        expect(info().gear).toBe(0)
        expect(gearLabel(info().gear, info().manualTransmission, info().parked)).toBe('P')
        // Only P is audible (one clack); N is silent.
        expect(calls.length - clacksDriving).toBe(1)

        // Handbrake released, no pedal: it must stay in P and not creep.
        const position = info().speedKmh
        step(10, {})
        expect(info().parked).toBe(true)
        expect(info().gear).toBe(0)
        expect(Math.abs(info().speedKmh - position)).toBeLessThan(0.5)
        expect(calls.length - clacksDriving).toBe(1)

        // W selects D after the dwell, with a clack, then accelerates.
        step(tuning.directionSeconds + tuning.directionShiftSeconds + 1.5, { forward: 1 })
        expect(info().parked).toBe(false)
        expect(info().gear).toBeGreaterThan(0)
        expect(info().speedKmh).toBeGreaterThan(1)
        expect(calls.length - clacksDriving).toBe(2)

        // Back to P, then S selects R.
        step(60, { brake: true })
        for (let i = 0; i < 60 * 60 && !info().parked; i++) step(dt, { brake: true })
        expect(info().parked).toBe(true)
        const clacksParked = calls.length
        step(tuning.directionSeconds + tuning.directionShiftSeconds + 1.5, { forward: -1 })
        expect(info().gear).toBe(-1)
        expect(info().parked).toBe(false)
        expect(info().reversing).toBe(true)
        expect(info().speedKmh).toBeGreaterThan(0.5)
        expect(calls.length - clacksParked).toBe(1)
      } finally {
        effects.dispose()
        sim.dispose()
      }
    })
  }

  it('W or S while still rolling keeps the stop-before-reverse logic', () => {
    const floor = createEntity('floor', 'box', [0, -0.5, -4000])
    floor.size = [10000, 1, 10000]
    const sim = new Simulation({
      version: 1,
      name: 'Rolling',
      entities: [
        floor,
        createEntity('spawn', 'spawn', [5, 1, 0]),
        presetVehicle('car', 's3', [0, 1.45, 0]),
      ],
    })
    try {
      for (let i = 0; i < 180; i++) sim.step(dt)
      sim.startInVehicle('s3')
      for (let i = 0; i < 60 * 5; i++) {
        sim.setInput({ ...idleInput(), forward: 1 })
        sim.step(dt)
      }
      expect(sim.vehicleInfo('s3').speedKmh).toBeGreaterThan(30)
      let reversedWhileRolling = false
      for (let i = 0; i < 60 * 40; i++) {
        sim.setInput({ ...idleInput(), forward: -1 })
        sim.step(dt)
        const info = sim.vehicleInfo('s3')
        if (info.gear === -1 && info.speedKmh > 2) reversedWhileRolling = true
        if (info.gear === -1) break
      }
      expect(reversedWhileRolling).toBe(false)
      expect(sim.vehicleInfo('s3').gear).toBe(-1)
    } finally {
      sim.dispose()
    }
  })
})

describe('N and P on the displays', () => {
  it('labels R, N, P, D<n> and M<n>', () => {
    expect(gearLabel(0, false)).toBe('N')
    expect(gearLabel(0, true)).toBe('N')
    expect(gearLabel(0, false, true)).toBe('P')
    expect(gearLabel(-1, false, true)).toBe('R')
    expect(gearLabel(3, false)).toBe('D3')
    expect(gearLabel(3, true)).toBe('M3')
  })
  it('the S3 cluster shows N and P', () => {
    const read = (gear: number, parked: boolean) =>
      s3Instruments.clusterData({ speedKmh: 0, rpm: 900, gear, load: 0, manual: false, parked })
        .values.gear
    expect(read(0, false)).toBe('N')
    expect(read(0, true)).toBe('P')
    expect(read(2, false)).toBe('D2')
  })
})
