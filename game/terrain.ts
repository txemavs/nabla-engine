/**
 * Terrain-folder example: play on real Atlas Z15 tiles served by any static host.
 *
 *   ?terrain=<base>          tile host WITHOUT the trailing /z (alias: ?z15=<base>); manifests are read from
 *                            {base}/z/15/{x}/{y}/manifest.json. `/terrain` is the dev server's read-only mount.
 *   &tile=<x>/<y>            start over this tile's centre (e.g. 16211/12003) ...
 *   &dx=<m>&dz=<m>           ... shifted this many metres east / south
 *   &lat=<deg>&lon=<deg>     ... or start at explicit coordinates
 *   &alt=<m>                 origin altitude, default 0 (terrain files carry absolute elevations)
 *   &heading=<deg>           compass heading the fleet faces (default 0 = north)
 *   &vehicle=<preset>        vehicle the player starts in (default car)
 *   &relief=engine|lidar     drivable engine terrain (default) or the 2 m LiDAR mesh
 *   &photo=full|lo|none      orthophoto draped on the ground (default full)
 *   &sky=day|live|<ISO>      fixed midday sun (default), the real clock, or a given instant
 *   &distance=<m>            load radius (also in the menu, remembered); farther cells are not loaded.
 *                            &cache=<MB> disk cache and &memory=<cells> cells in memory work the same way
 *   &player=hover|walk       the on-foot player is Studio's floating monitor (default) or a walker
 *
 * A bare URL (no query, or only display options) starts the default tile of the dev-server mount.
 */
import { normalizeTilesBase } from '@nabla/engine/planet/static-tiles'
import {
  parseTileSpec,
  tileOffsetToGeo,
  type TerrainDriveOptions,
} from '@nabla/engine/examples/terrain-drive'
import type { AtlasZ15Options } from '@nabla/engine/planet/atlas-z15'
import { mapTileAt, type MapTile } from '@nabla/engine/scene'

/** Tiles listed by the host's `index.json` (dev-server mount), or undefined when it has none. */
export async function fetchCoverage(base: string): Promise<MapTile[] | undefined> {
  try {
    const response = await fetch(`${base}/index.json`)
    if (!response.ok) return undefined
    const index = (await response.json()) as { tiles?: { z: number; x: number; y: number }[] }
    const tiles = index.tiles?.filter((t) => t.z === 15) ?? []
    return tiles.length ? tiles : undefined
  } catch {
    return undefined
  }
}

/** What a bare URL plays: the dev-server mount, over the first straight road of cell 16211/12003. */
export const DEFAULT_TERRAIN_QUERY = {
  terrain: '/terrain',
  tile: '16211/12003',
  dx: '17.4',
  dz: '-197.6',
  heading: '118',
  vehicle: 'car',
}

/** Default query for a package folder: full defaults over cell 16211/12003 when listed, else just the folder. */
export function terrainDefaults(
  index: readonly MapTile[],
  base: string = DEFAULT_TERRAIN_QUERY.terrain,
) {
  return index.some((t) => t.x === 16211 && t.y === 12003)
    ? { ...DEFAULT_TERRAIN_QUERY, terrain: base }
    : { terrain: base }
}

/**
 * The query string to play with, or null when the URL belongs to another mode (`?tiles=`,
 * `?example=flat`, ...). A URL that names no source gets the default terrain when the mount's
 * `index.json` answers; otherwise it keeps the original (error-reporting) flow.
 */
export async function resolveTerrainSearch(
  search: string = location.search,
  fetchIndex: (base: string) => Promise<MapTile[] | undefined> = fetchCoverage,
): Promise<string | null> {
  if (wantsTerrain(search)) return search
  const params = new URLSearchParams(search)
  if (params.has('tiles') || params.has('example') || params.has('api')) return null
  const index = await fetchIndex(DEFAULT_TERRAIN_QUERY.terrain)
  if (!index) return null
  const merged = new URLSearchParams(terrainDefaults(index))
  for (const [key, value] of params) merged.set(key, value)
  return '?' + merged.toString()
}

