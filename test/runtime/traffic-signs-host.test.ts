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
