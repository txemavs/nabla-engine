/**
 * Terrain-folder example: play on real Atlas Z15 tiles served by any static host.
 *
 *   ?terrain=<base>          tile host WITHOUT the trailing /z (alias: ?z15=<base>); manifests are read from
 *                            {base}/z/15/{x}/{y}/manifest.json. `/terrain` is the dev server's read-only mount.
 *   &tile=<x>/<y>            start over this tile's centre (e.g. 16211/12003) ...
 *   &dx=<m>&dz=<m>           ... shifted this many metres east / south
 *   &lat=<deg>&lon=<deg>     ... or start at explicit coordinates (decimal degrees, WGS84; dx/dz are ignored)
 *   &ll=<lat>,<lon>          ... the same in one value, as Google Maps shows it (ll=43.3386,-1.7899)
 *   &alt=<m>                 origin altitude, default 0 (terrain files carry absolute elevations)
 *   &heading=<deg>           compass heading the fleet faces (default 0 = north)
 *   &vehicle=<preset>        vehicle the player starts in (default car)
 *   &engineMode=normal|beast engine mode the S3 starts in (default normal; `bestia` also accepted).
 *                            The player switches with B (selector D/S) or J → MOTOR
 *   &vehicles=<json>         extra host vehicles after terrain is ready: JSON array of
 *                            {lat, lon, heading, vehicle, alt?, color?, tow?, box?} (WGS84).
 *                            A non-empty list replaces the built-in parked demo row. Also VITE_NABLA_VEHICLES.
 *   &portals=<json>          standalone Stargate portals after terrain is ready: JSON array of
 *                            {name, lat, lon, heading, alt?, to?, mode?}. `to` links two entries
 *                            (open unless mode=window). Also VITE_NABLA_PORTALS. See host-portals.ts.
 *   &relief=engine|lidar     drivable engine terrain (default) or the 2 m LiDAR mesh
 *   &photo=full|lo|none      orthophoto draped on the ground (default full)
 *   &sky=live|day|<ISO>      real local wall clock (default), fixed midday sun, or a given instant
 *   &time=HH:MM|ahora        time of day (the viewer's time zone) on the day of &sky; `ahora` (or `now`) follows
 *                            the real clock (also the default when &sky=/&time= are omitted). Planeta → Hora
 *   &timeSpeed=1..24         live clock multiplier (1 = wall time). Also in Planeta → Hora
 *   &sea=<m>                 sea level in metres, -5 to 50 (default: the simplified tide). Also in the menu
 *                            section Planeta → Mar
 *   &distance=<m>            load radius (also in the menu, remembered); farther cells are not loaded.
 *                            &cache=<MB> disk cache and &memory=<cells> cells in memory work the same way
 *   &player=hover|walk       the on-foot player is Studio's floating monitor (default) or a walker
 *   &inspectRoads=collision  load the candidate collision GLB for inspection (default off; not the driving collider)
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
import type { MapTile } from '@nabla/engine/scene'
import { parseClockTime } from '@nabla/engine/planet/sky'
import {
  isValidLatLon,
  parseLatLon,
  tileOffsetFromGeo,
  type LatLon,
} from '@nabla/engine/planet/lat-lon'
import { hostVehiclesFromSearch, viteHostVehicles, type HostVehicle } from './host-vehicles.js'
import { osmRoadsRequested } from './layers-ui.js'
import { hostPortalsFromSearch, viteHostPortals, type HostPortal } from './host-portals.js'

/**
 * Tiles listed by the host's optional `index.json` (the dev-server mount offers one), or undefined when
 * it has none. Only used to pick a start cell when the URL names none; streaming never needs it.
 */
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

/** Default query for a package folder: the default start when its cell is published, else just the folder. */
export function terrainDefaults(
  defaultCellPublished: boolean,
  base: string = DEFAULT_TERRAIN_QUERY.terrain,
) {
  return defaultCellPublished ? { ...DEFAULT_TERRAIN_QUERY, terrain: base } : { terrain: base }
}

/**
 * True when the folder publishes the default start cell. This asks for one manifest, like the engine
 * does for any tile; no index file is needed.
 */
export async function probeTerrainFolder(
  base: string = DEFAULT_TERRAIN_QUERY.terrain,
  cell: string = DEFAULT_TERRAIN_QUERY.tile,
): Promise<boolean> {
  try {
    const response = await fetch(`${base}/z/15/${cell}/manifest.json`)
    return response.ok
  } catch {
    return false
  }
}

export interface TerrainConfig {
  /** Tile host base (no trailing slash; empty string = this origin). */
  base: string
  /** Where to start. Undefined only when the host's index must be asked (see `startFromIndex`). */
  start?: { latitude: number; longitude: number }
  tile?: MapTile
  scene: Omit<TerrainDriveOptions, 'latitude' | 'longitude'>
  /** Extra vehicles placed after terrain is ready. Empty when none were declared. */
  vehicles: HostVehicle[]
  /** Standalone portals placed after terrain is ready (`?portals=`). Empty when none. */
  portals?: HostPortal[]
  atlas: Required<AtlasZ15Options>
  playerMode: 'hover' | 'walk'
  /** `&inspectRoads=collision`: show the candidate collision GLB. Not the driving collider. */
  inspectRoadCollision: boolean
  /**
   * `&osmRoads=1`: draw the v2+ OSM road asphalt for inspection (never collides). Default false:
   * only bridges (bridge-deck, supports) render and collide; the GPS OSM data loads either way.
   */
  osmRoads: boolean
  /** `&time=`: minutes after local midnight, or `live` for the real clock. Undefined keeps `&sky=`. */
  timeOfDay?: number | 'live'
  /** `&timeSpeed=`: live clock multiplier, 1–24. Undefined keeps 1×. */
  timeSpeed?: number
  /** `&sea=`: manual sea level in metres. Undefined keeps the simplified tide. */
  seaLevel?: number
}

