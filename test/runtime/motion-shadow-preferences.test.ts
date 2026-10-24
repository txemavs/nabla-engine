import { expect, it } from 'vitest'
import { RuntimeCameraMotionPreferences } from '../../src/runtime/camera-motion-preferences.js'
import { createGameCameraState } from '../../src/runtime/game-camera.js'
import { cameraRecovery } from '../../src/config/camera.js'
import { RuntimePerformanceSettings } from '../../src/runtime/performance-settings.js'
import { createSettingsStore } from '../../src/runtime/settings-scope.js'

it('isolates camera recovery, preserves authored defaults and round-trips disabled centering', () => {
  const map = new Map<string, string>()
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
  }
  const left = createSettingsStore({ storage, namespace: 'left' }),
    right = createSettingsStore({ storage, namespace: 'right' })
  const ca = createGameCameraState({ autoCenterDelayMs: 4000 }),
    cb = createGameCameraState()
  const a = new RuntimeCameraMotionPreferences(ca),
    b = new RuntimeCameraMotionPreferences(cb)
  a.restore(left)
  b.restore(right)
  expect(a.settings.autoCenterDelayMs).toBe(4000)
  a.set({ autoCenter: false, autoCenterDelayMs: 2000, modeTransitionMs: 0 }, left)
  expect(cameraRecovery(1000000, ca.settings)).toBe(0)
  expect(cameraRecovery(1000000, cb.settings)).toBe(1)
  expect(cb.settings.modeTransitionMs).toBe(700)
  const restored = new RuntimeCameraMotionPreferences(createGameCameraState())
  restored.restore(createSettingsStore({ storage, namespace: 'left' }))
  expect(restored.settings).toEqual(a.settings)
  Object.assign(ca, createGameCameraState(ca.settings))
  a.set({ autoCenter: true }, left)
  expect(cameraRecovery(2500, ca.settings)).toBe(1)
  a.set({ modeTransitionMs: NaN, autoCenterBlendMs: -1 }, left)
  expect(a.settings).toMatchObject({ modeTransitionMs: 0, autoCenterBlendMs: 0 })
})

it('restores sun shadow tiers before allocation and keeps pending selection separate from active resources', () => {
  let value: string | null = null
  const storage = {
    getItem: () => value,
    setItem: (_k: string, v: string) => {
      value = v
    },
  }
  const a = new RuntimePerformanceSettings({ shadows: 1024 }),
    b = new RuntimePerformanceSettings({ shadows: 512 })
  a.saveShadowQuality(2048, storage)
  expect(a.state.shadows).toBe(1024)
  expect(b.state.shadows).toBe(512)
  const c = new RuntimePerformanceSettings({ shadows: 512 })
  c.restoreShadowQuality(storage)
  expect(c.state.shadows).toBe(2048)
  a.saveShadowQuality(null, storage)
  const profile = new RuntimePerformanceSettings({ shadows: 512 })
  profile.restoreShadowQuality(storage)
  expect(profile.state.shadows).toBe(512)
  a.saveShadowQuality(0, storage)
  const xr = new RuntimePerformanceSettings({ shadows: 0 })
  xr.enableXRShadows()
  xr.restoreShadowQuality(storage)
  expect(xr.state.shadows).toBe(0)
  expect(() => a.saveShadowQuality(123, storage)).toThrow()
  value = '"2048"'
  profile.restoreShadowQuality(storage)
  expect(profile.state.shadows).toBe(512)
  expect(() =>
    a.saveShadowQuality(512, {
      ...storage,
      setItem: () => {
        throw Error('denied')
      },
    }),
  ).toThrow('denied')
})
