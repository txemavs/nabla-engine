import { describe, expect, it } from 'vitest'
import {
  highPlanetVisual,
  isHighQualityPreset,
  readSavedPlanetVisual,
  writeSavedPlanetVisual,
} from '../../src/runtime/planet-visual.js'

function memory(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key)
    },
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

describe('high planet visual', () => {
  it('migrates legacy sky visibility without resetting weather and tolerates invalid new fields', () => {
    const storage = memory()
    const { moon, stars, moonHorizonScale, ...legacy } = highPlanetVisual
    storage.setItem('nabla.planetVisual', JSON.stringify({ ...legacy, sky: false }))
    expect(readSavedPlanetVisual(storage)).toMatchObject({
      ...legacy,
      sky: false,
      moon: false,
      stars: false,
      moonHorizonScale: 5,
    })
    storage.setItem(
      'nabla.planetVisual',
      JSON.stringify({ ...legacy, moon: true, stars: false, moonHorizonScale: 100 }),
    )
    expect(readSavedPlanetVisual(storage)).toMatchObject({
      moon: true,
      stars: false,
      moonHorizonScale: 5,
      cloudAmount: 0.4,
    })
  })
  it('is the Alto and Ultra Planeta default, with pressure outside the named modes', () => {
    expect(isHighQualityPreset('high')).toBe(true)
    expect(isHighQualityPreset('ultra')).toBe(true)
    expect(isHighQualityPreset('balanced')).toBe(false)
    expect(highPlanetVisual).toMatchObject({
      sky: true,
      sun: true,
      sea: true,
      clouds: true,
      cloudStyle: 'artistic',
      cloudAmount: 0.4,
      cloudPressure: 0.8,
      lensFlareAmount: 0.5,
    })
    for (const named of [0, 0.12, 0.55]) expect(highPlanetVisual.cloudPressure).not.toBe(named)
  })

  it('round-trips a saved choice and ignores a broken record', () => {
    const storage = memory()
    expect(readSavedPlanetVisual(storage)).toBeUndefined()
    writeSavedPlanetVisual(storage, { ...highPlanetVisual, lensFlareAmount: 0.3 })
    expect(readSavedPlanetVisual(storage)?.lensFlareAmount).toBe(0.3)
    storage.setItem('nabla.planetVisual', '{')
    expect(readSavedPlanetVisual(storage)).toBeUndefined()
  })
})
