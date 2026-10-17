import { mapTileId, type MapTile } from '../../scene/mercator.js'

export interface Z16Publication {
  tile: MapTile
  revision: string
  manifestUrl: string
}

/** Keep absolute publisher paths inside the configured origin or same-origin proxy prefix. */
export function readZ16Snapshot(value: unknown, base: string): Map<string, Z16Publication> {
  const snapshot = value as { schema?: string; cells?: unknown[] }
  if (snapshot?.schema !== 'atlas-z16-updates/1' || !Array.isArray(snapshot.cells))
    throw new Error('Invalid Z16 updates snapshot')
  if (snapshot.cells.length > 100000) throw new Error('Z16 updates snapshot too large')
  const result = new Map<string, Z16Publication>()
  for (const raw of snapshot.cells) {
    const row = raw as { tile?: number[]; revision?: string; manifest?: string }
    if (
      !Array.isArray(row.tile) ||
      row.tile.length !== 3 ||
      row.tile[0] !== 16 ||
      !row.tile.slice(1).every((n) => Number.isInteger(n) && n >= 0 && n < 65536) ||
      typeof row.revision !== 'string' ||
      !/^[a-zA-Z0-9-]{1,128}$/.test(row.revision)
    )
      throw new Error('Invalid Z16 publication identity')
    const tile = { z: 16, x: row.tile[1], y: row.tile[2] }
    const path = `/z/16/${tile.x}/${tile.y}/manifest.json?revision=${encodeURIComponent(row.revision)}`
    if (row.manifest !== path) throw new Error('Invalid pinned Z16 manifest URL')
    const key = mapTileId(tile)
    if (result.has(key)) throw new Error('Duplicate Z16 publication')
    result.set(key, { tile, revision: row.revision, manifestUrl: base.replace(/\/+$/, '') + path })
  }
  return result
}

/** Conditional, non-overlapping development polls; errors never discard the last snapshot. */
export class Z16Updates {
  entries = new Map<string, Z16Publication>()
  etag: string | undefined
  lastError: string | undefined
  private busy = false
  private next = 0
  private failures = 0
  constructor(
    private base: string,
    private signal: AbortSignal,
    private changed: () => void,
  ) {}
  get(tile: MapTile): Z16Publication | undefined {
    return this.entries.get(mapTileId(tile))
  }
  async poll(now = Date.now()): Promise<void> {
    if (this.busy || this.signal.aborted || now < this.next) return
    this.busy = true
    try {
      const response = await fetch(this.base.replace(/\/+$/, '') + '/z/16/updates.json', {
        credentials: 'omit',
        cache: 'no-cache',
        headers: this.etag ? { 'If-None-Match': this.etag } : {},
        signal: AbortSignal.any([this.signal, AbortSignal.timeout(15000)]),
      })
      if (response.status !== 304) {
        if (!response.ok) throw new Error(`Z16 updates HTTP ${response.status}`)
        const entries = readZ16Snapshot(await response.json(), this.base)
        this.entries = entries
        this.etag = response.headers.get('ETag') ?? undefined
        this.changed()
      }
      this.failures = 0
      this.lastError = undefined
      this.next = Date.now() + 15000
    } catch (error) {
      if (!this.signal.aborted) this.lastError = String(error)
      this.next = Date.now() + Math.min(120000, 15000 * 2 ** this.failures++)
    } finally {
      this.busy = false
    }
  }
}
