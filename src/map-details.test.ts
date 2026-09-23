import { expect, it } from 'vitest'
import { createRealWorld, type MapFeature, type WorldExtract } from './real-world.js'
import { localToGeo } from './geography.js'
import { isMapBuilding } from './scene.js'
import { mapTileEntities } from './map-fingerprint.js'
const origin = { latitude: 43.32969, longitude: -1.819606, altitude: 28.253 }
const ring = (points: [number, number][]) => [
  {
    role: 'outer',
    coordinates: points.map(([x, z]): [number, number] => {
      const p = localToGeo(origin, [x, 0, z])
      return [p.longitude, p.latitude]
    }),
  },
]
const feature = (
  id: number,
  tags: Record<string, string>,
  points: [number, number][],
): MapFeature => ({ id: `way/${id}`, tags, rings: ring(points) })
const world = (features: MapFeature[]) =>
  createRealWorld({
    name: 'Fixture',
    origin,
    terrain: { columns: 121, rows: 121, spacing: 10, heights: Array(14641).fill(0) },
    features,
    source: { retrievedAt: '2026-09-23' },
  } as WorldExtract)
it('renders ballast and two rails without driveable roads, buildings or colliders', () => {
  const doc = world([
    feature(1, { railway: 'rail', gauge: '1668' }, [
      [-50, 0],
      [50, 0],
    ]),
    feature(2, { railway: 'rail', tunnel: 'yes' }, [
      [-50, 20],
      [50, 20],
    ]),
    feature(3, { railway: 'abandoned' }, [
      [-50, 40],
      [50, 40],
    ]),
  ])
  const rail = doc.entities.filter((e) => e.railway)
  expect(rail.length).toBeGreaterThanOrEqual(3)
  expect(rail.every((e) => e.motion === 'none' && !e.road && !isMapBuilding(e))).toBe(true)
  expect(rail.every((e) => e.source?.id === 'way/1')).toBe(true)
  expect(rail.filter((e) => e.railway!.part === 'rail').length).toBe(2)
  const centers = rail
    .filter((e) => e.railway!.part === 'rail')
    .map((e) => e.geometry!.vertices.reduce((s, v) => s + v[2], 0) / e.geometry!.vertices.length)
  expect(Math.abs(centers[0] - centers[1])).toBeCloseTo(1.668, 2)
  expect(mapTileEntities(doc, '0_0').some((e) => e.railway)).toBe(true)
})
it('raises railway bridges and keeps their visual geometry bounded', () => {
  const doc = world([
    feature(1, { railway: 'rail', bridge: 'yes', layer: '2' }, [
      [-100, 0],
      [100, 0],
    ]),
  ])
  const rail = doc.entities.filter((e) => e.railway)
  expect(Math.max(...rail.flatMap((e) => e.geometry!.vertices.map((v) => v[1])))).toBeGreaterThan(9)
  expect(rail.every((e) => e.geometry!.vertices.length <= 2048)).toBe(true)
})
it('keeps city names as nonphysical entities and gives each point one tile owner', () => {
  const place = feature(1, { place: 'city', name: 'Irún / Irun' }, [[0, 0]])
  place.id = 'node/1'
  const doc = world([place, feature(2, { place: 'town', name: 'Outside' }, [[700, 0]])])
  expect(doc.entities.filter((e) => e.placeLabel).map((e) => e.placeLabel!.text)).toEqual([
    'Irún / Irun',
  ])
  expect(mapTileEntities(doc, '0_0').some((e) => e.placeLabel)).toBe(true)
})
it('renders stream fallback as visual water and lets mapped water areas take precedence', () => {
  const stream = feature(1, { waterway: 'stream' }, [
    [-40, 0],
    [40, 0],
  ])
  const d = world([stream])
  const water = d.entities.filter((e) => e.landcover?.isWater)
  expect(water.length).toBeGreaterThan(0)
  expect(water.every((e) => e.motion === 'none' && e.geometry && !e.road)).toBe(true)
  const area = feature(2, { natural: 'water' }, [
    [-60, -20],
    [60, -20],
    [60, 20],
    [-60, 20],
    [-60, -20],
  ])
  expect(world([stream, area]).entities.some((e) => e.source?.id === 'way/1')).toBe(false)
})
