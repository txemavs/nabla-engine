import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { geographicAssetTransform } from '../src/viewer/index.js'
import { geoToLocal, localToGeo } from '../src/math/geo/sphere.js'
describe('geographic asset placement', () => {
  const origin = { latitude: 43.34, longitude: -1.76, altitude: 0 }
  it('keeps local points unchanged for the same origin', () => {
    const point = new Vector3(100, 25, -80)
    expect(
      point.clone().applyMatrix4(geographicAssetTransform(origin, origin)).distanceTo(point),
    ).toBeLessThan(1e-8)
  })
  it('transforms neighboring frames consistently at their seam', () => {
    const neighbor = { latitude: 43.351, longitude: -1.749, altitude: 0 }
    const point = new Vector3(280, 48, -150)
    const expected = new Vector3(...geoToLocal(origin, localToGeo(neighbor, point.toArray())))
    expect(
      point.applyMatrix4(geographicAssetTransform(origin, neighbor)).distanceTo(expected),
    ).toBeLessThan(1e-6)
  })
  it('rejects malformed coordinates', () => {
    expect(() => geographicAssetTransform(origin, { ...origin, latitude: NaN })).toThrow()
    expect(() => geographicAssetTransform(origin, { ...origin, longitude: 181 })).toThrow()
  })
})
