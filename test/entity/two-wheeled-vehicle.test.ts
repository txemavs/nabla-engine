import { describe, expect, it } from 'vitest'
import { presetVehicle, vehiclePresets } from '../../src/catalog/vehicles/library.js'
import { vehicleField } from '../../src/entity/vehicle/field.js'
import {
  hubWheelRadius,
  isTwoWheeled,
  validateVehicle,
  wheelContactY,
} from '../../src/entity/vehicle/vehicle.js'
import { createEntity, type Entity } from '../../src/entity/schema.js'
import { parseScene } from '../../src/scene/document.js'

const bike = () => presetVehicle('vfr800', 'bike', [0, 0.6, 0])
const car = () => presetVehicle('car', 's3', [0, 0.62, 0])
const withVehicle = (entity: Entity, patch: Record<string, unknown>): Entity => ({
  ...entity,
  vehicle: { ...entity.vehicle!, ...patch } as Entity['vehicle'],
})

describe('two-wheeled vehicle schema and validation', () => {
  it('loads the vfr800 preset as a narrow two-hub vehicle with front/rear radii', () => {
    const entity = bike()
    expect(entity.vehicle!.hubs).toHaveLength(2)
    expect(isTwoWheeled(entity.vehicle)).toBe(true)
    expect(entity.size[0]).toBeLessThan(1)
    expect(hubWheelRadius(entity.vehicle!, 0)).toBeCloseTo(0.2999, 6)
    expect(hubWheelRadius(entity.vehicle!, 1)).toBeCloseTo(0.3149, 6)
    // Both tyres meet the ground at the authored GLB floor (body placed 0.55 m down).
    expect(wheelContactY(entity.vehicle!)).toBeCloseTo(-0.55, 4)
    expect(() => validateVehicle(entity)).not.toThrow()
    // It spawns through a scene like the car preset.
    const spawn = createEntity('spawn', 'spawn', [0, 1, 4])
    expect(() => parseScene({ version: 1, name: 'Bike', entities: [entity, spawn] })).not.toThrow()
  })

  it('accepts a redline above 10,000 rpm up to 20,000 and rejects beyond', () => {
    const powertrain = bike().vehicle!.powertrain!
    expect(powertrain.maxRpm).toBeGreaterThan(10000)
    const parse = (maxRpm: number) =>
      vehicleField.safeParse({ ...bike().vehicle, powertrain: { ...powertrain, maxRpm } }).success
    expect(parse(11500)).toBe(true)
    expect(parse(20000)).toBe(true)
    expect(parse(20001)).toBe(false)
  })

  it('keeps the narrow-width exemption for two-wheelers only', () => {
    const narrowCar = { ...car(), size: [0.735, 1.19, 2.095] as Entity['size'] }
    expect(() => validateVehicle(narrowCar)).toThrow(/too small/)
    expect(() => validateVehicle(car())).not.toThrow()
    const tiny = { ...bike(), size: [0.2, 1.19, 2.095] as Entity['size'] }
    expect(() => validateVehicle(tiny)).toThrow(/too small/)
  })

  it('rejects inconsistent two-wheel rigs', () => {
    const entity = bike()
    const [front, rear] = entity.vehicle!.hubs
    const { twoWheeled: _drop, ...plain } = entity.vehicle!
    expect(() => validateVehicle({ ...entity, vehicle: plain as Entity['vehicle'] })).toThrow(
      /must declare vehicle.twoWheeled/,
    )
    expect(() => validateVehicle(withVehicle(entity, { hubs: [rear, front] }))).toThrow(/front hub/)
    expect(() =>
      validateVehicle(withVehicle(car(), { twoWheeled: entity.vehicle!.twoWheeled })),
    ).toThrow(/exactly two hubs/)
    expect(() => validateVehicle(withVehicle(entity, { passive: true }))).toThrow(/trailers/)
    expect(() =>
      validateVehicle(
        withVehicle(entity, {
          twoWheeled: { ...entity.vehicle!.twoWheeled!, maxLean: 0.8, fallLean: 0.7 },
        }),
      ),
    ).toThrow(/fall lean/)
    // Schema: two hubs need the tuple form, and the steering axis cannot be zero.
    expect(
      vehicleField.safeParse({
        ...entity.vehicle,
        twoWheeled: { ...entity.vehicle!.twoWheeled, steeringAxis: [0, 0, 0] },
      }).success,
    ).toBe(false)
    expect(vehicleField.safeParse({ ...entity.vehicle, hubs: [front] }).success).toBe(false)
  })

  it('leaves every four-wheel and trailer preset unchanged and valid', () => {
    for (const preset of vehiclePresets()) {
      if (preset.vehicle.twoWheeled) continue
      expect(preset.vehicle.hubs.length).not.toBe(2)
      const entity = presetVehicle(preset.id, preset.id, [0, 1, 0])
      expect(() => validateVehicle(entity)).not.toThrow()
      expect(isTwoWheeled(entity.vehicle)).toBe(false)
      for (let i = 0; i < entity.vehicle!.hubs.length; i++)
        expect(hubWheelRadius(entity.vehicle!, i)).toBe(entity.vehicle!.wheelRadius)
    }
  })

  it('declares the motorcycle sound: no turbo, a click on gear changes and the V4 voice', () => {
    expect(bike().vehicle!.audio).toEqual({
      turbo: false,
      gearShift: { sound: 'click', volume: 1 },
      engine: { voice: 'v4', vAngle: 90, crankpin: 180, volume: 0.8 },
    })
    expect(
      vehicleField.safeParse({ ...bike().vehicle, audio: { engine: { voice: 'v12' } } }).success,
    ).toBe(false)
    // The S3 keeps its own refined inline voice; only the bike asks for the V4.
    expect(car().vehicle!.audio?.engine?.voice).toBe('inline')
    expect(
      vehicleField.safeParse({ ...bike().vehicle, audio: { gearShift: { sound: 'whoosh' } } })
        .success,
    ).toBe(false)
  })

  it('validates the phase-2 blocks: rider, pitch assist, clutch kick and CBS', () => {
    const tw = bike().vehicle!.twoWheeled!
    expect(tw.rider?.seat).toEqual([0, 0.55, 0.31])
    expect(tw.cbs).toEqual({})
    const parse = (patch: Record<string, unknown>) =>
      vehicleField.safeParse({ ...bike().vehicle, twoWheeled: { ...tw, ...patch } }).success
    expect(parse({ pitchAssist: { wheelie: false, stoppieMaxAngle: 0.4 } })).toBe(true)
    expect(parse({ cbs: { leverFront: 0.5, pedalFront: 0.5, linkLag: 0 } })).toBe(true)
    expect(parse({ cbs: { leverFront: 1.5 } })).toBe(false)
    expect(parse({ cbs: { abs: true } })).toBe(false)
    expect(parse({ rider: { mass: 70 } })).toBe(false)
    expect(parse({ clutchKick: { maxGear: 2, gain: 0.3 } })).toBe(true)
    expect(parse({ pitchAssist: { wheelieMaxAngle: 2 } })).toBe(false)
    const inverted = withVehicle(bike(), {
      twoWheeled: { ...tw, pitchAssist: { wheelieSoftAngle: 0.5, wheelieMaxAngle: 0.3 } },
    })
    expect(() => validateVehicle(inverted)).toThrow(/maximum angles must exceed/)
  })
})
