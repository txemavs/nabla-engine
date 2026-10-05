/**
 * Geographic coordinates as people write them, and their place in the Z15 tile grid.
 *
 * `parseLatLon` reads what a map site gives you ("43.3386, -1.7899" from Google Maps, "43.3386 N 1.7899 W",
 * `43°20'19.0"N 1°47'23.6"W`, Spanish decimal commas with a semicolon). `tileOffsetFromGeo` is the inverse of
 * `tileOffsetToGeo` (examples/terrain-drive): the WebMercatorQuad tile that contains the point and the metres
 * east / south of that tile's centre. Pure maths, no DOM.
 */
import { geoToLocal } from '../math/geo/sphere.js'
import { MERCATOR_LIMIT, mapTileAt, mapTileSample, type MapTile } from '../scene/mercator.js'

export interface LatLon {
  latitude: number
  longitude: number
}

/** True for a finite WGS84 position that fits the WebMercatorQuad grid. */
export function isValidLatLon(value: LatLon): boolean {
  return (
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.latitude) <= MERCATOR_LIMIT &&
    Math.abs(value.longitude) <= 180
  )
}

/** `43.33860, -1.78990`: the order and shape Google Maps accepts back in its search box. */
export function formatLatLon(value: LatLon, digits = 5): string {
  return `${value.latitude.toFixed(digits)}, ${value.longitude.toFixed(digits)}`
}

const NUMBER = String.raw`\d+(?:\.\d+)?`
const DMS = new RegExp(
  String.raw`([-+])?\s*([NSEWO])?\s*(${NUMBER})\s*°\s*(?:(${NUMBER})\s*')?\s*(?:(${NUMBER})\s*")?\s*([NSEWO])?`,
  'gi',
)
const DECIMAL = new RegExp(
  String.raw`([-+])?\s*([NSEWO])?\s*(${NUMBER})\s*°?\s*([NSEWO])?(?![\d.])`,
  'gi',
)

interface Part {
  value: number
  /** `lat` or `lon` when a hemisphere letter said so. */
  axis?: 'lat' | 'lon'
}

function part(
  sign: string | undefined,
  before: string | undefined,
  amount: number,
  after: string | undefined,
): Part {
  const letter = (after ?? before)?.toUpperCase()
  let value = amount
  if (sign === '-') value = -value
  if (letter === 'S' || letter === 'W' || letter === 'O') value = -Math.abs(value)
  return { value, axis: letter ? (letter === 'N' || letter === 'S' ? 'lat' : 'lon') : undefined }
}

function normalise(text: string): string {
  return text
    .replace(/[′’‘`´]/g, "'")
    .replace(/[″”“]|''/g, '"')
    .replace(/[º˚]/g, '°')
    .replace(/[()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Read a latitude and longitude from text, or undefined when it is not one. Accepts:
 * `43.3386, -1.7899` · `43.3386 -1.7899` · `43.3386;-1.7899` · `43,3386; -1,7899` · `43,3386 -1,7899`
 * · `43.3386 N, 1.7899 W` · `N43.3386 W1.7899` · `43°20'19.0"N 1°47'23.6"W`.
 * Latitude comes first unless hemisphere letters say otherwise. Out-of-range values are rejected
 * (the Web Mercator grid stops at ±85.0511° latitude).
 */
export function parseLatLon(text: string): LatLon | undefined {
  let t = normalise(text)
  if (!t) return undefined
  const parts: Part[] = []
  let rest = t
  if (/°/.test(t)) {
    rest = t.replace(DMS, (_all, sign, before, deg, min, sec, after) => {
      const amount = Number(deg) + Number(min ?? 0) / 60 + Number(sec ?? 0) / 3600
      parts.push(part(sign, before, amount, after))
      return ' '
    })
  } else {
    // A decimal comma only when there is no decimal point and the pair is separated by ';' or a space.
    if (!t.includes('.') && (t.includes(';') || /^[-+]?\d+,\d+ [-+]?\d+,\d+$/.test(t)))
      t = t.replace(/(\d),(\d)/g, '$1.$2')
    rest = t.replace(DECIMAL, (_all, sign, before, amount, after) => {
      parts.push(part(sign, before, Number(amount), after))
      return ' '
    })
  }
  if (parts.length !== 2 || /[^\s,;]/.test(rest)) return undefined
  const [first, second] = parts
  let latitude = first.value
  let longitude = second.value
  if (first.axis === 'lon' || second.axis === 'lat') {
    if (first.axis === 'lat' || second.axis === 'lon') return undefined
    ;[latitude, longitude] = [second.value, first.value]
  } else if (first.axis === second.axis && first.axis) return undefined
  const result = { latitude, longitude }
  return isValidLatLon(result) ? result : undefined
}

export interface TileOffset {
  tile: MapTile
  /** Metres east of the tile's centre. */
  dx: number
  /** Metres south of the tile's centre (the engine's +Z). */
  dz: number
}

/** The Z15 tile that holds the point, and where inside it (metres from the tile centre). */
export function tileOffsetFromGeo(value: LatLon, z = 15): TileOffset {
  const tile = mapTileAt(value.latitude, value.longitude, z)
  const centre = mapTileSample(tile, 1, 1, 2)
  const [dx, , dz] = geoToLocal(centre, { ...value, altitude: centre.altitude })
  return { tile, dx, dz }
}
