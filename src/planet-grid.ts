import { EARTH_RADIUS, type GeoPoint } from './geography.js'

/** Fixed Earth grid, independent of scene origins, altitude, camera and cursor. */
export const PLANET_GRID_VERSION = 'earth-bands-v1'
const rows = Math.ceil((Math.PI * EARTH_RADIUS) / 1200)
const latitudeStep = 180 / rows
function columns(row: number): number {
  const latitude = -90 + (row + 0.5) * latitudeStep
  return Math.max(
    1,
    Math.round((2 * Math.PI * EARTH_RADIUS * Math.cos((latitude * Math.PI) / 180)) / 1200),
  )
}
export function planetCellAt(point: Pick<GeoPoint, 'latitude' | 'longitude'>): string {
  if (
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    Math.abs(point.latitude) > 90
  )
    throw Error('Invalid geographic position')
  const row = Math.min(rows - 1, Math.floor((point.latitude + 90) / latitudeStep))
  const longitude = (((point.longitude + 180) % 360) + 360) % 360
  // Longitude has no meaning at either pole.
  const column =
    Math.abs(point.latitude) === 90
      ? 0
      : Math.min(columns(row) - 1, Math.floor((longitude / 360) * columns(row)))
  return `${PLANET_GRID_VERSION}/${row}/${column}`
}
export function planetCellBounds(id: string) {
  const match = /^earth-bands-v1\/(\d+)\/(\d+)$/.exec(id)
  if (!match) throw Error('Invalid planet cell')
  const row = Number(match[1]),
    column = Number(match[2])
  if (
    !Number.isSafeInteger(row) ||
    row >= rows ||
    !Number.isSafeInteger(column) ||
    column >= columns(row)
  )
    throw Error('Planet cell outside grid')
  if (id !== `${PLANET_GRID_VERSION}/${row}/${column}`) throw Error('Noncanonical planet cell')
  const south = -90 + row * latitudeStep,
    north = -90 + (row + 1) * latitudeStep
  const west = -180 + (column * 360) / columns(row),
    east = -180 + ((column + 1) * 360) / columns(row)
  return {
    south,
    north,
    west,
    east,
    center: { latitude: (south + north) / 2, longitude: (west + east) / 2, altitude: 0 },
  }
}
