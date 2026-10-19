import { expect, it } from 'vitest'
import {
  readVehiclePreferences,
  vehiclePreferencesKey,
  writeVehiclePreferences,
} from '../../src/runtime/vehicle-preferences.js'

const memory = (entries: Record<string, string> = {}) => {
  const data = new Map(Object.entries(entries))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

it('saves exhaust and reversing-alarm choices per vehicle model', () => {
  const storage = memory()
  writeVehiclePreferences(storage, '/truck.glb', {
    exhaustOffset: [0.1, 0.2, 3],
    exhaustAmount: 0.5,
    reverseAlarm: false,
  })
  expect(readVehiclePreferences(storage, '/truck.glb')).toEqual({
    exhaustOffset: [0.1, 0.2, 1],
    exhaustAmount: 0.5,
    reverseAlarm: false,
  })
  // Another model keeps its own defaults.
  expect(readVehiclePreferences(storage, '/car.glb')).toEqual({
    exhaustOffset: [0, 0, 0],
    exhaustAmount: 1,
    reverseAlarm: true,
  })
  expect(storage.data.has(vehiclePreferencesKey('/truck.glb'))).toBe(true)
})

it('reads the old global keys as defaults and survives bad storage', () => {
  const storage = memory({
    'nabla.truckExhaustOffset': '[0,0.3,0]',
    'nabla.truckExhaustAmount': '1.5',
    'nabla.reverseAlarm': '0',
  })
  expect(readVehiclePreferences(storage, '/truck.glb')).toEqual({
    exhaustOffset: [0, 0.3, 0],
    exhaustAmount: 1.5,
    reverseAlarm: false,
  })
  storage.data.set(vehiclePreferencesKey('/bad.glb'), '{not json')
  expect(readVehiclePreferences(storage, '/bad.glb').exhaustAmount).toBe(1.5)
  const broken = {
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('denied')
    },
  }
  expect(readVehiclePreferences(broken, '/x').reverseAlarm).toBe(true)
  expect(writeVehiclePreferences(broken, '/x', { exhaustAmount: 2 }).exhaustAmount).toBe(2)
})
