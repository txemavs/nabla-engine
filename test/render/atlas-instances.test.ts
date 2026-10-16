import { expect, it } from 'vitest'
import { atlasTreeInstances } from '../../src/render/planet/instances.js'
import type { PlanetCollisionChunk } from '../../src/planet/contract.js'
const ground = {
  bounds: [-10, 2, -10, 10, 2, 10],
  triangles: new Float32Array([-10, 2, -10, 10, 2, -10, 0, 2, 10]),
  buildings: false,
} as PlanetCollisionChunk
it('snaps Atlas trees to terrain and uses authored height without placing unsupported objects', () => {
  const roof = {
    ...ground,
    buildings: true,
    bounds: [-10, 20, -10, 10, 20, 10],
    triangles: new Float32Array([-10, 20, -10, 10, 20, -10, 0, 20, 10]),
  } as PlanetCollisionChunk
  expect(
    atlasTreeInstances(
      {
        instances: [
          { type: 'tree', local: [0, null, 0], height: 8 },
          { type: 'tree', local: [99, null, 99] },
          { type: 'traffic_sign', local: [0, null, 0] },
        ],
      },
      [ground, roof],
    ),
  ).toEqual([{ position: [0, 2, 0], size: [8, 8] }])
})
it('rejects invalid coordinates and defaults missing height to the existing six-metre tree', () => {
  expect(
    atlasTreeInstances(
      {
        instances: [
          { type: 'tree', local: [0, null, 0] },
          { type: 'tree', local: [NaN, null, 0] },
          { type: 'tree', local: ['0', null, 0] },
        ],
      },
      [ground],
    ),
  ).toEqual([{ position: [0, 2, 0], size: [6, 6] }])
  expect(() => atlasTreeInstances({}, [ground])).toThrow('Invalid Atlas instances')
})

it('converts only published lamp instances into the existing geographic lights', async () => {
  const { atlasLightMarks } = await import('../../src/render/planet/instance-lights.js')
  const anchor = { latitude: 43.34, longitude: -1.76, altitude: 0 }
  const marks = atlasLightMarks(
    {
      instances: [
        { type: 'street_lamp', local: [0, null, 0] },
        { type: 'tree', local: [0, null, 0] },
        { type: 'street_lamp', local: [Infinity, null, 0] },
      ],
    },
    anchor,
  )
  expect(marks).toHaveLength(1)
  expect(marks[0].lat).toBeCloseTo(anchor.latitude, 10)
  expect(marks[0].lon).toBeCloseTo(anchor.longitude, 10)
  expect(marks[0].tags).toEqual({ highway: 'street_lamp' })
})
