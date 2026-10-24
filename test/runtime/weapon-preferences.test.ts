import { expect, it, vi } from 'vitest'
import { RuntimeWeaponPreferences } from '../../src/runtime/weapon-preferences.js'
import { createSettingsStore } from '../../src/runtime/settings-scope.js'
import { normalizeWeaponPoses } from '../../src/runtime/weapon-pose-tuning.js'
import type { Sidearm } from '../../src/runtime/sidearm.js'

const weapon = (id: string) => ({
  preset: { id } as NonNullable<Sidearm['preset']>,
  rigPoses: undefined as Sidearm['rigPoses'],
})
const noop = () => {}

it('restores existing weapon keys and isolates writes between runtimes', () => {
  const values = new Map([
    ['nabla.muzzleFlash', '{"x":12,"intensity":220}'],
    ['nabla.weaponWheel', '{"hand":4,"distance":0.3}'],
    ['nabla.sidearmTuning', '{"angle":3}'],
    ['nabla.weaponPoses', '{"normal":{"x":10}}'],
  ])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
  const store = (namespace: string) => createSettingsStore({ mode: 'pc', namespace, storage })
  const a = new RuntimeWeaponPreferences(store('left')),
    b = new RuntimeWeaponPreferences(store('right'))
  expect(a.flash).toEqual({ x: 12, y: 0, z: -72, intensity: 220 })
  expect(a.wheel).toEqual({ hand: 4, distance: 0.3 })
  expect(a.tuning.angle).toBe(3)
  expect(a.resolvePoses(null).normal.x).toBe(10)
  expect(storage.setItem).not.toHaveBeenCalled()
  a.setFlash({ intensity: 40 }, noop)
  a.setTuning({ angle: 7 }, noop)
  a.stepWheel(false, 1, noop)
  a.setPoses(normalizeWeaponPoses({ normal: { x: 20 } }), null, noop)
  const restored = new RuntimeWeaponPreferences(store('left'))
  expect(restored.flash.intensity).toBe(40)
  expect(restored.tuning.angle).toBe(7)
  expect(restored.wheel.hand).toBe(5)
  expect(restored.resolvePoses(null).normal.x).toBe(20)
  expect(b.flash.intensity).toBe(220)
  expect(b.wheel.hand).toBe(4)
  expect(values.get('nabla.muzzleFlash')).toBe('{"x":12,"intensity":220}')
  a.resetWheel()
  expect(a.wheel).toEqual({ hand: 0, distance: 0 })
})

it('resolves saved poses over a late rig over legacy without caching provisional poses', () => {
  const storage = {
    getItem: (key: string) =>
      key === 'nabla.weaponPoses'
        ? '{"normal":{"x":10}}'
        : key === 'nabla.weaponPoses.a'
          ? '{"normal":{"y":30}}'
          : null,
    setItem: vi.fn(),
  }
  const settings = new RuntimeWeaponPreferences(storage),
    a = weapon('a'),
    b = weapon('b')
  expect(settings.resolvePoses(a).normal).toMatchObject({ x: 10, y: 30 })
  a.rigPoses = { normal: { x: 20 } }
  expect(settings.resolvePoses(a).normal).toMatchObject({ x: 20, y: 30 })
  expect(settings.baseline(a).normal.x).toBe(20)
  b.rigPoses = null
  expect(settings.resolvePoses(b).normal.x).toBe(10)
  settings.setPoses(normalizeWeaponPoses({ normal: { x: 40 } }), a, noop)
  expect(settings.resolvePoses(a).normal.x).toBe(40)
  expect(settings.resolvePoses(b).normal.x).toBe(10)
  expect(storage.setItem).toHaveBeenLastCalledWith('nabla.weaponPoses.a', expect.any(String))
})

it('normalizes flash values and retains live preferences with broken storage', () => {
  const storage = {
    getItem: () => {
      throw Error('read')
    },
    setItem: () => {
      throw Error('write')
    },
  }
  const settings = new RuntimeWeaponPreferences(storage),
    apply = vi.fn()
  settings.setFlash({ x: -999, y: NaN, z: 999, intensity: 999 }, apply)
  expect(settings.flash).toEqual({ x: -200, y: 0, z: 200, intensity: 300 })
  expect(apply).toHaveBeenCalledWith(settings.flash)
  settings.setTuning({ angle: 3 }, noop)
  settings.setPoses(normalizeWeaponPoses({ normal: { x: 50 } }), null, noop)
  expect(settings.tuning.angle).toBe(3)
  expect(settings.resolvePoses(null).normal.x).toBe(50)
  const invalid = new RuntimeWeaponPreferences({ getItem: () => '{bad', setItem: noop })
  expect(invalid.flash).toEqual({ x: 0, y: 0, z: -72, intensity: 100 })
})
