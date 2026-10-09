import { expect, test } from 'vitest'
import {
  GRASS_GRIP,
  classifyWheelSurface,
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
