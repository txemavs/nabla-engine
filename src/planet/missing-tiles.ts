/**
 * Tiles a static host does not have (HTTP 404, or 403 on S3-style hosts).
 *
 * A missing tile is a hole, not an error: the engine keeps playing around it. This list does two jobs:
 *  - a negative cache, so a tile that just answered "not found" is not asked for again for a while
 *    (no 404 spam on every streaming pass);
 *  - a persistent record (z/x/y, status, when) that the host can show and hand to the tile producer
 *    to publish the cells that are wanted but absent.
 *
 * Pure data: storage is injected (`localStorage` in the browser), nothing here touches the DOM or network.
 */
import { mapTileId, type MapTile } from '../scene/mercator.js'

export interface MissingTile {
  z: number
  x: number
  y: number
  /** HTTP status the host answered (404, 403). */
  status: number
  /** When it was last seen missing, ms since the epoch. */
  at: number
}

export interface MissingStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface MissingTilesOptions {
  /** Storage key; use one per tile host. Without storage the list lives for the session. */
  key?: string
  storage?: MissingStorage
  /** A tile seen missing less than this long ago is not requested again. Default 10 minutes. */
  retryAfterMs?: number
  /** Oldest entries are dropped beyond this many. Default 2000. */
  max?: number
  now?: () => number
}

export const MISSING_TILES_KEY = 'nabla.terrain.missing'

function valid(value: unknown): value is MissingTile {
  const t = value as MissingTile
  return (
    !!t &&
    Number.isInteger(t.z) &&
    Number.isInteger(t.x) &&
    Number.isInteger(t.y) &&
    Number.isInteger(t.status) &&
    Number.isFinite(t.at)
  )
}

/** One line per tile for a report to the tile producer: `z/x/y status ISO-time`. */
export function formatMissingReport(tiles: readonly MissingTile[]): string {
  return tiles
    .map((t) => `${t.z}/${t.x}/${t.y} ${t.status} ${new Date(t.at).toISOString()}`)
    .join('\n')
}

export class MissingTiles {
  private readonly entries = new Map<string, MissingTile>()
  private readonly key: string
  private readonly storage?: MissingStorage
  private readonly retryAfterMs: number
  private readonly max: number
  private readonly now: () => number
  private saving = false

  constructor(options: MissingTilesOptions = {}) {
    this.key = options.key ?? MISSING_TILES_KEY
    this.storage = options.storage
    this.retryAfterMs = options.retryAfterMs ?? 10 * 60_000
    this.max = options.max ?? 2000
    this.now = options.now ?? Date.now
    try {
      const parsed = JSON.parse(this.storage?.getItem(this.key) ?? '[]')
      if (Array.isArray(parsed))
        for (const t of parsed) if (valid(t)) this.entries.set(mapTileId(t), { ...t })
    } catch {
      /* A corrupt record starts a new list. */
    }
  }

  /** Remember that the host answered "not here" for this tile. */
  record(tile: MapTile, status: number): void {
    this.entries.set(mapTileId(tile), {
      z: tile.z,
      x: tile.x,
      y: tile.y,
      status,
      at: this.now(),
    })
    if (this.entries.size > this.max) {
      const oldest = [...this.entries].sort((a, b) => a[1].at - b[1].at)[0]
      this.entries.delete(oldest[0])
    }
    this.save()
  }

  /** The tile turned up: it is no longer missing. */
  resolve(tile: MapTile): void {
    if (this.entries.delete(mapTileId(tile))) this.save()
  }

  has(tile: MapTile): boolean {
    return this.entries.has(mapTileId(tile))
  }

  /** True while the negative cache says not to ask again. */
  suppressed(tile: MapTile): boolean {
    const entry = this.entries.get(mapTileId(tile))
    return !!entry && this.now() - entry.at < this.retryAfterMs
  }

  /** Every recorded tile, oldest first. */
  list(): MissingTile[] {
    return [...this.entries.values()].sort((a, b) => a.at - b.at).map((t) => ({ ...t }))
  }

  /** How many of the given tiles are recorded missing. */
  countAmong(tiles: readonly MapTile[]): number {
    let n = 0
    for (const tile of tiles) if (this.entries.has(mapTileId(tile))) n++
    return n
  }

  clear(): void {
    if (!this.entries.size) return
    this.entries.clear()
    this.save()
  }

  /** One line per tile for a report to the producer, see `formatMissingReport`. */
  report(): string {
    return formatMissingReport(this.list())
  }

  private save(): void {
    if (!this.storage || this.saving) return
    // Many tiles are recorded in one burst; write once.
    this.saving = true
    queueMicrotask(() => {
      this.saving = false
      try {
        this.storage!.setItem(this.key, JSON.stringify(this.list()))
      } catch {
        /* Remembering is optional. */
      }
    })
  }
}
