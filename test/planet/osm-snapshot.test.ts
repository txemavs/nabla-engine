import { expect, it } from 'vitest'
import { geoToLocal, type GeoPoint } from '../../src/math/geo/sphere.js'
import {
  OSM_CELL_FORMAT,
  osmSnapshotHighways,
  projectOsmRoads,
} from '../../src/planet/osm-snapshot.js'

const origin: GeoPoint = { latitude: 43.329, longitude: -1.795, altitude: 8 }

const snapshot = {
  format: OSM_CELL_FORMAT,
  roads: {
    elements: [
      {
        type: 'way',
        id: 101,
        tags: { highway: 'primary', name: 'Nafarroa hiribidea', lanes: '2' },
        geometry: [
          { lat: 43.329, lon: -1.795 },
          { lat: 43.329, lon: -1.794 },
        ],
      },
      {
        type: 'way',
        id: 102,
        tags: { highway: 'residential' },
        geometry: [
          { lat: 43.328, lon: -1.795 },
          { lat: 43.328, lon: -1.794 },
        ],
      },
      {
        type: 'way',
        id: 103,
        tags: { highway: 'footway', name: 'Paseo' },
        geometry: [
          { lat: 43.33, lon: -1.795 },
          { lat: 43.33, lon: -1.794 },
        ],
      },
      {
        type: 'way',
        id: 104,
        tags: { highway: 'construction', name: 'Obras' },
        geometry: [
          { lat: 43.329, lon: -1.795 },
          { lat: 43.329, lon: -1.794 },
        ],
      },
    ],
  },
}

it('reads package OSM highways and keeps named streets', () => {
  const roads = osmSnapshotHighways(snapshot)
  expect(roads.map((r) => r.id)).toEqual(['101', '102', '103'])
  expect(roads.filter((r) => r.name).map((r) => r.name)).toEqual(['Nafarroa hiribidea', 'Paseo'])
  expect(roads.find((r) => r.id === '101')?.carriageway).toBe(true)
  expect(roads.find((r) => r.id === '103')?.carriageway).toBe(false)
  expect(osmSnapshotHighways({ format: 'other/1', roads: snapshot.roads })).toEqual([])
})

it('projects snapshot roads into the vehicle metre frame', () => {
  const [street] = projectOsmRoads(
    osmSnapshotHighways(snapshot).filter((r) => r.name === 'Nafarroa hiribidea'),
    origin,
  )
  const start = geoToLocal(origin, {
    latitude: 43.329,
    longitude: -1.795,
    altitude: origin.altitude,
  })
  const end = geoToLocal(origin, { latitude: 43.329, longitude: -1.794, altitude: origin.altitude })
  expect(street.points[0]).toEqual({ x: start[0], z: start[2] })
  expect(street.points[1]).toEqual({ x: end[0], z: end[2] })
  expect(street.minX).toBeLessThan(street.maxX)
})
