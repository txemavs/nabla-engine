import { describe, expect, it, test } from 'vitest'
import { osmSnapshotPavedAreas } from '../../src/planet/osm-snapshot.js'
import {
  GRASS_GRIP,
  classifyWheelSurface,
  insidePavedArea,
  surfaceGripScale,
} from '../../src/simulation/wheel-surface.js'

const road = {
  points: [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
  ],
  width: 6,
}

test('a wheel on the carriageway is asphalt and one beside it is grass', () => {
  expect(classifyWheelSurface(10, 0, [road])).toBe('asphalt')
  expect(classifyWheelSurface(10, 3, [road])).toBe('asphalt')
  expect(classifyWheelSurface(10, 4, [road])).toBe('grass')
  expect(classifyWheelSurface(10, 200, [road])).toBe('grass')
  expect(classifyWheelSurface(10, 0, [])).toBeNull()
  expect(classifyWheelSurface(Number.NaN, 0, [road])).toBeNull()
  expect(surfaceGripScale('grass')).toBe(GRASS_GRIP)
  expect(surfaceGripScale('asphalt')).toBe(1)
  expect(surfaceGripScale(null)).toBe(1)
  expect(GRASS_GRIP).toBeLessThan(1)
  expect(GRASS_GRIP).toBeGreaterThan(0)
})

test('the segment index finds the same nearest road point as the linear scan', async () => {
  const { RoadSegmentIndex, nearestRoadPoint } = await import('../../src/simulation/road-snap.js')
  let seed = 7
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  const roads = Array.from({ length: 60 }, () => {
    let x = random() * 2000,
      z = random() * 2000
    return {
      width: 4 + Math.abs(random()) * 8,
      points: Array.from({ length: 6 }, () => ({
        x: (x += random() * 150),
        z: (z += random() * 150),
      })),
    }
  })
  const index = new RoadSegmentIndex(roads)
  for (let i = 0; i < 400; i++) {
    const x = random() * 2200,
      z = random() * 2200
    for (const max of [80, 400]) {
      const linear = nearestRoadPoint(x, z, roads, max)
      const indexed = index.nearest(x, z, max)
      if (!linear) expect(indexed).toBeNull()
      else {
        expect(indexed!.distance).toBeCloseTo(linear.distance, 9)
        expect(indexed!.x).toBeCloseTo(linear.x, 9)
        expect(indexed!.z).toBeCloseTo(linear.z, 9)
        expect(indexed!.width).toBe(linear.width)
      }
    }
  }
  expect(classifyWheelSurface(10, 0, new RoadSegmentIndex([road]))).toBe('asphalt')
  expect(classifyWheelSurface(10, 4, new RoadSegmentIndex([road]))).toBe('grass')
  expect(classifyWheelSurface(10, 0, new RoadSegmentIndex([]))).toBeNull()
})

describe('paved areas (car parks)', () => {
  const lot = {
    points: [
      { x: 0, z: 0 },
      { x: 40, z: 0 },
      { x: 40, z: 30 },
      { x: 0, z: 30 },
      { x: 0, z: 0 },
    ],
    minX: 0,
    maxX: 40,
    minZ: 0,
    maxZ: 30,
  }
  const far = [
    {
      points: [
        { x: -200, z: -100 },
        { x: 200, z: -100 },
      ],
      width: 7,
    },
  ]
  it('a contact inside a car park is asphalt even far from every carriageway', () => {
    expect(classifyWheelSurface(20, 15, far, undefined, [lot])).toBe('asphalt')
    expect(classifyWheelSurface(20, 15, far)).toBe('grass')
    expect(classifyWheelSurface(60, 15, far, undefined, [lot])).toBe('grass')
    expect(insidePavedArea(39.9, 29.9, lot)).toBe(true)
    expect(insidePavedArea(40.1, 10, lot)).toBe(false)
  })
  it('reads car parks from the OSM snapshot, not underground ones or grass lots', () => {
    const ring = (lat: number) => [
      { lat, lon: -1.76 },
      { lat, lon: -1.759 },
      { lat: lat + 0.001, lon: -1.759 },
      { lat, lon: -1.76 },
    ]
    const snapshot = {
      format: 'nabla-ways-osm-cell/1',
      roads: {
        elements: [
          {
            type: 'way',
            id: 1,
            tags: { amenity: 'parking', parking: 'surface' },
            geometry: ring(43.34),
          },
          {
            type: 'way',
            id: 2,
            tags: { amenity: 'parking', parking: 'underground' },
            geometry: ring(43.35),
          },
          {
            type: 'way',
            id: 3,
            tags: { amenity: 'parking', surface: 'grass' },
            geometry: ring(43.36),
          },
          {
            type: 'way',
            id: 4,
            tags: { highway: 'pedestrian', area: 'yes' },
            geometry: ring(43.37),
          },
          { type: 'way', id: 5, tags: { highway: 'residential' }, geometry: ring(43.38) },
        ],
      },
    }
    expect(osmSnapshotPavedAreas(snapshot).map((a) => a.id)).toEqual(['1', '4'])
  })
})
