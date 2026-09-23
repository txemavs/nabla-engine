import { it, expect } from 'vitest'
import { planetPlaces, validPlanetPlaces } from './planet-places.js'
import { planetTileFrame, type PlanetTileSource } from './planet-tile.js'
import { mapTileAt } from './map-tiles.js'
import { localToGeo } from './geography.js'
it('preserves named places and terrain height with one tile owner', () => {
  const tile = mapTileAt(43.33, -1.82, 15),
    frame = planetTileFrame(tile)
  const point = [frame.anchor.longitude, frame.anchor.latitude] as [number, number]
  const feature = {
    id: 'node/1',
    tags: { place: 'city', name: 'Irún' },
    rings: [{ role: 'outer' as const, coordinates: [point] }],
  }
  const source: PlanetTileSource = {
    format: 'nabla-planet-source-v1',
    tile,
    retrievedAt: new Date().toISOString(),
    elevation: { segments: 32, heights: Array(33 ** 2).fill(600), provider: 'esri-terrain-3d' },
    features: [feature, feature],
  }
  const places = planetPlaces(source)
  expect(places).toHaveLength(1)
  expect(places[0].text).toBe('Irún')
  expect(localToGeo(frame.anchor, places[0].position).altitude).toBeCloseTo(620, 4)
  expect(planetPlaces({ ...source, tile: { ...tile, x: tile.x + 1 } })).toEqual([])
  expect(validPlanetPlaces([...places, { ...places[0], position: [0, NaN, 0] }])).toEqual(places)
  expect(validPlanetPlaces(undefined)).toEqual([])
})
