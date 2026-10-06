import { describe, expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { s3Instruments } from '../../src/catalog/monitors/s3-instruments.js'
import { roadVehicleDefaults } from '../../src/config/simulation.js'
import { createEntity, type Entity } from '../../src/entity/schema.js'
import { gearLabel } from '../../src/entity/vehicle/gear-label.js'
import { sweepCluster } from '../../src/render/entity/car-instrument-definition.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import {
  createDrivetrain,
  gaugeSweep,
  stepIgnition,
  startIgnition,
  type DrivetrainState,
} from '../../src/simulation/vehicles/drivetrain.js'

const dt = 1 / 60
const sweepSeconds = roadVehicleDefaults.ignitionSweepSeconds
const crankSeconds = roadVehicleDefaults.ignitionCrankSeconds
const startSeconds = sweepSeconds + crankSeconds

/** Every geared road vehicle in the library plus a procedural car without a powertrain. */
const roadVehicles: [string, string][] = [
  ['s3', 'car'],
  ['a3', 'a3'],
  ['truck', 'white-truck'],
  ['generic', ''],
]

function vehicleEntity(id: string, catalog: string, position: [number, number, number]): Entity {
  if (catalog) return presetVehicle(catalog, id, position)
  const car = createEntity(id, 'vehicle', position)
  car.size = [1.9, 1.3, 4.4]
  car.mass = 1300
  return car
}

/**
 * A long plank tilted `degrees` nose-up along -Z (the vehicle's front), with the vehicle resting
 * on it. Positive degrees put the nose uphill so gravity pulls the vehicle backwards.
 */
function slope(id: string, catalog: string, degrees: number, ignition = true): Simulation {
  const angle = (degrees * Math.PI) / 180
  const rotation: [number, number, number, number] = [
    Math.sin(angle / 2),
    0,
    0,
    Math.cos(angle / 2),
  ]
  const normal: [number, number, number] = [0, Math.cos(angle), Math.sin(angle)]
  const floor = createEntity('floor', 'box', [-normal[0] * 0.5, -normal[1] * 0.5, -normal[2] * 0.5])
  floor.size = [400, 1, 400]
  floor.transform.rotation = rotation
  const height = catalog === 'white-truck' ? 1.8 : 1.45
  const vehicle = vehicleEntity(id, catalog, [
    normal[0] * height,
    normal[1] * height,
    normal[2] * height,
  ])
  vehicle.transform.rotation = rotation
  return new Simulation(
    {
      version: 1,
      name: 'Slope',
      entities: [floor, createEntity('spawn', 'spawn', [8, 3, 0]), vehicle],
    },
    { ignition },
  )
}

const run = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) sim.step(dt)
}
const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
/** Test-only access to the private runtime vehicle, to reproduce the pre-fix selector state. */
const drivetrainOf = (sim: Simulation, id: string): DrivetrainState =>
  (sim as unknown as { vehicles: Map<string, { drivetrain: DrivetrainState }> }).vehicles.get(id)!
    .drivetrain

