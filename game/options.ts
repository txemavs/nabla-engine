/**
 * Game options: runtime settings panel and persistent tile cache.
 *
 * Uses the same IndexedDB cache as Studio (nabla-map-cache-v1) with shared
 * budget/LRU eviction. Default budget is 100 GB but the browser decides
 * the actual quota—storage.persist() and storage.estimate() report what
 * was granted. The selected budget is a request, not a guarantee.
 */

import { mapCacheStats, setMapCacheBudget, clearMapCache } from '../src/render/planet/cache.js'

export interface GameOptions {
  /** Tile cache budget in MB; 0 disables caching. Default 100000 (100 GB). */
  cacheBudgetMb: number
  /** Tile concurrency (1-3). */
  tileConcurrency: number
  /** Prefetch lookahead in seconds (0-45). */
  prefetchAhead: number
  /** View distance in meters. */
  viewDistance: number
  /** Override static tiles base URL; empty = use config. */
  tilesBaseUrl: string
  /** Vehicle preset ID. */
  vehicle: string
}

const STORAGE_KEY = 'nabla.game.options.v1'

const defaults: GameOptions = {
  cacheBudgetMb: 100000,
  tileConcurrency: 2,
  prefetchAhead: 30,
  viewDistance: 4000,
  tilesBaseUrl: '',
  vehicle: '',
}

export function readGameOptions(): GameOptions {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return { ...defaults }
    const s = JSON.parse(stored)
    return {
      cacheBudgetMb: clamp(s.cacheBudgetMb, 0, 100000, defaults.cacheBudgetMb),
      tileConcurrency: clamp(s.tileConcurrency, 1, 3, defaults.tileConcurrency),
      prefetchAhead: clamp(s.prefetchAhead, 0, 45, defaults.prefetchAhead),
      viewDistance: clamp(
        s.viewDistance,
        1000,
        20000,
        defaults.viewDistance,
        [1000, 2000, 4000, 6000, 10000, 20000],
      ),
      tilesBaseUrl: typeof s.tilesBaseUrl === 'string' ? s.tilesBaseUrl : '',
      vehicle: typeof s.vehicle === 'string' ? s.vehicle : '',
    }
  } catch {
    return { ...defaults }
  }
}

export function saveGameOptions(options: GameOptions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options))
  } catch {
    /* Storage unavailable; current session remains usable. */
  }
}

function clamp(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
  allowed?: number[],
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  if (allowed && !allowed.includes(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

export interface StorageInfo {
  /** Granted quota in bytes, or null if unavailable. */
  quota: number | null
  /** Current site usage in bytes. */
  usage: number
  /** Whether persistent storage was granted. */
  persisted: boolean
}

/** Query browser storage quota and persistence status. */
export async function getStorageInfo(): Promise<StorageInfo> {
  const info: StorageInfo = { quota: null, usage: 0, persisted: false }
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate()
      info.quota = estimate.quota ?? null
      info.usage = estimate.usage ?? 0
    }
    if (navigator.storage?.persisted) {
      info.persisted = await navigator.storage.persisted()
    }
  } catch {
    /* Storage API unavailable. */
  }
  return info
}

/** Request persistent storage. Returns true if granted. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export interface CacheInfo {
  /** Stored bytes. */
  bytes: number
  /** Number of cached entries. */
  entries: number
  /** Configured budget in bytes. */
  budget: number
}

/** Get current cache statistics. */
export async function getCacheInfo(): Promise<CacheInfo | null> {
  try {
    return await mapCacheStats()
  } catch {
    return null
  }
}

/**
 * Set the cache budget. The browser may grant less; this is a request.
 * @param mb Budget in megabytes (0-100000).
 */
export async function setCacheBudget(mb: number): Promise<void> {
  await setMapCacheBudget(mb)
}

/** Clear all cached map data. */
export async function clearCache(): Promise<void> {
  await clearMapCache()
}

/** Format bytes as human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`
}
