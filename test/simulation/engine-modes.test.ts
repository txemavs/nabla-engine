import { describe, expect, it } from 'vitest'
import { presetVehicle, vehiclePreset } from '../../src/catalog/vehicles/library.js'
import { createEntity, type Entity } from '../../src/entity/schema.js'
import { gearLabel } from '../../src/entity/vehicle/gear-label.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { parseScene } from '../../src/scene/document.js'
import {
  createDrivetrain,
  effectivePowertrain,
  hasEngineModes,
  initialEngineMode,
} from '../../src/simulation/vehicles/drivetrain.js'
import { isValidPowertrain } from '../../src/simulation/vehicles/wheeled/runtime.js'
import { vehicleMenuKey } from '../../src/runtime/vehicle-menu.js'
import { createTerrainDriveScene } from '../../src/examples/terrain-drive.js'
import { carMenuItems } from '../../src/catalog/monitors/car.js'
import type { SceneView } from '../../src/presentation/scene-view.js'
import type { SceneDocument } from '../../src/scene/document.js'
import { finishStartUp } from '../start-up.js'
import { beast } from '../engine-mode.js'

const s3 = () => presetVehicle('car', 's3', [0, 0.62, 0])

function drive(car: Entity) {
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [10000, 1, 10000]
  const sim = new Simulation(
    parseScene({
      version: 1,
      name: 'Engine modes',
      entities: [floor, car, createEntity('spawn', 'spawn', [0, 1, 4])],
    }),
  )
  for (let i = 0; i < 120; i++) sim.step(1 / 60)
  sim.startInVehicle(car.id)
  finishStartUp(sim)
  return sim
}

/** Full throttle from rest for `seconds`; returns the speed and the highest rpm seen. */
function launch(sim: Simulation, id: string, seconds: number) {
  sim.setInput({ ...idleInput(), forward: 1 })
  let peakRpm = 0
  for (let i = 0; i < seconds * 60; i++) {
    sim.step(1 / 60)
    peakRpm = Math.max(peakRpm, sim.vehicleInfo(id).rpm)
  }
  return { kmh: sim.vehicleInfo(id).speedKmh, peakRpm }
}