describe('start-up sequence, unit level', () => {
  it('a new drivetrain is in P with the engine running', () => {
    const state = createDrivetrain()
    expect([state.gear, state.parked, state.ignition]).toEqual([0, true, 'running'])
    expect(gearLabel(state.gear, state.manual, state.parked)).toBe('P')
  })

  it('sweeps the needles up and back with easing, cranks, then fires at a flare above idle', () => {
    const state = { ...createDrivetrain(), gear: 3, parked: false }
    startIgnition(state)
    expect([state.ignition, state.ignitionCount, state.rpm]).toEqual(['sweep', 1, 0])
    const sweep: number[] = []
    const rpm: number[] = []
    let t = 0
    while (stepIgnition(state, dt, 900)) {
      t += dt
      // The selector is kept in P for the whole sequence.
      expect([state.gear, state.parked]).toEqual([0, true])
      sweep.push(gaugeSweep(state))
      rpm.push(state.rpm)
      if (state.ignition === 'sweep') expect(state.rpm).toBe(0)
    }
    t += dt
    expect(t).toBeCloseTo(startSeconds, 1)
    expect(state.ignition).toBe('running')
    expect(state.rpm).toBeCloseTo(900 * roadVehicleDefaults.ignitionFlare)
    const sweepTicks = Math.round(sweepSeconds / dt)
    const up = sweep.slice(0, sweepTicks)
    expect(Math.max(...up)).toBeCloseTo(1, 2)
    // Smooth: no jump larger than a few percent between frames, starts and ends near zero.
    for (let i = 1; i < up.length; i++) expect(Math.abs(up[i] - up[i - 1])).toBeLessThan(0.08)
    expect(up[0]).toBeLessThan(0.02)
    expect(up[up.length - 1]).toBeLessThan(0.03)
    // Cranking shows a low, pulsing starter speed.
    const cranking = rpm.slice(sweepTicks + 1)
    expect(Math.min(...cranking)).toBeGreaterThan(100)
    expect(Math.max(...cranking)).toBeLessThan(400)
    expect(Math.max(...cranking) - Math.min(...cranking)).toBeGreaterThan(50)
  })

  it('needles of any cluster follow the sweep; text readouts keep real values', () => {
    const data = s3Instruments.clusterData({
      speedKmh: 0,
      rpm: 0,
      gear: 0,
      load: 0,
      manual: false,
      parked: true,
    })
    expect(sweepCluster(s3Instruments.cluster, data, 0)).toBe(data)
    const full = sweepCluster(s3Instruments.cluster, data, 1)
    expect(full.values.rpm).toBe(8000)
    expect(full.values.speed).toBe(320)
    expect(full.values.gear).toBe('P')
    expect(full.values.speedDisplay).toBe('0')
    expect(full.bars.rpm).toBe(1)
    const half = sweepCluster(s3Instruments.cluster, data, 0.5)
    expect(half.values.rpm).toBe(4000)
  })
})

