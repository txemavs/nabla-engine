import { expect, it } from 'vitest'
import { SURFACE_LAYERS } from '../../src/planet/land/surface.js'
import { isChartCarriageway } from '../../src/render/planet/ground-material.js'

const footLayer = Math.max(...Object.values(SURFACE_LAYERS)) + 1

it('paints carriageways apart from paths, tracks and rails', () => {
  expect(isChartCarriageway({ source: { tags: { highway: 'primary' } } })).toBe(true)
  expect(isChartCarriageway({})).toBe(true)
  expect(isChartCarriageway({ source: { tags: { highway: 'path' } } })).toBe(false)
  expect(isChartCarriageway({ source: { tags: { highway: 'track' } } })).toBe(false)
  expect(isChartCarriageway({ source: { tags: { highway: 'footway' } } })).toBe(false)
  expect(isChartCarriageway({ transport: 'rail' })).toBe(false)
  expect(isChartCarriageway({ transport: 'ballast' })).toBe(false)
  expect(isChartCarriageway({ groundLayer: footLayer })).toBe(false)
  expect(isChartCarriageway({ groundLayer: footLayer + 1 })).toBe(true)
})
