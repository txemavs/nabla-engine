/** Which game mode a page runs and with which query: the URL first, then the remembered terrain choice. */
import {
  chooseTerrainSource,
  loadTerrainSource,
  parseTerrainSource,
  POSITION_PARAMS,
  withTerrainSource,
  type SourceStorage,
} from '@nabla/engine/planet/terrain-source'
import {
  DEFAULT_TERRAIN_QUERY,
  probeTerrainFolder,
  terrainDefaults,
  wantsTerrain,
} from './terrain.js'

export const SOURCE_STORAGE_KEY = 'nabla.terrain.source'

export interface Entry {
  /** `terrain` = Atlas package folder; `drive` = flat tile or tile host (the original demo). */
  mode: 'terrain' | 'drive'
  search: string
}

export function browserStorage(): SourceStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/**
 * URL parameters win (they keep every old link working). A URL that names no source uses the
 * remembered choice; with none remembered, the package folder when it publishes the default start
 * cell (one manifest request; no index file), else the flat tile.
 */
/** Default package base: the build's tile route (VITE_NABLA_TILES_URL), else the folder mount. */
export function configuredPackagesUrl(): string {
  return (
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_NABLA_TILES_URL ||
    DEFAULT_TERRAIN_QUERY.terrain
  )
}

export async function resolveEntry(
  search: string = location.search,
  storage: SourceStorage | undefined = browserStorage(),
  probe: (base: string) => Promise<boolean> = probeTerrainFolder,
  packagesUrl: string = configuredPackagesUrl(),
): Promise<Entry> {
  const params = new URLSearchParams(search)
  // Dynamic preparation (`api`, `static`) is the original demo's own mode.
  if (wantsTerrain(search)) return { mode: 'terrain', search }
  if (parseTerrainSource(search) || params.has('api') || params.has('static'))
    return { mode: 'drive', search }

  const published = await probe(packagesUrl)
  const choice = chooseTerrainSource({
    search,
    stored: loadTerrainSource(storage, SOURCE_STORAGE_KEY),
    packagesAvailable: published,
  })
  // The build's tile route (same-origin Atlas proxy, as Euskadi uses) replaces the folder mount.
  if (choice.from === 'default' && choice.source.kind === 'packages')
    choice.source = { ...choice.source, url: packagesUrl }
  const next = new URLSearchParams(withTerrainSource(search, choice.source))
  if (choice.source.kind === 'packages') {
    // Start over the default road, then let anything the URL already said win.
    const merged = new URLSearchParams(terrainDefaults(published, choice.source.url))
    // A URL that names its own position (tile, lat/lon, ll) replaces the default road start entirely,
    // and keeps that position even though it named no source (withTerrainSource drops positions then).
    if (['tile', 'lat', 'lon', 'll'].some((key) => params.has(key)))
      for (const key of ['tile', 'dx', 'dz', 'heading']) merged.delete(key)
    for (const key of POSITION_PARAMS) if (params.has(key)) next.set(key, params.get(key)!)
    for (const [key, value] of next) merged.set(key, value)
    return { mode: 'terrain', search: '?' + merged.toString() }
  }
  const text = next.toString()
  return { mode: 'drive', search: text ? '?' + text : '' }
}