describe('entering a vehicle: P, held, start-up, then the normal controls', () => {
  for (const [id, catalog] of roadVehicles) {
    it(`${id}: enters in P, holds on a 10 degree slope, starts, and W leaves P only once running`, () => {
      const sim = slope(id, catalog, 10)
      try {
        run(sim, 3)
        expect(sim.vehicleInfo(id).gear).toBe(0)
        expect(sim.vehicleInfo(id).parked).toBe(true)
        const before = sim.entityTransform(id).position
        sim.startInVehicle(id)
        let info = sim.vehicleInfo(id)
        expect(gearLabel(info.gear, info.manualTransmission, info.parked)).toBe('P')
        expect(info.ignition).toBe('sweep')
        expect(info.ignitionCount).toBe(1)
        // The driver floors it straight away: input is kept but P holds until the engine runs.
        sim.setInput({ ...idleInput(), forward: 1 })
        let peakSweep = 0
        let cranked = false
        for (let i = 0; i < Math.round(startSeconds / dt) - 2; i++) {
          sim.step(dt)
          info = sim.vehicleInfo(id)
          peakSweep = Math.max(peakSweep, info.gaugeSweep)
          cranked ||= info.ignition === 'cranking'
          expect(info.gear).toBe(0)
          expect(info.parked).toBe(true)
          expect(info.engineLoad).toBe(0)
        }
        expect(peakSweep).toBeGreaterThan(0.99)
        expect(cranked).toBe(true)
        expect(distance(sim.entityTransform(id).position, before)).toBeLessThan(0.05)
        // Once running, the still-held pedal selects D after the normal standstill dwell.
        run(sim, 1)
        info = sim.vehicleInfo(id)
        expect(info.ignition).toBe('running')
        expect(info.gear).toBeGreaterThan(0)
        expect(info.parked).toBe(false)
      } finally {
        sim.dispose()
      }
    })
  }

  for (const [id, catalog] of roadVehicles) {
    it(`${id}: P keeps it planted on the slope with no pedal, long after the start-up`, () => {
      const sim = slope(id, catalog, 10)
      try {
        run(sim, 3)
        sim.startInVehicle(id)
        const start = sim.entityTransform(id).position
        run(sim, startSeconds + 4)
        expect(sim.vehicleInfo(id).gear).toBe(0)
        expect(sim.vehicleInfo(id).parked).toBe(true)
        // Not even the slow creep of a merely braked wheel (g*sin(slope)*dt per step).
        expect(distance(sim.entityTransform(id).position, start)).toBeLessThan(0.02)
      } finally {
        sim.dispose()
      }
    })
  }

  it('root cause: entering with the old drive-ready selector (D1, brakes released) rolls back', () => {
    const sim = slope('s3', 'car', 10)
    try {
      run(sim, 3)
      sim.startInVehicle('s3')
      // Pre-fix state: drivetrain left in D1, not parked, engine running, no pedal.
      Object.assign(drivetrainOf(sim, 's3'), { gear: 1, parked: false, ignition: 'running' })
      const start = sim.entityTransform('s3').position
      run(sim, 3)
      const end = sim.entityTransform('s3').position
      // Rolled backwards (+Z, down the slope) by more than a metre.
      expect(end[2] - start[2]).toBeGreaterThan(1)
    } finally {
      sim.dispose()
    }
  })

  it('re-entering after leaving the car in D or R selects P and starts again', () => {
    const floor = createEntity('floor', 'box', [0, -0.5, -4000])
    floor.size = [10000, 1, 10000]
    const sim = new Simulation({
      version: 1,
      name: 'Re-enter',
      entities: [
        floor,
        createEntity('spawn', 'spawn', [5, 1, 0]),
        presetVehicle('car', 's3', [0, 1.45, 0]),
      ],
    })
    try {
      run(sim, 2)
      sim.startInVehicle('s3')
      run(sim, startSeconds + 0.1)
      for (const pedal of [1, -1]) {
        sim.setInput({ ...idleInput(), forward: pedal })
        run(sim, 0.6)
        sim.setInput({ ...idleInput(), forward: 0, brake: true })
        run(sim, 0.1)
        expect(Math.sign(sim.vehicleInfo('s3').gear)).toBe(pedal)
        // Stop, then leave the car in that gear.
        run(sim, 3)
        sim.setInput(idleInput())
        expect(sim.interact()).not.toMatch(/Detén/)
        expect(sim.player.vehicleId).toBeNull()
        drivetrainOf(sim, 's3').gear = pedal
        drivetrainOf(sim, 's3').parked = false
        run(sim, 0.5)
        sim.startInVehicle('s3')
        const info = sim.vehicleInfo('s3')
        expect([info.gear, info.parked, info.ignition]).toEqual([0, true, 'sweep'])
        run(sim, startSeconds + 0.1)
        expect(sim.vehicleInfo('s3').gear).toBe(0)
      }
      expect(sim.vehicleInfo('s3').ignitionCount).toBe(3)
    } finally {
      sim.dispose()
    }
  })

  it('ignition: false selects P without the start-up sequence', () => {
    const sim = slope('s3', 'car', 0, false)
    try {
      run(sim, 2)
      sim.startInVehicle('s3')
      const info = sim.vehicleInfo('s3')
      expect([info.gear, info.parked, info.ignition, info.ignitionCount]).toEqual([
        0,
        true,
        'running',
        0,
      ])
      sim.setInput({ ...idleInput(), forward: 1 })
      run(sim, 1)
      expect(sim.vehicleInfo('s3').gear).toBeGreaterThan(0)
    } finally {
      sim.dispose()
    }
  })

  it('flight vehicles without a gear selector are unaffected', () => {
    const floor = createEntity('floor', 'box', [0, -0.5, 0])
    floor.size = [400, 1, 400]
    const ship = presetVehicle('carrier', 'ship')
    const sim = new Simulation({
      version: 1,
      name: 'Ship',
      entities: [floor, createEntity('spawn', 'spawn', [40, 1, 40]), ship],
    })
    try {
      run(sim, 1)
      sim.startInVehicle('ship')
      const info = sim.vehicleInfo('ship')
      expect(info.parked).toBe(false)
      expect(info.ignition).toBe('running')
      expect(info.ignitionCount).toBe(0)
    } finally {
      sim.dispose()
    }
  })
})
