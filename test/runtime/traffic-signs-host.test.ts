import { expect, it } from 'vitest'
import { SceneryPhysics } from '../../src/runtime/scenery-physics.js'
import { exportSettingsBackup } from '../../src/runtime/settings-backup.js'
import {
  setTrafficSignsStorageKey,
  trafficSignsStorageKey,
} from '../../src/runtime/traffic-signs-host.js'
import { sceneryPhysicsDefaults } from '../../src/config/scenery-physics.js'

const memory = (values: Record<string, string>) => {
  const data = new Map(Object.entries(values))
  return {
    get length() {
      return data.size
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

it('reads the physics radius only from the storage key the host names, and backs it up', () => {
  const stored = memory({ 'demo-host.signs': '{"physicsRadius":20}' })
  expect(trafficSignsStorageKey()).toBeUndefined()
  expect(new SceneryPhysics(() => null, stored).radius).toBe(sceneryPhysicsDefaults.radius)
  expect(exportSettingsBackup(stored, memory({}), '').local).toEqual({})
  setTrafficSignsStorageKey('demo-host.signs')
  expect(trafficSignsStorageKey()).toBe('demo-host.signs')
  expect(new SceneryPhysics(() => null, stored).radius).toBe(20)
  expect(exportSettingsBackup(stored, memory({}), '').local).toEqual({
    'demo-host.signs': '{"physicsRadius":20}',
  })
  expect(() => setTrafficSignsStorageKey('nabla.signs')).toThrow(RangeError)
})

it('captures the legacy key and isolates explicit hosts, disabled hosts and recreation', async () => {
  const { SettingsStore } = await import('../../src/runtime/settings-scope.js')
  const storage = memory({
    'first.signs': '{"physicsRadius":20}',
    'second.signs': '{"physicsRadius":30}',
  })
  setTrafficSignsStorageKey('first.signs')
  const first = new SettingsStore({ storage })
  const second = new SettingsStore({ storage, trafficSignsStorageKey: 'second.signs' })
  const disabled = new SettingsStore({ storage, trafficSignsStorageKey: null })
  setTrafficSignsStorageKey('second.signs')
  expect(first.trafficSignsStorageKey).toBe('first.signs')
  expect(second.trafficSignsStorageKey).toBe('second.signs')
  expect(disabled.trafficSignsStorageKey).toBeNull()
  expect(new SceneryPhysics(() => null, first).radius).toBe(20)
  expect(new SceneryPhysics(() => null, second).radius).toBe(30)
  expect(new SceneryPhysics(() => null, disabled).radius).toBe(sceneryPhysicsDefaults.radius)
  first.setItem(first.trafficSignsStorageKey!, '{"physicsRadius":25}')
  expect(second.getItem('second.signs')).toBe('{"physicsRadius":30}')
  first.switchMode('headset')
  expect(first.trafficSignsStorageKey).toBe('first.signs')
  expect(new SettingsStore({ storage }).trafficSignsStorageKey).toBe('second.signs')
  expect(
    new SceneryPhysics(
      () => null,
      new SettingsStore({ storage, trafficSignsStorageKey: 'first.signs' }),
    ).radius,
  ).toBe(25)
  expect(() => new SettingsStore({ storage, trafficSignsStorageKey: 'nabla.signs' })).toThrow(
    RangeError,
  )
})
