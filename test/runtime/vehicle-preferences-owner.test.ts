import { expect, it } from 'vitest'
import { RuntimeVehiclePreferences } from '../../src/runtime/vehicle-preferences.js'
import { createSettingsStore } from '../../src/runtime/settings-scope.js'

it('retains legacy fallback and isolates cached models and runtime namespaces', () => {
  const values = new Map([
    ['nabla.reverseAlarm', '0'],
    ['nabla.truckExhaustAmount', '0.7'],
  ])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
  const store = (namespace: string) => createSettingsStore({ mode: 'pc', namespace, storage })
  const a = new RuntimeVehiclePreferences(store('left')),
    b = new RuntimeVehiclePreferences(store('right'))
  expect(a.read('truck')).toMatchObject({ exhaustAmount: 0.7, reverseAlarm: false })
  expect(b.read('truck').reverseAlarm).toBe(false)
  a.update('truck', { reverseAlarm: true, exhaustAmount: 2 })
  expect(a.read('truck').reverseAlarm).toBe(true)
  expect(a.read('van').reverseAlarm).toBe(false)
  expect(b.read('truck').reverseAlarm).toBe(false)
  expect(new RuntimeVehiclePreferences(store('left')).read('truck')).toEqual(a.read('truck'))
  expect(values.get('nabla.reverseAlarm')).toBe('0')
})

it('keeps provisional exhaust controls separate from persisted model records', () => {
  const a = new RuntimeVehiclePreferences(),
    b = new RuntimeVehiclePreferences()
  expect(a.setExhaustAmount(9, () => {})).toBe(2)
  const offset = a.setExhaustOffset([-2, 0.5, 4], () => {})
  expect(offset).toEqual([-1, 0.5, 1])
  offset[0] = 99
  expect(a.exhaustOffset).toEqual([-1, 0.5, 1])
  expect(b.exhaustAmount).toBe(1)
  expect(a.read('truck').exhaustAmount).toBe(1)
  expect(() => a.setExhaustAmount(NaN, () => {})).toThrow('Invalid exhaust amount')
  expect(() => a.setExhaustOffset([0, Infinity, 0], () => {})).toThrow('Invalid exhaust offset')
})

it('keeps cached changes when the backing store rejects writes', () => {
  const settings = new RuntimeVehiclePreferences({
    getItem: () => null,
    setItem: () => {
      throw Error('quota')
    },
  })
  settings.update('truck', { reverseAlarm: false })
  expect(settings.read('truck').reverseAlarm).toBe(false)
})
