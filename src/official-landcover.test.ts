import { expect, it } from 'vitest'
import { applyOfficialLandcover } from './official-landcover.js'
import { createRealWorld, type WorldExtract } from './real-world.js'
import { localToGeo } from './geography.js'
import { parseScene } from './scene.js'
const origin = { latitude: 43.33, longitude: -1.82, altitude: 0 }
it('uses official legend colours on existing terrain vertices and validates their count', () => {
  const extract: WorldExtract = {
    name: 'palette',
    origin,
    terrain: { columns: 3, rows: 3, spacing: 10, heights: Array(9).fill(0) },
    source: { retrievedAt: '2026-09-23' },
    features: [],
  }
  const doc = createRealWorld(extract)
  const ring = [
    [-20, -20],
    [20, -20],
    [20, 20],
    [-20, 20],
    [-20, -20],
  ].map(([x, z]) => {
    const p = localToGeo(origin, [x, 0, z])
    return [p.longitude, p.latitude]
  })
  const data = {
    dataset: 'bta5-land-use-11',
    complete: true,
    revision: 'a'.repeat(64),
    retrievedAt: '2026-09-23',
    colors: { Prado: '#728944' },
    features: [
      { properties: { LEYENDA_1: 'Prado' }, geometry: { type: 'Polygon', coordinates: [ring] } },
    ],
  }
  expect(applyOfficialLandcover(doc, data, extract)).toBe(9)
  const terrain = doc.entities.find((e) => e.terrain)!
  expect(terrain.terrain!.colors).toEqual(Array(9).fill('#728944'))
  expect(terrain.terrain!.heights).toEqual(extract.terrain.heights)
  expect(() => parseScene(doc)).not.toThrow()
  terrain.terrain!.colors!.pop()
  expect(() => parseScene(doc)).toThrow()
})
