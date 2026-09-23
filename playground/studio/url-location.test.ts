import { expect, it } from 'vitest'
import { urlLocation } from './url-location.js'
it('accepts named decimal coordinates, including zero and either order', () => {
  expect(urlLocation('?lon=-1.819606&lat=43.32969')).toEqual({
    latitude: 43.32969,
    longitude: -1.819606,
  })
  expect(urlLocation('?latitude=0&longitude=0')).toEqual({ latitude: 0, longitude: 0 })
  expect(urlLocation('?lat=-33.86&lon=151.2')).toEqual({ latitude: -33.86, longitude: 151.2 })
  expect(urlLocation('?lat=40&latitude=40&lon=0')).toEqual({ latitude: 40, longitude: 0 })
})
it('ignores unrelated parameters and rejects incomplete or ambiguous destinations', () => {
  expect(urlLocation('?scene=circuit')).toBeNull()
  for (const query of [
    '?lat=40',
    '?lon=3',
    '?lat=&lon=0',
    '?lat=NaN&lon=0',
    '?lat=0&lon=181',
    '?lat=90&lon=0',
    '?lat=40&lat=41&lon=0',
    '?lat=40&latitude=41&lon=0',
  ])
    expect(urlLocation(query)).toHaveProperty('error')
})
