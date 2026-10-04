/**
 * Where a game gets its terrain from, chosen at runtime and carried by the page URL.
 *
 *  - `flat`     the bundled flat GLB tile (`?example=flat`), fully offline
 *  - `tiles`    a tile host, `?tiles=<base url>` (manifests under `<base>/z/15/<x>/<y>/`)
 *  - `packages` a folder of Atlas Z15 packages, `?terrain=<base url>` (alias `?z15=`), optional `&relief=lidar`
 *
 * This module only parses, serialises, remembers and chooses; it touches neither the DOM nor the
 * network. Hosts apply a choice by reloading with `withTerrainSource(search, source)`.
 */
export type TerrainSourceKind = 'flat' | 'tiles' | 'packages'
export type TerrainRelief = 'engine' | 'lidar'

export interface TerrainSource {
  kind: TerrainSourceKind
  /** Tile host (`tiles`) or package folder (`packages`); unused by `flat`. */
  url?: string
  /** `packages` only: drivable engine terrain (default) or the visual LiDAR mesh. */
  relief?: TerrainRelief
}

/** Selector entries, in display order, with the Spanish text shown to the player. */
export const TERRAIN_SOURCES: readonly { kind: TerrainSourceKind; label: string; hint: string }[] =
  [
    { kind: 'flat', label: 'Plano', hint: 'Baldosa plana incluida, sin conexión' },
    { kind: 'tiles', label: 'Teselas', hint: 'Servidor de teselas (URL base)' },
    { kind: 'packages', label: 'Carpeta de paquetes', hint: 'Paquetes Z15 de Atlas' },
  ]

/** The dev-server mount of a package folder. */
export const DEFAULT_PACKAGES_URL = '/terrain'

/** The public Atlas tile host: `{url}/z/15/{x}/{y}/manifest.json`. No index file; absent cells are holes. */
export const DEFAULT_TILES_URL = 'https://atlas.chained.world/euskadi/terraform'

/** URL parameters that choose the source. */
export const SOURCE_PARAMS = ['example', 'terrain', 'z15', 'tiles', 'relief'] as const
/** URL parameters that place the player inside a source; they mean nothing for another one. */
export const POSITION_PARAMS = ['tile', 'dx', 'dz', 'heading', 'lat', 'lon', 'alt'] as const

const URL_BASE = /^(https?:\/\/|\/|\.\.?\/)\S*$/

/** Normalise a tile/package base URL, or throw a Spanish error shown next to the field. */
export function normalizeSourceUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Escribe la URL base de las teselas.')
  if (!URL_BASE.test(trimmed))
    throw new Error('La URL debe empezar por http://, https:// o / (por ejemplo /terrain).')
  // "/" alone is this origin; keep it explicit so that it round-trips.
  return trimmed === '/' ? '/' : trimmed.replace(/\/+$/, '')
}

/** The source named by a URL query, or null when it names none. Precedence: packages, flat, tiles. */
export function parseTerrainSource(search: string): TerrainSource | null {
  const params = new URLSearchParams(search)
  const packages = params.get('terrain') ?? params.get('z15')
  if (packages !== null && packages.trim() !== '')
    return {
      kind: 'packages',
      url: packages.trim().replace(/\/+$/, ''),
      relief: params.get('relief') === 'lidar' ? 'lidar' : 'engine',
    }
  if (params.get('example') === 'flat') return { kind: 'flat' }
  const tiles = params.get('tiles')
  if (tiles !== null && tiles.trim() !== '') return { kind: 'tiles', url: tiles.trim() }
  return null
}

/** Check a source before it is applied or stored; returns it normalised. */
export function validateTerrainSource(source: TerrainSource): TerrainSource {
  if (source.kind === 'flat') return { kind: 'flat' }
  if (source.kind === 'tiles') return { kind: 'tiles', url: normalizeSourceUrl(source.url ?? '') }
  if (source.kind === 'packages')
    return {
      kind: 'packages',
      url: normalizeSourceUrl(source.url || DEFAULT_PACKAGES_URL),
      relief: source.relief === 'lidar' ? 'lidar' : 'engine',
    }
  throw new Error('Origen de terreno desconocido.')
}

/**
 * The query to reload with so that `source` is used. Other parameters (quality, layers, vehicle ...)
 * are kept. Position parameters are dropped when the kind changes, because a tile offset of one
 * source means nothing in another; changing only the URL or the relief keeps the position.
 */
export function withTerrainSource(search: string, source: TerrainSource): string {
  const next = validateTerrainSource(source)
  const params = new URLSearchParams(search)
  const before = parseTerrainSource(search)
  for (const key of SOURCE_PARAMS) params.delete(key)
  if (before?.kind !== next.kind) for (const key of POSITION_PARAMS) params.delete(key)
  if (next.kind === 'flat') params.set('example', 'flat')
  else if (next.kind === 'tiles') params.set('tiles', next.url!)
  else {
    params.set('terrain', next.url!)
    if (next.relief === 'lidar') params.set('relief', 'lidar')
  }
  const text = params.toString()
  return text ? '?' + text : ''
}

/** A remembered choice from storage text; anything unreadable is "nothing remembered". */
export function parseStoredSource(text: string | null | undefined): TerrainSource | null {
  if (!text) return null
  try {
    const value = JSON.parse(text) as Partial<TerrainSource> | null
    if (!value || typeof value !== 'object') return null
    return validateTerrainSource(value as TerrainSource)
  } catch {
    return null
  }
}

export function serializeStoredSource(source: TerrainSource): string {
  return JSON.stringify(validateTerrainSource(source))
}

export interface SourceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function loadTerrainSource(
  storage: SourceStorage | undefined,
  key: string,
): TerrainSource | null {
  try {
    return parseStoredSource(storage?.getItem(key))
  } catch {
    return null
  }
}

export function saveTerrainSource(
  storage: SourceStorage | undefined,
  key: string,
  source: TerrainSource,
): void {
  try {
    storage?.setItem(key, serializeStoredSource(source))
  } catch {
    // Private mode or a full quota: the choice just is not remembered.
  }
}

export interface SourceChoice {
  source: TerrainSource
  /** Why: the URL named it, it was remembered, or it is the default. */
  from: 'url' | 'remembered' | 'default'
}

/**
 * Decide which source a page uses. The URL wins; then the remembered choice (a package folder
 * only while it answers); then the package folder when it is available, else the flat tile.
 */
export function chooseTerrainSource(options: {
  search: string
  stored?: TerrainSource | null
  /** True when the default package folder answers (it publishes the default start cell). */
  packagesAvailable: boolean
}): SourceChoice {
  const explicit = parseTerrainSource(options.search)
  if (explicit) return { source: explicit, from: 'url' }
  const stored = options.stored
  if (
    stored &&
    (stored.kind !== 'packages' ||
      options.packagesAvailable ||
      (stored.url ?? DEFAULT_PACKAGES_URL) !== DEFAULT_PACKAGES_URL)
  )
    return { source: stored, from: 'remembered' }
  return {
    source: options.packagesAvailable
      ? { kind: 'packages', url: DEFAULT_PACKAGES_URL, relief: 'engine' }
      : { kind: 'flat' },
    from: 'default',
  }
}