export interface TerrainConfig {
  /** Tile host base (no trailing slash; empty string = this origin). */
  base: string
  /** Where to start. Undefined only when the host's index must be asked (see `startFromIndex`). */
  start?: { latitude: number; longitude: number }
  tile?: MapTile
  scene: Omit<TerrainDriveOptions, 'latitude' | 'longitude'>
  atlas: Required<AtlasZ15Options>
  playerMode: 'hover' | 'walk'
}

/** True when the URL asks for the terrain-folder example. */
export function wantsTerrain(search: string = location.search): boolean {
  const params = new URLSearchParams(search)
  return params.has('terrain') || params.has('z15') || params.get('example') === 'z15'
}

const finite = (params: URLSearchParams, key: string): number | undefined => {
  const raw = params.get(key)
  if (raw === null || raw.trim() === '') return undefined
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`El parámetro ${key} no es un número: ${raw}`)
  return value
}

/** Parse the URL. Errors are Spanish because they are shown to the player. */
export function parseTerrainConfig(search: string = location.search): TerrainConfig {
  const params = new URLSearchParams(search)
  const raw = params.get('terrain') ?? params.get('z15')
  if (raw === null || raw.trim() === '')
    throw new Error(
      'Falta el origen del terreno: añade ?terrain=<url base> (sin /z al final; /terrain en el servidor de desarrollo con la carpeta montada).',
    )
  const relief = params.get('relief') ?? 'engine'
  const photo = params.get('photo') ?? 'full'
  if (relief !== 'engine' && relief !== 'lidar')
    throw new Error(`relief debe ser engine o lidar, no "${relief}"`)
  if (photo !== 'full' && photo !== 'lo' && photo !== 'none')
    throw new Error(`photo debe ser full, lo o none, no "${photo}"`)
  const player = params.get('player') ?? 'hover'
  if (player !== 'hover' && player !== 'walk')
    throw new Error(`player debe ser hover o walk, no "${player}"`)
  const lat = finite(params, 'lat'),
    lon = finite(params, 'lon')
  if ((lat === undefined) !== (lon === undefined))
    throw new Error('Indica lat y lon juntos (o usa tile=<x>/<y>).')
  const tileParam = params.get('tile')
  let tile: MapTile | undefined
  let start: TerrainConfig['start']
  try {
    if (lat !== undefined && lon !== undefined) {
      if (Math.abs(lat) > 85 || Math.abs(lon) > 180) throw new Error('lat/lon fuera de rango')
      start = { latitude: lat, longitude: lon }
      tile = mapTileAt(lat, lon, 15)
    } else if (tileParam) {
      tile = parseTileSpec(tileParam)
      const at = tileOffsetToGeo(tile, finite(params, 'dx') ?? 0, finite(params, 'dz') ?? 0)
      start = { latitude: at.latitude, longitude: at.longitude }
    }
  } catch (error) {
    throw new Error(
      'Posición inicial no válida: ' + (error instanceof Error ? error.message : String(error)),
    )
  }
  return {
    base: normalizeTilesBase(raw),
    start,
    tile,
    scene: {
      altitude: finite(params, 'alt') ?? 0,
      heading: finite(params, 'heading') ?? 0,
      vehicle: params.get('vehicle') ?? 'car',
      sky: params.get('sky') ?? undefined,
    },
    atlas: { relief, photo },
    playerMode: player,
  }
}

/**
 * Without tile/lat/lon, start over the centre of the first tile in the host's `index.json`
 * ({ tiles: [{ z, x, y }] }, served by the dev server's terrain mount).
 */
export async function startFromIndex(config: TerrainConfig): Promise<TerrainConfig> {
  if (config.start) return config
  const first = (await fetchCoverage(config.base))?.[0]
  if (!first)
    throw new Error(
      'Falta la posición inicial: añade tile=<x>/<y> (por ejemplo tile=16211/12003) o lat y lon; este servidor no ofrece index.json.',
    )
  const at = tileOffsetToGeo({ z: 15, x: first.x, y: first.y })
  return { ...config, tile: first, start: { latitude: at.latitude, longitude: at.longitude } }
}

/** Spanish HUD text for the streaming progress: loaded cells out of the dataset, plus those still arriving. */
export function formatCells(stats: { loaded: number; total: number; pending: number }): string {
  return (
    `Celdas: ${stats.loaded}/${stats.total}` +
    (stats.pending ? ` · cargando ${stats.pending}…` : '')
  )
}
