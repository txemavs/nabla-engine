import { describe, expect, it } from 'vitest'
import { tileOffsetToGeo } from '../../src/examples/terrain-drive.js'
import {
  formatLatLon,
  isValidLatLon,
  parseLatLon,
  tileOffsetFromGeo,
} from '../../src/planet/lat-lon.js'
import { mapTileSample } from '../../src/scene/mercator.js'

const LON = -1.89493
const irun = { latitude: 43.3386, longitude: -1.7899 }

describe('parseLatLon', () => {
  it('reads the Google Maps format and its relatives', () => {
    for (const text of [
      '43.3386, -1.7899',
      '43.3386,-1.7899',
      '43.3386 -1.7899',
      ' 43.3386 ,  -1.7899 ',
      '(43.3386, -1.7899)',
      '43.3386; -1.7899',
      '43,3386; -1,7899',
      '43,3386 -1,7899',
      '43.3386 N, 1.7899 W',
      '43.3386°N 1.7899°W',
      'N43.3386 W1.7899',
      '1.7899 W 43.3386 N',
      '43°20\'19.0"N 1°47\'23.6"W',
      '43°20′19.0″N 1°47′23.6″W',
    ]) {
      const got = parseLatLon(text)
      expect(got, text).toBeDefined()
      expect(got!.latitude, text).toBeCloseTo(irun.latitude, 3)
      expect(got!.longitude, text).toBeCloseTo(irun.longitude, 3)
    }
    expect(parseLatLon('43.3386, 1.7899')).toEqual({ latitude: 43.3386, longitude: 1.7899 })
    expect(parseLatLon('-33.9, 151.2')).toEqual({ latitude: -33.9, longitude: 151.2 })
    expect(parseLatLon('33.9 S, 151.2 E')).toEqual({ latitude: -33.9, longitude: 151.2 })
  })

  it('rejects what is not a position', () => {
    for (const text of [
      '',
      'hola',
      '43.3386',
      '43.3386, -1.7899, 12',
      '43.3386, abc',
      '91, 10',
      '86, 10',
      '10, 181',
      '43.3 N, 10 N',
      '43.3 E, 10 W, 3',
      'NaN, 4',
    ])
      expect(parseLatLon(text), text).toBeUndefined()
  })

  it('validates the Web Mercator range', () => {
    expect(isValidLatLon({ latitude: 85.05, longitude: 180 })).toBe(true)
    expect(isValidLatLon({ latitude: 85.06, longitude: 0 })).toBe(false)
    expect(isValidLatLon({ latitude: 0, longitude: -180.1 })).toBe(false)
    expect(isValidLatLon({ latitude: NaN, longitude: 0 })).toBe(false)
  })

  it('formats like Google Maps and round-trips through the parser', () => {
    expect(formatLatLon(irun)).toBe('43.33860, -1.78990')
    expect(parseLatLon(formatLatLon(irun))).toEqual(irun)
  })
})

describe('tileOffsetFromGeo', () => {
  it('finds the Irun cell that holds 43.3386, -1.7899', () => {
    const at = tileOffsetFromGeo(irun)
    expect(at.tile).toEqual({ z: 15, x: 16221, y: 11998 })
    expect(Math.abs(at.dx)).toBeLessThan(700)
    expect(Math.abs(at.dz)).toBeLessThan(700)
  })

  it('is the inverse of tileOffsetToGeo, including the default road start of cell 16211/12003', () => {
    const tile = { z: 15, x: 16211, y: 12003 }
    const geo = tileOffsetToGeo(tile, 17.4, -197.6)
    const back = tileOffsetFromGeo(geo)
    expect(back.tile).toEqual(tile)
    expect(back.dx).toBeCloseTo(17.4, 3)
    expect(back.dz).toBeCloseTo(-197.6, 3)
    // Known point: the default start of cell 16211/12003.
    expect(geo.latitude).toBeCloseTo(43.29898, 4)
    expect(geo.longitude).toBeCloseTo(LON, 4)
  })

  it('round-trips tile -> lat/lon -> tile for every cell of the area, centre and corners', () => {
    for (let x = 16211; x <= 16225; x += 2)
      for (let y = 11996; y <= 12003; y++) {
        const tile = { z: 15, x, y }
        const centre = mapTileSample(tile, 1, 1, 2)
        expect(tileOffsetFromGeo(centre).tile).toEqual(tile)
        expect(tileOffsetFromGeo(centre).dx).toBeCloseTo(0, 6)
        // Just inside each corner stays in the same cell.
        for (const [c, r] of [
          [1, 1],
          [255, 1],
          [1, 255],
          [255, 255],
        ]) {
          const inside = mapTileSample(tile, c, r, 256)
          const back = tileOffsetFromGeo(inside)
          expect(back.tile).toEqual(tile)
          expect(Math.abs(back.dx)).toBeLessThan(700)
          expect(Math.abs(back.dz)).toBeLessThan(700)
        }
      }
  })

  it('puts a point east and south of the centre at positive dx and dz', () => {
    const tile = { z: 15, x: 16221, y: 11998 }
    const geo = tileOffsetToGeo(tile, 100, 50)
    const at = tileOffsetFromGeo(geo)
    expect([at.dx, at.dz].map((v) => Math.round(v))).toEqual([100, 50])
  })
})
