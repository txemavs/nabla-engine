import { expect, it } from 'vitest'
import { Group, Texture } from 'three'
import { RuntimeVisualSettings } from '../../src/runtime/visual-settings.js'
import { createSettingsStore } from '../../src/runtime/settings-scope.js'
import { smokeDensityFor } from '../../src/render/entity/smoke-density.js'
import { lowBeamMask } from '../../src/render/vehicle-presentation/authored-lights.js'
import { smokeTuning } from '../../src/config/gameplay-tuning.js'

it('keeps live state and late scene consumers owned by one runtime', () => {
  const a = new RuntimeVisualSettings(),
    b = new RuntimeVisualSettings()
  const scene = new Group(),
    late = new Group(),
    photo = new Texture()
  a.bindScene(scene)
  scene.add(late)
  a.world.photos.add(photo)
  a.setHiddenLayers(new Set(['road']))
  a.setAnisotropy(16, 2)
  a.setAsphaltContrast(2)
  a.setSmokePercent(25)
  a.setVehicleBeamCutoff('low', 3)
  expect(a.hiddenLayers).toEqual(['road'])
  expect(b.hiddenLayers).toEqual([])
  expect(photo.anisotropy).toBe(2)
  expect(b.anisotropy).toBe(8)
  expect(a.asphaltContrast).toBe(2)
  expect(b.asphaltContrast).toBe(1)
  expect(smokeDensityFor(late).value).toBe(0.25)
  expect(b.smokePercent).toBe(smokeTuning.defaultPercent)
  const mask = lowBeamMask(true, a.beams)
  expect(a.getVehicleBeamCutoff('low')).toBe(3)
  expect(b.getVehicleBeamCutoff('low')).not.toBe(3)
  mask.dispose()
  expect(a.beams.masks.has(mask)).toBe(false)
  photo.dispose()
})

it('writes only the supplied legacy profile and does not persist quality overrides', () => {
  const values = new Map([
    ['nabla.smokePercent', '65'],
    ['nabla.settings.headset.smokePercent', '80'],
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
  const pc = createSettingsStore({ mode: 'pc', storage })
  const vr = createSettingsStore({ mode: 'headset', storage })
  const a = new RuntimeVisualSettings(),
    b = new RuntimeVisualSettings()
  a.setSmokePercent(Number(pc.getItem('nabla.smokePercent')))
  b.setSmokePercent(Number(vr.getItem('nabla.smokePercent')))
  expect([a.smokePercent, b.smokePercent]).toEqual([65, 80])
  b.setSmokePercent(0)
  expect(vr.getItem('nabla.smokePercent')).toBe('80')
  a.setSmokePercent(25, pc)
  expect(values.get('nabla.smokePercent')).toBe('25')
  expect(values.get('nabla.settings.headset.smokePercent')).toBe('80')
  expect(createSettingsStore({ mode: 'pc', storage }).getItem('nabla.smokePercent')).toBe('25')
})

it('preserves clamping and live changes when storage rejects writes', () => {
  const settings = new RuntimeVisualSettings()
  const unavailable = {
    setItem: () => {
      throw new Error('Storage unavailable')
    },
  }
  expect(() => settings.setSmokePercent(-1, unavailable)).not.toThrow()
  expect(settings.smokePercent).toBe(0)
  settings.setSmokePercent(Infinity, unavailable)
  expect(settings.smokePercent).toBe(smokeTuning.defaultPercent)
  settings.setSmokePercent(smokeTuning.maxPercent + 1)
  expect(settings.smokePercent).toBe(smokeTuning.maxPercent)
  settings.setAsphaltContrast(100)
  expect(settings.asphaltContrast).toBe(2.5)
})
