import { expect, it, vi } from 'vitest'
import { RuntimeCameraPreferences } from '../../src/runtime/camera-preferences.js'
import { ActionCam } from '../../src/runtime/action-cam.js'
import { createSettingsStore } from '../../src/runtime/settings-scope.js'
import { cameraFovRange } from '../../src/runtime/camera-fov.js'

const make = () => {
  const state = { bodycam: false, settings: { firstPersonFov: 80, chaseFov: 55 } }
  const action = new ActionCam()
  return { state, action, preferences: new RuntimeCameraPreferences(state, action) }
}

it('restores legacy profiles without writes and persists only the selected runtime', () => {
  const values = new Map([
    ['nabla.cameraFov', '12'],
    ['nabla.actionCam', 'false'],
    ['nabla.bodycam', 'true'],
    ['nabla.actionCamSettings', '{"strideMetres":2}'],
    ['nabla.settings.headset.cameraFov', '5'],
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
  const pc = createSettingsStore({ mode: 'pc', storage })
  const vr = createSettingsStore({ mode: 'headset', storage })
  // The store seeds a new headset profile; restoring camera preferences must add no writes.
  storage.setItem.mockClear()
  const a = make(),
    b = make()
  for (const [runtime, store] of [
    [a, pc],
    [b, vr],
  ] as const) {
    runtime.preferences.restoreActionCamEnabled(store)
    runtime.preferences.restoreActionCamSettings(store)
    runtime.preferences.restoreView(store)
  }
  expect(storage.setItem).not.toHaveBeenCalled()
  expect(a.state.settings).toEqual({ firstPersonFov: 92, chaseFov: 67 })
  expect(b.preferences.fovOffset).toBe(5)
  expect(a.preferences.actionCamEnabled).toBe(false)
  expect(a.preferences.bodycamEnabled).toBe(true)
  expect(a.action.settings.strideMetres).toBe(2)
  a.preferences.setFovOffset(7.4, pc)
  a.preferences.setActionCamEnabled(true, pc)
  a.preferences.setActionCamSettings({ strideMetres: 3 }, pc)
  const reset = vi.fn(() => expect(a.state.bodycam).toBe(false))
  a.preferences.setBodycamEnabled(false, pc, reset)
  expect(reset).toHaveBeenCalledOnce()
  expect(b.preferences.fovOffset).toBe(5)
  expect(values.get('nabla.settings.headset.cameraFov')).toBe('5')
  const restored = make()
  restored.preferences.restoreView(pc)
  restored.preferences.restoreActionCamEnabled(pc)
  restored.preferences.restoreActionCamSettings(pc)
  expect(restored.preferences.fovOffset).toBe(7)
  expect(restored.preferences.bodycamEnabled).toBe(false)
  expect(restored.preferences.actionCamEnabled).toBe(true)
  expect(restored.preferences.actionCamSettings.strideMetres).toBe(3)
})

it('keeps live settings, defaults and normalization when storage cannot write', () => {
  const { preferences, state, action } = make()
  const storage = {
    getItem: () => '{invalid',
    setItem: () => {
      throw Error('quota')
    },
  }
  preferences.restoreActionCamSettings(storage)
  expect(preferences.actionCamSettings).toEqual(new ActionCam().settings)
  preferences.restoreView(undefined)
  expect(preferences.setFovOffset(Infinity, storage)).toBe(0)
  expect(preferences.setFovOffset(10000, storage)).toBe(cameraFovRange.max)
  expect(state.settings.firstPersonFov).toBe(80 + cameraFovRange.max)
  preferences.setFovOffset(-10000, storage)
  expect(state.settings.chaseFov).toBe(55 + cameraFovRange.min)
  preferences.setActionCamEnabled(false, storage)
  preferences.setBodycamEnabled(false, storage, () => {})
  preferences.setActionCamSettings({ strideMetres: -100 }, storage)
  expect(action.settings.strideMetres).toBeGreaterThan(0)
  const snapshot = preferences.actionCamSettings
  snapshot.strideMetres = 999
  expect(preferences.actionCamSettings.strideMetres).not.toBe(999)
  preferences.resetActionCamSettings(storage)
  expect(action.settings).toEqual(new ActionCam().settings)
  // Public camera state remains the source of truth, including external view restoration.
  state.bodycam = true
  expect(preferences.bodycamEnabled).toBe(true)
})
