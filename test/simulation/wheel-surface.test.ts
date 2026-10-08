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
