import { mapTileId, type MapTile } from '../../scene/mercator.js'

export interface TileAvailabilityIndex {
  revision: string
  zooms: Set<number>
  tiles: Map<string, MapTile>
}

/** Reject the entire index on malformed data: a partial parse could hide valid terrain. */
export function parseTileAvailability(value: unknown): TileAvailabilityIndex {
  const data = value as Record<string, unknown> | null
  if (
    !data ||
    data.schema !== 'nabla-tile-availability/1' ||
    data.complete !== true ||
    typeof data.revision !== 'string' ||
    !data.revision.trim() ||
    !data.zooms ||
    typeof data.zooms !== 'object' ||
    Array.isArray(data.zooms)
  )
    throw new Error('Invalid tile availability index')
  const zooms = new Set<number>()
  const tiles = new Map<string, MapTile>()
  for (const [key, rows] of Object.entries(data.zooms)) {
    const z = Number(key)
    if (!Number.isInteger(z) || z < 0 || z > 30 || String(z) !== key || !Array.isArray(rows))
      throw new Error('Invalid availability zoom')
    zooms.add(z)
    for (const row of rows) {
      if (
        !Array.isArray(row) ||
        row.length !== 2 ||
        row.some((v) => !Number.isInteger(v) || v < 0 || v >= 2 ** z)
      )
        throw new Error('Invalid availability cell')
      const tile = { z, x: row[0], y: row[1] }
      tiles.set(mapTileId(tile), tile)
    }
  }
  return { revision: data.revision, zooms, tiles }
}

/** Optional, per-source discovery. Missing/invalid indices preserve legacy manifest probing. */
export class TileAvailability {
  private index?: TileAvailabilityIndex
  private next = 0
  private pending?: Promise<void>

  constructor(
    private base: string,
    private signal: AbortSignal,
    private published: (tile: MapTile) => void,
  ) {}

  /** Undefined means unknown (no valid index, or a zoom outside its scope). */
  has(tile: MapTile): boolean | undefined {
    if (!this.index?.zooms.has(tile.z)) return undefined
    return this.index.tiles.has(mapTileId(tile))
  }

  poll(): Promise<void> {
    if (this.pending) return this.pending
    if (this.signal.aborted || Date.now() < this.next) return Promise.resolve()
    this.next = Date.now() + 60_000
    this.pending = this.refresh().finally(() => {
      this.pending = undefined
    })
    return this.pending
  }

  private async refresh(): Promise<void> {
    try {
      const response = await fetch(this.base.replace(/\/$/, '') + '/index.json', {
        signal: AbortSignal.any([this.signal, AbortSignal.timeout(5000)]),
        cache: 'no-cache',
      })
      if (!response.ok) return
      const next = parseTileAvailability(await response.json())
      if (this.signal.aborted) return
      const previous = this.index
      this.index = next
      for (const [id, tile] of next.tiles) {
        if (!previous?.tiles.has(id)) this.published(tile)
      }
    } catch {
      // Keep the last valid snapshot in this session; without one, use the legacy path.
    }
  }
}