/** Sea level limits in metres, as in Studio's sea-surface controls. */
export const SEA_LEVEL_RANGE = { min: -5, max: 50 } as const

/** Parse `&time=`: `HH:MM` (also `H`, `HH.MM`) or `ahora`/`now` for the real clock. */
export function parseTimeParam(raw: string): number | 'live' {
  const text = raw.trim().toLowerCase()
  if (text === 'ahora' || text === 'now') return 'live'
  const minutes = parseClockTime(text)
  if (minutes === undefined)
    throw new Error(`time debe ser una hora HH:MM (por ejemplo time=21:30) o ahora, no "${raw}"`)
  return minutes
}

/** Parse `&timeSpeed=`: live clock multiplier, 1–24. */
export function parseTimeSpeedParam(raw: string): number {
  const value = Number(raw.trim().replace(',', '.'))
  if (raw.trim() === '' || !Number.isFinite(value) || value < 1 || value > 24)
    throw new Error(
      `timeSpeed debe ser un número entre 1 y 24 (por ejemplo timeSpeed=12), no "${raw}"`,
    )
  return value
}

/** Parse `&sea=`: metres within the engine's sea-surface range. */
export function parseSeaParam(raw: string): number {
  const level = Number(raw.trim().replace(',', '.'))
  if (raw.trim() === '' || !Number.isFinite(level))
    throw new Error(`sea debe ser un número de metros (por ejemplo sea=3), no "${raw}"`)
  if (level < SEA_LEVEL_RANGE.min || level > SEA_LEVEL_RANGE.max)
    throw new Error(`sea debe estar entre ${SEA_LEVEL_RANGE.min} y ${SEA_LEVEL_RANGE.max} m`)
  return level
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
    throw new Error('Indica lat y lon juntos (o usa ll=<lat>,<lon>, o tile=<x>/<y>).')
  const ll = params.get('ll')
  if (ll !== null && ll.trim() !== '' && lat !== undefined)
    throw new Error('Usa ll=<lat>,<lon> o lat= y lon=, no las dos formas a la vez.')
  const tileParam = params.get('tile')
  let tile: MapTile | undefined
  let start: TerrainConfig['start']
  try {
    let point: LatLon | undefined
    if (ll !== null && ll.trim() !== '') {
      point = parseLatLon(ll)
      if (!point)
        throw new Error(
          `ll debe ser <lat>,<lon> en grados, por ejemplo ll=43.3386,-1.7899 (no "${ll}")`,
        )
    } else if (lat !== undefined && lon !== undefined) {
      point = { latitude: lat, longitude: lon }
      if (!isValidLatLon(point))
        throw new Error('lat/lon fuera de rango (latitud ±85,05°, longitud ±180°)')
    }
    if (point) {
      start = point
      tile = tileOffsetFromGeo(point).tile
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
      ...engineModeParam(params),
    },
    vehicles: hostVehiclesFromSearch(search, viteHostVehicles()),
    ...portalsConfig(search),
    atlas: { relief, photo },
    playerMode: player,
    inspectRoadCollision: params.get('inspectRoads') === 'collision',
    osmRoads: osmRoadsRequested(search),
    timeOfDay: params.has('time') ? parseTimeParam(params.get('time')!) : undefined,
    timeSpeed: params.has('timeSpeed') ? parseTimeSpeedParam(params.get('timeSpeed')!) : undefined,
    seaLevel: params.has('sea') ? parseSeaParam(params.get('sea')!) : undefined,
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

/** Spanish HUD text: cells loaded, cells the host does not have (holes), and those still arriving. */
export function formatCells(stats: { loaded: number; missing: number; pending: number }): string {
  return (
    `Celdas: ${stats.loaded} ${stats.loaded === 1 ? 'cargada' : 'cargadas'}` +
    (stats.missing ? ` · ${stats.missing} ${stats.missing === 1 ? 'falta' : 'faltan'}` : '') +
    (stats.pending ? ` · cargando ${stats.pending}…` : '')
  )
}

/** `portals` only when the host listed some, so configs without portals keep their shape. */
function portalsConfig(search: string): { portals?: HostPortal[] } {
  const portals = hostPortalsFromSearch(search, viteHostPortals())
  return portals.length ? { portals } : {}
}

/** `&engineMode=normal|beast` (or `bestia`): the start mode of cars with engine modes. */
export function engineModeParam(params: URLSearchParams): { engineMode?: 'normal' | 'beast' } {
  const value = params.get('engineMode')?.toLowerCase()
  if (value === 'normal') return { engineMode: 'normal' }
  if (value === 'beast' || value === 'bestia') return { engineMode: 'beast' }
  return {}
}
