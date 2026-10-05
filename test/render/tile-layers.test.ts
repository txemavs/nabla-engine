import { afterEach, describe, expect, it } from 'vitest'
import {
  TILE_LAYERS,
  formatLayerSpec,
  hiddenTileLayers,
  loadHiddenLayers,
  parseLayerSpec,
  saveHiddenLayers,
  setHiddenTileLayers,
  tileMeshHidden,
  PLACE_LABEL_CATEGORY,
} from '../../src/render/planet/tile-layers.js'
import { GROUND_DRAPE_LIFT, ROOF_DRAPE_LIFT } from '../../src/render/planet/world.js'

describe('tile layers', () => {
  afterEach(() => setHiddenTileLayers([]))

  it('lists the road first, in Spanish', () => {
    expect(TILE_LAYERS[0]).toMatchObject({ id: 'road', label: 'Carretera' })
    expect(new Set(TILE_LAYERS.map((l) => l.id)).size).toBe(TILE_LAYERS.length)
  })

  it('hides the road mesh and its photo drape but keeps the ground photo under it', () => {
    setHiddenTileLayers(['road'])
    expect(tileMeshHidden({ category: 'Roads' })).toBe(true)
    expect(tileMeshHidden({ drape: 'roads' })).toBe(true)
    expect(tileMeshHidden({ drape: 'terrain' })).toBe(false)
    expect(tileMeshHidden({ category: 'Terrain' })).toBe(false)
    expect(tileMeshHidden({ category: 'Surfaces' })).toBe(false)
  })

  it('hides buildings with their roof photo, and the ground photo on its own', () => {
    setHiddenTileLayers(['buildings'])
    expect(tileMeshHidden({ category: 'Buildings' })).toBe(true)
    expect(tileMeshHidden({ drape: 'roofs' })).toBe(true)
    setHiddenTileLayers(['photo'])
    expect(tileMeshHidden({ drape: 'terrain' })).toBe(true)
    expect(tileMeshHidden({ drape: 'roads' })).toBe(false)
  })

  it('hides the floating city names as the places layer', () => {
    expect(TILE_LAYERS.map((layer) => layer.id)).toContain('places')
    const label = { category: PLACE_LABEL_CATEGORY }
    expect(tileMeshHidden(label)).toBe(false)
    setHiddenTileLayers(['places'])
    expect(tileMeshHidden(label)).toBe(true)
    expect(tileMeshHidden({ category: 'Roads' })).toBe(false)
  })

  it('writes and reads choices relative to a host default', () => {
    const base = ['places']
    expect(formatLayerSpec(['places'], base)).toBe('')
    expect(formatLayerSpec([], base)).toBe('+places')
    expect(formatLayerSpec(['road', 'places'], base)).toBe('-road')
    expect(parseLayerSpec('', base)).toEqual(['places'])
    expect(parseLayerSpec('+places', base)).toEqual([])
    expect(parseLayerSpec('-road', base)).toEqual(['road', 'places'])
    const memory = new Map<string, string>()
    const storage = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => void memory.set(k, v),
    }
    expect(loadHiddenLayers(storage, 'k', base)).toEqual(['places'])
    saveHiddenLayers(storage, 'k', [], base)
    expect(memory.get('k')).toBe('+places')
    expect(loadHiddenLayers(storage, 'k', base)).toEqual([])
  })

  it('ignores unknown ids and shows everything by default', () => {
    expect(tileMeshHidden({ category: 'Roads' })).toBe(false)
    setHiddenTileLayers(['nope', 'road'])
    expect(hiddenTileLayers()).toEqual(['road'])
  })

  it('parses and formats the layers URL parameter', () => {
    expect(parseLayerSpec('-road')).toEqual(['road'])
    expect(parseLayerSpec('-road,-photo,-nothing')).toEqual(['road', 'photo'])
    expect(parseLayerSpec('road', ['road', 'photo'])).toEqual(['photo'])
    expect(parseLayerSpec('+road', ['road'])).toEqual([])
    expect(parseLayerSpec('none')).toEqual(TILE_LAYERS.map((l) => l.id))
    expect(parseLayerSpec('all', ['road'])).toEqual([])
    expect(parseLayerSpec(null)).toEqual([])
    expect(formatLayerSpec(['photo', 'road'])).toBe('-road,-photo')
    expect(formatLayerSpec([])).toBe('')
  })

  it('persists the choice and survives a broken store', () => {
    const data = new Map<string, string>()
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    }
    saveHiddenLayers(storage, 'k', ['road'])
    expect(data.get('k')).toBe('-road')
    expect(loadHiddenLayers(storage, 'k')).toEqual(['road'])
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(loadHiddenLayers(broken, 'k')).toEqual([])
    expect(() => saveHiddenLayers(broken, 'k', ['road'])).not.toThrow()
    expect(loadHiddenLayers(undefined, 'k')).toEqual([])
  })
})

describe('photo drape height', () => {
  it('lifts roof photos but leaves ground photos on the physics surface', () => {
    expect(ROOF_DRAPE_LIFT).toBeGreaterThanOrEqual(0.1)
    expect(GROUND_DRAPE_LIFT).toBeLessThanOrEqual(0.01)
  })
})