describe('S3 engine modes: Normal (D) and Bestia (S)', () => {
  it('the preset declares both modes, starts in Normal and resolves each mode over the base', () => {
    const spec = s3().vehicle!.powertrain!
    expect(hasEngineModes(spec)).toBe(true)
    expect(spec.defaultMode).toBe('normal')
    expect(initialEngineMode(spec)).toBe('normal')
    expect(isValidPowertrain(spec)).toBe(true)
    const normal = effectivePowertrain(spec, 'normal')
    const wild = effectivePowertrain(spec, 'beast')
    expect([normal.powerCv, normal.torqueNm, normal.maxRpm]).toEqual([200, 400, 4800])
    expect(normal.shift?.upshiftRpm).toBe(4200)
    // The gearbox feel the modes do not override is kept.
    expect(normal.shift?.seconds).toBe(spec.shift?.seconds)
    expect([wild.powerCv, wild.torqueNm]).toEqual([400, 520])
    expect(normal.ratios).toBe(spec.ratios)
    // Cached: the fixed step allocates nothing.
    expect(effectivePowertrain(spec, 'normal')).toBe(normal)
    // A single-engine vehicle is its own spec in any mode.
    const truck = presetVehicle('white-truck', 't').vehicle!.powertrain!
    expect(hasEngineModes(truck)).toBe(false)
    expect(effectivePowertrain(truck, 'beast')).toBe(truck)
    expect(createDrivetrain().mode).toBe('normal')
  })

  it('rejects a default mode the powertrain does not declare and invalid mode numbers', () => {
    const spec = s3().vehicle!.powertrain!
    expect(isValidPowertrain({ ...spec, modes: { beast: {} } })).toBe(false)
    expect(isValidPowertrain({ ...spec, modes: { ...spec.modes, normal: { maxRpm: 900 } } })).toBe(
      false,
    )
  })

  it('Normal is the calm 200 CV engine: slower, revs capped at its 4,800 rpm redline', () => {
    const calm = drive(s3())
    const strong = drive(beast(s3()))
    try {
      expect(calm.vehicleInfo('s3').engineMode).toBe('normal')
      expect(calm.vehicleInfo('s3').engineModes).toBe(true)
      expect(strong.vehicleInfo('s3').engineMode).toBe('beast')
      const normal = launch(calm, 's3', 6)
      const wild = launch(strong, 's3', 6)
      expect(normal.peakRpm).toBeLessThanOrEqual(4800 + 1)
      expect(wild.peakRpm).toBeGreaterThan(5500)
      expect(wild.kmh).toBeGreaterThan(normal.kmh + 15)
    } finally {
      calm.dispose()
      strong.dispose()
    }
  })

  it('the selector key B moves D ↔ S, and from a manual gear first returns to automatic', () => {
    const sim = drive(s3())
    try {
      expect(sim.automaticTransmission()).toBe('Motor: Bestia · cambio en S')
      expect(sim.engineMode('s3')).toBe('beast')
      expect(sim.automaticTransmission()).toBe('Motor: Normal · cambio en D')
      expect(sim.engineMode('s3')).toBe('normal')
      sim.setEngineMode('s3', 'beast')
      launch(sim, 's3', 2)
      sim.shiftVehicle(1)
      expect(sim.vehicleInfo('s3').manualTransmission).toBe(true)
      expect(sim.automaticTransmission()).toBe('Cambio automático · S')
      expect(sim.vehicleInfo('s3').manualTransmission).toBe(false)
      expect(sim.engineMode('s3')).toBe('beast')
    } finally {
      sim.dispose()
    }
  })

  it('a single-engine vehicle keeps D and refuses an engine mode', () => {
    const truck = presetVehicle('white-truck', 'truck', [0, 1.6, 0])
    const sim = drive(truck)
    try {
      expect(sim.vehicleInfo('truck').engineModes).toBe(false)
      expect(sim.setEngineMode('truck', 'beast')).toBe('Este vehículo tiene un solo modo de motor')
      expect(sim.automaticTransmission()).toBe('Cambio automático · D')
      expect(sim.engineMode('truck')).toBe('normal')
    } finally {
      sim.dispose()
    }
  })

  it('the HUD and the cluster read S in Bestia and D in Normal', () => {
    expect(gearLabel(3, false, false, true)).toBe('S3')
    expect(gearLabel(3, false, false, false)).toBe('D3')
    expect(gearLabel(3, true, false, true)).toBe('M3')
    expect(gearLabel(0, false, true, true)).toBe('P')
    expect(gearLabel(-1, false, false, true)).toBe('R')
  })

  it('J → MOTOR selects the mode through the host callback', () => {
    const engine = carMenuItems.find((item) => item.id === 'engine')!
    expect(engine.label).toBe('MOTOR')
    expect(engine.children?.map((item) => item.action?.value).filter(Boolean)).toEqual([
      'normal',
      'beast',
    ])
    const calls: string[] = []
    const reports: string[] = []
    const view = {
      vehicleMenu: () => ({
        open: true,
        key: () => ({ handled: true, action: { type: 'vehicle.engine', value: 'beast' } }),
      }),
    } as unknown as SceneView
    const result = vehicleMenuKey(
      view,
      { version: 1, name: 'x', entities: [] } as SceneDocument,
      's3',
      'Enter',
      false,
      (message) => reports.push(message),
      () => {},
      undefined,
      (id, mode) => {
        calls.push(`${id}:${mode}`)
        return 'Motor: Bestia · cambio en S'
      },
    )
    expect(result.handled).toBe(true)
    expect(calls).toEqual(['s3:beast'])
    expect(reports).toEqual(['Motor: Bestia · cambio en S'])
  })

  it('hosts choose the start mode: terrain drive writes it as defaultMode on the S3', () => {
    const scene = createTerrainDriveScene({ latitude: 0, longitude: 0, engineMode: 'beast' })
    const player = scene.entities.find((e) => e.id === 'player-vehicle')!
    expect(player.vehicle!.powertrain!.defaultMode).toBe('beast')
    const truck = scene.entities.find((e) => e.id === 'demo-white-truck')!
    expect(truck.vehicle!.powertrain!.defaultMode).toBeUndefined()
    const plain = createTerrainDriveScene({ latitude: 0, longitude: 0 })
    expect(
      plain.entities.find((e) => e.id === 'player-vehicle')!.vehicle!.powertrain!.defaultMode,
    ).toBe('normal')
  })

  it('the A3 stays an internal preset, hidden from player lists, still loadable for tests', () => {
    expect(vehiclePreset('a3').hidden).toBe(true)
    expect(vehiclePreset('car').hidden).toBeUndefined()
  })
})
