import { Matrix4, Quaternion, Vector3 } from 'three'
import type { Vec3Tuple } from './scene.js'
export const EARTH_RADIUS = 6371000
export interface GeoPoint {
  latitude: number
  longitude: number
  altitude: number
}
export const MADRID: GeoPoint = { latitude: 40.4166, longitude: -3.70384, altitude: 0 }
const rad = Math.PI / 180
/** ECEF matched to equirectangular globe texture: +Y north, longitude 0 on +X. */
export function ecef(point: GeoPoint): Vector3 {
  const lat = point.latitude * rad,
    lon = point.longitude * rad,
    r = EARTH_RADIUS + point.altitude
  return new Vector3(
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.sin(lat),
    -r * Math.cos(lat) * Math.sin(lon),
  )
}
export function localFrame(origin: GeoPoint): Quaternion {
  const lat = origin.latitude * rad,
    lon = origin.longitude * rad
  const east = new Vector3(-Math.sin(lon), 0, -Math.cos(lon))
  const up = ecef({ ...origin, altitude: 0 }).normalize()
  const south = new Vector3(
    Math.sin(lat) * Math.cos(lon),
    -Math.cos(lat),
    -Math.sin(lat) * Math.sin(lon),
  )
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(east, up, south))
}
/** Local metres: +X east, +Y up, -Z north. WGS84 angles on a mean-radius sphere. */
export function geoToLocal(origin: GeoPoint, point: GeoPoint): Vec3Tuple {
  return ecef(point).sub(ecef(origin)).applyQuaternion(localFrame(origin).invert()).toArray()
}
export function localToGeo(origin: GeoPoint, position: Vec3Tuple): GeoPoint {
  const p = new Vector3(...position).applyQuaternion(localFrame(origin)).add(ecef(origin))
  return {
    latitude: Math.asin(p.y / p.length()) / rad,
    longitude: Math.atan2(-p.z, p.x) / rad,
    altitude: p.length() - EARTH_RADIUS,
  }
}
export function tileCoordinate(latitude: number, longitude: number, zoom: number) {
  const n = 2 ** zoom,
    lat = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * rad
  return {
    x: ((longitude + 180) / 360) * n,
    y: ((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2) * n,
  }
}
export function tilePoint(x: number, y: number, zoom: number): GeoPoint {
  const n = 2 ** zoom
  return {
    latitude: Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) / rad,
    longitude: (x / n) * 360 - 180,
    altitude: 0,
  }
}
export function tileUrl(
  style: 'satellite' | 'streets',
  zoom: number,
  x: number,
  y: number,
): string {
  const n = 2 ** zoom,
    wrapped = ((x % n) + n) % n
  return style === 'satellite'
    ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${wrapped}`
    : `https://a.basemaps.cartocdn.com/dark_all/${zoom}/${wrapped}/${y}.png`
}
/** Approximate apparent Sun/Moon adapted from Agency sunPosition (not navigation ephemerides). */
export function celestialDirections(at: Date): { sun: Vector3; moon: Vector3 } {
  const n = at.getTime() / 86400000 + 2440587.5 - 2451545,
    t = n / 36525
  const gmst = 280.46061837 + 360.98564736629 * n + 0.000387933 * t * t
  const eps = (23.439 - 4e-7 * n) * rad
  const direction = (lambda: number, beta: number) => {
    const dec = Math.asin(
      Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lambda),
    )
    const ra = Math.atan2(
      Math.cos(beta) * Math.cos(eps) * Math.sin(lambda) - Math.sin(beta) * Math.sin(eps),
      Math.cos(beta) * Math.cos(lambda),
    )
    return ecef({ latitude: dec / rad, longitude: ra / rad - gmst, altitude: 0 }).normalize()
  }
  const g = (357.528 + 0.9856003 * n) * rad
  return {
    sun: direction(
      (280.46 + 0.9856474 * n + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad,
      0,
    ),
    moon: direction(
      (218.316 + 13.176396 * n + 6.289 * Math.sin((134.963 + 13.064993 * n) * rad)) * rad,
      5.128 * rad * Math.sin((93.272 + 13.22935 * n) * rad),
    ),
  }
}
