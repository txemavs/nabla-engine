import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { vehicleLightsField } from '../../src/entity/vehicle/field.js'
import {
  normalizeVehicleLights,
  readVehicleLights,
  writeVehicleLights,
  vehicleLightDefaults,
} from '../../src/render/vehicle-presentation/light-tuning.js'
it('persists independent model calibrations and resets only the chosen model', () => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key),
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  writeVehicleLights('test-bike', { rearY: 0.12, low: -0.4 })
  writeVehicleLights('test-car', { high: 2 })
  expect(readVehicleLights('test-bike').rearY).toBe(0.12)
  expect(readVehicleLights('test-car').rearY).toBe(0)
  expect(JSON.parse(storage.get('nabla.vehicle-lights.test-bike')!).low).toBe(-0.4)
  expect(writeVehicleLights('test-bike')).toEqual(vehicleLightDefaults)
  expect(readVehicleLights('test-car').high).toBe(2)
  expect(normalizeVehicleLights({ rearY: NaN, high: 100, rearIntensity: -1 })).toMatchObject({
    rearY: 0,
    high: 5,
    rearIntensity: 0,
  })
  vi.unstubAllGlobals()
})

it('applies vehicle defaults from data under the saved choice, without per-model code', () => {
  const defaults = { rearY: -0.2, rearZ: 0.99, rearIntensity: 2.2, rearReach: 0.5 }
  expect(readVehicleLights('data-bike-a', defaults)).toMatchObject(defaults)
  // The same model URL carries no built-in values: other vehicles keep the engine defaults.
  expect(readVehicleLights('/library/motorcycles/vfr800fi-1999/vfr800fi-1999.glb')).toEqual(
    vehicleLightDefaults,
  )
  writeVehicleLights('data-bike-a', { rearY: 0.2 }, defaults)
  expect(readVehicleLights('data-bike-a', defaults).rearY).toBe(0.2)
  // Clearing the saved choice returns to the vehicle's own defaults.
  expect(writeVehicleLights('data-bike-a', undefined, defaults)).toMatchObject(defaults)
})

it('ships the VFR 800 FI 1999 lamp defaults and lens glow as vehicle data', () => {
  for (const file of ['vfr800', 'vfr800-quest']) {
    const json = JSON.parse(
      readFileSync(`assets/library/motorcycles/vfr800fi-1999/${file}.json`, 'utf8'),
    )
    const lights = vehicleLightsField.parse(json.vehicle.lights)
    expect(lights.tuning).toEqual({
      low: 0,
      high: 1,
      frontX: 0,
      frontY: 0,
      frontZ: 0,
      rearX: 0,
      rearY: -0.2,
      rearZ: 0.99,
      rearIntensity: 2.2,
      rearReach: 0.5,
    })
    expect(lights.lensEmissive).toEqual({ low: '#ffffff' })
  }
})

it('rejects unknown or out of range vehicle light data', () => {
  expect(() => vehicleLightsField.parse({ tuning: { rearZ: 9 } })).toThrow()
  expect(() => vehicleLightsField.parse({ tuning: { sideways: 1 } })).toThrow()
  expect(() => vehicleLightsField.parse({ lensEmissive: { low: 'white' } })).toThrow()
  expect(vehicleLightsField.parse({})).toEqual({})
})
