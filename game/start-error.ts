/** What the player sees when the terrain cannot start: Spanish text and, over a hole, a way out. */
import type { GroundMissingError } from '@nabla/engine/runtime'
import { type MapTile } from '@nabla/engine/scene'
import {
  DEFAULT_TERRAIN_QUERY,
  fetchCoverage,
  probeTerrainFolder,
  terrainDefaults,
} from './terrain.js'

export interface ErrorAction {
  label: string
  /** Query string (with `?`) to load; the page navigates to it. */
  search: string
}

export interface StartError {
  message: string
  actions: ErrorAction[]
}

/** True for the engine's "no tile under the start position" error (by name, so any copy of the engine matches). */
export function isGroundMissing(error: unknown): error is GroundMissingError {
  return error instanceof Error && error.name === 'GroundMissingError' && 'tile' in error
}

/** Spanish text for an error that stopped the terrain from starting. */
export function describeStartError(error: unknown): string {
  if (isGroundMissing(error))
    return (
      `No hay terreno en la celda ${error.tile.x}/${error.tile.y}: el servidor no la tiene, ` +
      `así que el punto de inicio queda en un hueco. Revisa tile=, lat= y lon= (o ll=) de la URL, o usa «Ir a latitud, longitud» del menú.`
    )
  const text = error instanceof Error ? error.message : String(error)
  const ground = /^Ground unavailable: (.*)$/s.exec(text)
  if (ground) return `No se pudo cargar el terreno bajo el punto de inicio. ${ground[1]}`
  return text
}

/** The listed cell closest to `from` (Euclidean distance in cells), or undefined for an empty list. */
export function nearestCell(from: MapTile, cells: readonly MapTile[]): MapTile | undefined {
  let best: MapTile | undefined
  let bestDistance = Infinity
  for (const cell of cells) {
    if (cell.z !== from.z) continue
    const distance = (cell.x - from.x) ** 2 + (cell.y - from.y) ** 2
    if (distance < bestDistance) {
      best = cell
      bestDistance = distance
    }
  }
  return best
}

/** The current URL moved onto `cell`: its centre, with the old position (offsets, lat/lon) dropped. */
export function searchForCell(search: string, cell: MapTile): string {
  const params = new URLSearchParams(search)
  for (const key of ['dx', 'dz', 'lat', 'lon', 'll', 'alt']) params.delete(key)
  params.set('tile', `${cell.x}/${cell.y}`)
  return '?' + params.toString()
}

/** The current URL moved to the default road start of the package folder. */
export function searchForDefaultStart(search: string, base: string): string {
  const params = new URLSearchParams(search)
  for (const key of ['lat', 'lon', 'll', 'alt']) params.delete(key)
  for (const [key, value] of Object.entries(terrainDefaults(true, base)))
    if (key !== 'vehicle' || !params.has('vehicle')) params.set(key, value)
  return '?' + params.toString()
}

/**
 * Error text plus the buttons that can fix it. Over a hole the nearest available cell comes from the
 * host's optional index (the dev-server mount has one); without it, the default start when that is published.
 * Nothing here is remembered: a bad position lives only in the URL.
 */
export async function startError(
  error: unknown,
  base: string,
  search: string = location.search,
): Promise<StartError> {
  const message = describeStartError(error)
  if (!isGroundMissing(error)) return { message, actions: [] }
  const actions: ErrorAction[] = []
  const listed = await fetchCoverage(base)
  const near = listed && nearestCell(error.tile, listed)
  if (near)
    actions.push({
      label: `Ir a la celda disponible más cercana (${near.x}/${near.y})`,
      search: searchForCell(search, near),
    })
  else if (await probeTerrainFolder(base, DEFAULT_TERRAIN_QUERY.tile))
    actions.push({
      label: 'Ir al inicio por defecto',
      search: searchForDefaultStart(search, base),
    })
  return { message, actions }
}
