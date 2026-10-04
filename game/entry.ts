/** Which game mode a page runs and with which query: the URL first, then the remembered terrain choice. */
import {
  chooseTerrainSource,
  loadTerrainSource,
  parseTerrainSource,
  withTerrainSource,
  type SourceStorage,
} from '@nabla/engine/planet/terrain-source'
import type { MapTile } from '@nabla/engine/scene'
import { DEFAULT_TERRAIN_QUERY, fetchCoverage, terrainDefaults, wantsTerrain } from './terrain.js'

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
 * remembered choice; with none remembered, the package folder when `/terrain/index.json` answers,
 * else the flat tile.
 */
export async function resolveEntry(
  search: string = location.search,
  storage: SourceStorage | undefined = browserStorage(),
  fetchIndex: (base: string) => Promise<MapTile[] | undefined> = fetchCoverage,
): Promise<Entry> {
  const params = new URLSearchParams(search)
  // Dynamic preparation (`api`, `static`) is the original demo's own mode.
  if (wantsTerrain(search)) return { mode: 'terrain', search }
  if (parseTerrainSource(search) || params.has('api') || params.has('static'))
    return { mode: 'drive', search }

  const index = await fetchIndex(DEFAULT_TERRAIN_QUERY.terrain)
  const choice = chooseTerrainSource({
    search,
    stored: loadTerrainSource(storage, SOURCE_STORAGE_KEY),
    packagesAvailable: !!index,
  })
  const next = new URLSearchParams(withTerrainSource(search, choice.source))
  if (choice.source.kind === 'packages') {
    // Start over the default road, then let anything the URL already said win.
    const merged = new URLSearchParams(terrainDefaults(index ?? [], choice.source.url))
    for (const [key, value] of next) merged.set(key, value)
    return { mode: 'terrain', search: '?' + merged.toString() }
  }
  const text = next.toString()
  return { mode: 'drive', search: text ? '?' + text : '' }
}
