import { expect, it, vi } from 'vitest'
import { RuntimePlanetPreferences } from '../../src/runtime/planet-preferences.js'
import { createSettingsStore } from '../../src/runtime/settings-scope.js'
import { highPlanetVisual } from '../../src/runtime/planet-visual.js'

const sky = () => ({
  setLayers: vi.fn(),
  setCloudStyle: vi.fn(),
  setCloudWeather: vi.fn(),
  setLensFlareAmount: vi.fn(),
})

it('restores legacy preferences without writes, preserving quality and host sea precedence', () => {
  const store = {
    getItem: () => JSON.stringify({ ...highPlanetVisual, sea: false }),
    setItem: vi.fn(),
  }
  const a = new RuntimePlanetPreferences(),
    view = sky()
  a.restore(store, 'minimal')
  expect(a.state.cloudStyle).toBe('artistic')
  expect(a.state.sea).toBe(false)
  a.initializeView(view, true)
  expect(a.state.sea).toBe(true)
  expect(store.setItem).not.toHaveBeenCalled()
  expect(view.setCloudWeather).toHaveBeenCalledWith(0.4, 0.8)
  const b = new RuntimePlanetPreferences()
  b.restore({ getItem: () => '{bad', setItem: vi.fn() }, 'ultra')
  expect(b.state.cloudStyle).toBe('artistic')
  b.restore(undefined, 'minimal')
  expect(b.state.cloudStyle).toBe('low')
})

it('isolates state, render updates and saved namespaces including restored instances', () => {
  const values = new Map([['nabla.planetVisual', JSON.stringify(highPlanetVisual)]])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
  const left = createSettingsStore({ mode: 'pc', namespace: 'left', storage })
  const right = createSettingsStore({ mode: 'pc', namespace: 'right', storage })
  const a = new RuntimePlanetPreferences(),
    b = new RuntimePlanetPreferences(),
    av = sky(),
    bv = sky()
  a.restore(left, 'minimal')
  b.restore(right, 'minimal')
  a.initializeView(av, true)
  b.initializeView(bv, true)
  a.setLayers({ sky: false, sea: false }, av, left)
  a.setCloudStyle('low', av, left)
  a.setCloudWeather(0.2, undefined, av, left)
  a.setLensFlareAmount(0.1, av, left)
  expect(a.state.cloudPressure).toBe(0.8)
  expect(b.state).toEqual(highPlanetVisual)
  expect(bv.setLayers).toHaveBeenCalledTimes(1)
  expect(av.setLayers).toHaveBeenLastCalledWith({
    sky: false,
    planets: false,
    moon: false,
    sun: true,
    clouds: true,
  })
  const restored = new RuntimePlanetPreferences()
  restored.restore(createSettingsStore({ mode: 'pc', namespace: 'left', storage }), 'ultra')
  expect(restored.state).toEqual(a.state)
  expect(values.get('nabla.planetVisual')).toBe(JSON.stringify(highPlanetVisual))
  const snapshot = a.config()
  snapshot.sky = true
  expect(a.layers.sky).toBe(false)
})

it('rejects invalid values atomically and keeps live changes when persistence fails', () => {
  const a = new RuntimePlanetPreferences(),
    view = sky()
  const storage = {
    getItem: () => {
      throw Error('denied')
    },
    setItem: () => {
      throw Error('quota')
    },
  }
  a.restore(storage, 'minimal')
  const before = { ...a.state }
  for (const bad of [NaN, Infinity, -1, 2]) {
    expect(() => a.setCloudWeather(bad, 0.5, view, storage)).toThrow('Cloud amount')
    expect(() => a.setCloudWeather(0.5, bad, view, storage)).toThrow('Cloud pressure')
    expect(() => a.setLensFlareAmount(bad, view, storage)).toThrow('Lens flare')
  }
  expect(a.state).toEqual(before)
  expect(view.setCloudWeather).not.toHaveBeenCalled()
  a.setCloudWeather(0.5, 0.3, view, storage)
  a.setLensFlareAmount(0.2, view, storage)
  expect(a.state.cloudAmount).toBe(0.5)
  expect(a.state.lensFlareAmount).toBe(0.2)
})
