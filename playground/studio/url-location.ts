import { MERCATOR_LIMIT } from '../../src/map-tiles.js'
export type UrlLocation = { latitude: number; longitude: number } | { error: string } | null
/** Explicit URL coordinates override the starting place, never erase the saved project. */
export function urlLocation(search: string): UrlLocation {
  const params = new URLSearchParams(search)
  const keys = ['lat', 'latitude', 'lon', 'longitude']
  if (!keys.some((key) => params.has(key))) return null
  const read = (aliases: string[]) => {
    const values = aliases.flatMap((key) => params.getAll(key)).map((value) => value.trim())
    if (!values.length || values.some((value) => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)))
      return NaN
    const numbers = values.map(Number)
    return numbers.every((n) => n === numbers[0]) ? numbers[0] : NaN
  }
  const latitude = read(['lat', 'latitude']),
    longitude = read(['lon', 'longitude'])
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > MERCATOR_LIMIT ||
    Math.abs(longitude) > 180
  )
    return {
      error:
        'URL GPS no válida: indica lat y lon en grados decimales (latitud ±85.05112878, longitud ±180).',
    }
  return { latitude, longitude }
}
