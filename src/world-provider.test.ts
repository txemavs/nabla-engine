import { expect, it } from 'vitest'
import { overpassFeatures } from '../playground/world-provider.js'
it('keeps OSM identities and rejects incomplete building footprints', () => {
  const geometry = [
    { lat: 43, lon: -1 },
    { lat: 43, lon: -1.01 },
    { lat: 43.01, lon: -1 },
    { lat: 43, lon: -1 },
  ]
  const result = overpassFeatures([
    { type: 'way', id: 1, tags: { building: 'yes' }, geometry },
    {
      type: 'relation',
      id: 2,
      tags: { building: 'yes' },
      members: [{ type: 'way', ref: 1, role: 'outer', geometry }],
    },
    { type: 'way', id: 3, tags: { building: 'yes' }, geometry: geometry.slice(0, 3) },
    { type: 'way', id: 4, tags: { highway: 'residential' }, geometry: geometry.slice(0, 2) },
    { type: 'node', id: 5, tags: { natural: 'tree' }, lat: 43, lon: -1 },
  ])
  expect(result.map((f) => f.id)).toEqual(['relation/2', 'way/4', 'node/5'])
  expect(result[0].rings[0].coordinates[0]).toEqual([-1, 43])
})
