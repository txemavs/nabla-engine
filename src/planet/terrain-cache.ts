/**
 * Terrain cache and load-radius settings: how much a host keeps of the streamed terrain on disk
 * (the shared IndexedDB map cache), how many cells it keeps in memory, and how far it loads.
 *
 * Pure data: no DOM, no storage, no network. The engine already owns the mechanisms
 * (`setMapCacheBudget`, `mapCacheStats`, `clearMapCache`, `PlanetWorld.setDistance` and the cell
 * budget); this module gives hosts one validated vocabulary for them, the same choices Studio offers.
 */

/** IndexedDB budgets offered to the player, in MB. 0 switches the disk cache off. */
export const CACHE_BUDGETS_MB: readonly number[] = [0, 25, 50, 100, 500, 1000, 2000, 5000, 10000]
/** Cells kept in memory (the quality presets' own steps). */
export const MEMORY_CELL_CHOICES: readonly number[] = [12, 24, 64, 96, 140, 240]
/** Load radius around the player, in metres (Studio's "Dibujado" steps). */
export const LOAD_DISTANCES_M: readonly number[] = [1000, 2000, 4000, 6000, 10000, 20000]

/** URL parameters that override the remembered values. */
export const CACHE_PARAMS = ['cache', 'memory', 'distance'] as const

/** Unset fields keep the quality preset's own value. */
export interface TerrainCacheSettings {
  /** Disk (IndexedDB) budget in MB; 0 = disk cache off. */
  diskMb?: number
  /** Cells kept in memory. */
  cells?: number
  /** Load radius in metres. */
  distance?: number
}

const LIMITS = {
  diskMb: { min: 0, max: 10_000, integer: false },
  cells: { min: 8, max: 240, integer: true },
  distance: { min: 500, max: 20_000, integer: false },
} as const

function inRange(key: keyof typeof LIMITS, value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const { min, max, integer } = LIMITS[key]
  if (value < min || value > max || (integer && !Number.isInteger(value))) return undefined
  return value
}

/** Keep only valid fields; anything else is dropped (the preset's value then applies). */
export function normalizeCacheSettings(value: unknown): TerrainCacheSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const out: TerrainCacheSettings = {}
  const diskMb = inRange('diskMb', v.diskMb),
    cells = inRange('cells', v.cells),
    distance = inRange('distance', v.distance)
  if (diskMb !== undefined) out.diskMb = diskMb
  if (cells !== undefined) out.cells = cells
  if (distance !== undefined) out.distance = distance
  return out
}

/** Settings written in a URL: `?cache=<MB>&memory=<cells>&distance=<m>`. Invalid values are ignored. */
export function parseCacheParams(search: string): TerrainCacheSettings {
  const params = new URLSearchParams(search)
  const num = (key: string) => {
    const raw = params.get(key)
    return raw === null || raw.trim() === '' ? undefined : Number(raw)
  }
  return normalizeCacheSettings({
    diskMb: num('cache'),
    cells: num('memory'),
    distance: num('distance'),
  })
}

export function parseStoredCache(raw: string | null | undefined): TerrainCacheSettings {
  if (!raw) return {}
  try {
    return normalizeCacheSettings(JSON.parse(raw))
  } catch {
    return {}
  }
}
export function serializeStoredCache(settings: TerrainCacheSettings): string {
  return JSON.stringify(normalizeCacheSettings(settings))
}

/** URL parameters beat what was remembered, field by field; `defaults` fill what neither sets. */
export function resolveCacheSettings(
  search: string,
  stored: TerrainCacheSettings,
  defaults: TerrainCacheSettings = {},
): TerrainCacheSettings {
  return { ...defaults, ...stored, ...parseCacheParams(search) }
}

/** Spanish label of a MB budget ("Desactivada", "500 MB", "1 GB"). */
export function formatBudget(mb: number): string {
  if (mb === 0) return 'Desactivada'
  return mb >= 1000 ? `${mb / 1000} GB` : `${mb} MB`
}
export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${metres / 1000} km` : `${metres} m`
}

/** "123.4 / 1000 MB · 12 archivos" for the disk cache. */
export function formatCacheUsage(stats: {
  bytes: number
  entries: number
  budget: number
}): string {
  const budgetMb = stats.budget / 1_000_000
  return `${(stats.bytes / 1_000_000).toFixed(1)} / ${budgetMb} MB · ${stats.entries} archivos`
}
/** Spanish memory line: cells resident out of the memory limit. */
export function formatMemoryCells(loaded: number, limit: number): string {
  return `${loaded} celdas en memoria (límite ${limit})`
}
