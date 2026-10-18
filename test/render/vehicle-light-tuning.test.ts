import { expect, it, vi } from 'vitest'
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

it('uses the approved tail lamp calibration for both VFR models', () => {
  for (const suffix of ['', '-quest']) {
    const model = '/library/motorcycles/vfr800fi-1999/vfr800fi-1999' + suffix + '.glb'
    expect(readVehicleLights(model)).toMatchObject({ rearY: -0.09, rearZ: 0.08 })
    writeVehicleLights(model, { rearY: 0.2 })
    expect(writeVehicleLights(model)).toMatchObject({ rearY: -0.09, rearZ: 0.08 })
  }
  expect(readVehicleLights('another-car').rearY).toBe(0)
})
