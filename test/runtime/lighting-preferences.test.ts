import { expect, it, vi } from 'vitest'
import { RuntimeLightingPreferences } from '../../src/runtime/lighting-preferences.js'
import { lightTuningDefaults } from '../../src/runtime/light-tuning.js'
import { createSettingsStore } from '../../src/runtime/settings-scope.js'

it('restores legacy profiles without writes and isolates live lighting and saved changes', () => {
  const values = new Map([
    ['nabla.lightTuning', '{"exposure":1.2,"sun":2,"ambient":3,"shadowIntensity":0.4}'],
    ['nabla.settings.headset.lightTuning', '{"exposure":0.7,"sun":0.5}'],
    ['nabla.settings.headset.modeSeeded', '1'],
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
  const a = new RuntimeLightingPreferences(createSettingsStore({ mode: 'pc', storage }))
  const b = new RuntimeLightingPreferences(createSettingsStore({ mode: 'headset', storage }))
  expect(storage.setItem).not.toHaveBeenCalled()
  const sun = { intensity: 4 },
    ambient = { intensity: 0.2 }
  a.applyEnvironment(sun, ambient)
  expect(sun.intensity).toBe(8)
  expect(ambient.intensity).toBeCloseTo(0.6)
  a.update({ exposure: 2, shadows: false, reflections: 1.5, paint: 0.8 })
  const lateLight = { shadow: { intensity: 1 } },
    renderer = { toneMappingExposure: 1 }
  const view = { reflectionScale: 1, applyPaintBrightness: vi.fn() }
  a.applyPresentation(renderer, [lateLight], view)
  expect(renderer.toneMappingExposure).toBe(2)
  expect(lateLight.shadow.intensity).toBe(0)
  expect(view.reflectionScale).toBe(1.5)
  expect(view.applyPaintBrightness).toHaveBeenCalledWith(0.8)
  a.update({ shadows: true })
  a.applyPresentation(renderer, [lateLight], view)
  expect(lateLight.shadow.intensity).toBe(0.4)
  expect(b.tuning.exposure).toBe(0.7)
  expect(values.get('nabla.settings.headset.lightTuning')).toBe('{"exposure":0.7,"sun":0.5}')
  const restored = new RuntimeLightingPreferences(createSettingsStore({ mode: 'pc', storage }))
  expect(restored.tuning).toEqual(a.tuning)
})

it('keeps defaults for invalid data and clamps updates even when persistence is unavailable', () => {
  const settings = new RuntimeLightingPreferences({
    getItem: () => '{bad',
    setItem: () => {
      throw Error('quota')
    },
  })
  expect(settings.tuning).toEqual(lightTuningDefaults)
  const result = settings.update({ exposure: 99, sun: -1, ambient: NaN, shadowIntensity: -1 })
  expect(result).toMatchObject({
    exposure: 2.5,
    sun: 0,
    ambient: lightTuningDefaults.ambient,
    shadowIntensity: 0,
  })
  result.exposure = 0
  expect(settings.tuning.exposure).toBe(2.5)
  const snapshot = settings.tuning
  snapshot.shadows = false
  expect(settings.shadows).toBe(true)
  const denied = new RuntimeLightingPreferences({
    getItem: () => {
      throw Error('denied')
    },
    setItem: () => {},
  })
  expect(denied.tuning).toEqual(lightTuningDefaults)
})
