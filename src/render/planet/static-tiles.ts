/**
 * Static tile provider: fetches tiles via GET requests to pre-built manifest.json files.
 * Suitable for deployment on static hosts (S3, nginx) where POST /prepare/tiles is unavailable.
 *
 * Directory structure expected (baseUrl does NOT include the trailing `/z`; `mapTilePath` adds `z/{zoom}/{x}/{y}`):
 *   {baseUrl}/z/{zoom}/{x}/{y}/manifest.json
 *   {baseUrl}/z/{zoom}/{x}/{y}/{terrain-file}.glb
 *   {baseUrl}/z/{zoom}/{x}/{y}/{buildings-file}.glb
 *
 * Example: baseUrl `https://atlas.chained.world/euskadi` gives
 *   https://atlas.chained.world/euskadi/z/15/16224/11998/manifest.json
 *
 * GLB integrity (size and SHA-256 from the manifest) is verified by the planet worker when it loads the files.
 * The page must be served over HTTPS (or localhost): the worker's `crypto.subtle` and Cache API need a secure
 * context, and an HTTPS page cannot load tiles from an `http:` host (mixed content).
 *
 * Robust loading: tiles are fetched independently so one failure does not block others. SPA fallback
 * responses (HTML 200) and access-denied (403) are treated as "absent" rather than errors, since these
 * are common responses for tiles outside the published set. True errors retry with exponential backoff
 * up to a cap, then the tile is marked permanently failed for the session.
 */

import {
  validatePlanetManifest,
  PLANET_GEOMETRY_REVISION,
  type PlanetManifest,
} from '../../planet/contract.js'
import { mapTileId, mapTilePath, type MapTile } from '../../scene/mercator.js'

/** The default tile host: the published Euskadi tile set. */
export const DEFAULT_TILES_BASE_URL = 'https://atlas.chained.world/euskadi'

export interface StaticTileProviderOptions {
  baseUrl: string
  signal?: AbortSignal
  cors?: boolean
  /** Protocol of the embedding page, for the mixed-content check. Defaults to `location.protocol`. */
  pageProtocol?: string
}

export interface StaticTileResult {
  manifest: PlanetManifest
  available: boolean
}

export type StaticTileErrorKind = 'http' | 'network' | 'timeout' | 'invalid' | 'insecure' | 'absent'

/** A manifest request that failed for a reason worth showing to the user (never a plain "not found"). */
export class StaticTileError extends Error {
  constructor(
    message: string,
    readonly kind: StaticTileErrorKind,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'StaticTileError'
  }
}

/**
 * Tile loading state: tracks whether a tile is absent (confirmed not published),
 * failed (errored after max retries), or still pending retry.
 */
export type TileLoadState = 'absent' | 'failed' | 'pending'

/**
 * Tracks tile loading failures across the session. Once a tile is marked absent or failed,
 * it will not be re-requested. Tiles with transient errors get retry attempts with backoff.
 */
export class TileLoadTracker {
  private absent = new Set<string>()
  private failed = new Map<string, string>()
  private retries = new Map<string, { count: number; nextAttempt: number }>()
  private readonly maxRetries: number
  private readonly baseDelayMs: number

  constructor(maxRetries = 3, baseDelayMs = 1000) {
    this.maxRetries = maxRetries
    this.baseDelayMs = baseDelayMs
  }

  /** Mark a tile as permanently absent (404 or SPA fallback). */
  markAbsent(tileId: string): void {
    this.absent.add(tileId)
    this.retries.delete(tileId)
  }

  /** Mark a tile as permanently failed after exhausting retries. */
  markFailed(tileId: string, reason: string): void {
    this.failed.set(tileId, reason)
    this.retries.delete(tileId)
  }

  /** Record a transient failure; returns true if more retries allowed. */
  recordRetry(tileId: string): boolean {
    const info = this.retries.get(tileId) ?? { count: 0, nextAttempt: 0 }
    info.count++
    if (info.count >= this.maxRetries) {
      return false
    }
    info.nextAttempt = Date.now() + this.baseDelayMs * 2 ** info.count
    this.retries.set(tileId, info)
    return true
  }

  /** Check if a tile should be requested now. */
  shouldRequest(tileId: string): boolean {
    if (this.absent.has(tileId) || this.failed.has(tileId)) return false
    const info = this.retries.get(tileId)
    if (!info) return true
    return Date.now() >= info.nextAttempt
  }

  /** Get the state of a tile. */
  getState(tileId: string): TileLoadState | undefined {
    if (this.absent.has(tileId)) return 'absent'
    if (this.failed.has(tileId)) return 'failed'
    if (this.retries.has(tileId)) return 'pending'
    return undefined
  }

  /** Get all absent tile IDs. */
  getAbsent(): string[] {
    return [...this.absent]
  }

  /** Get all failed tile IDs with their reasons. */
  getFailed(): Map<string, string> {
    return new Map(this.failed)
  }

  /** Clear tracking for a specific tile (e.g., for testing). */
  clear(tileId?: string): void {
    if (tileId) {
      this.absent.delete(tileId)
      this.failed.delete(tileId)
      this.retries.delete(tileId)
    } else {
      this.absent.clear()
      this.failed.clear()
      this.retries.clear()
    }
  }
}

/** Trim the base URL and drop trailing slashes. */
export function normalizeTilesBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

export function tileManifestUrl(tile: MapTile, baseUrl: string): string {
  return `${normalizeTilesBase(baseUrl)}/${mapTilePath(tile)}/manifest.json`
}

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/

/**
 * An `https:` page cannot fetch from an `http:` tile host (browsers block mixed content, and the failure shows up as a
 * bare network error). Local development hosts are allowed. Relative URLs inherit the page protocol.
 */
export function assertSecureTileBase(baseUrl: string, pageProtocol: string | undefined): void {
  if (pageProtocol !== 'https:') return
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    return
  }
  if (parsed.protocol === 'http:' && !LOCAL_HOST.test(parsed.hostname))
    throw new StaticTileError(
      `Tile host ${parsed.origin} uses http: but this page is https:; the browser blocks it. Serve the tiles over HTTPS.`,
      'insecure',
      baseUrl,
    )
}

function describeHttp(status: number): string {
  if (status === 403)
    return 'HTTP 403 (access denied; S3/CloudFront also answer 403 for a tile that is not uploaded yet)'
  if (status >= 500) return `HTTP ${status} (tile host error)`
  return `HTTP ${status}`
}

/**
 * Check if a response looks like an SPA fallback (dev server returning HTML for any path).
 * This happens when Vite or similar dev servers with SPA fallback answer 200 with text/html
 * for paths that don't exist, instead of 404.
 */
function isSpaFallbackResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type') ?? ''
  return response.status === 200 && contentType.includes('text/html')
}

/**
 * Check if a fetch error is likely caused by a missing CORS header on an error response.
 * S3/CloudFront often return 403 without CORS headers for missing keys, which shows up as
 * a network/CORS error rather than an HTTP 403 when fetched from a different origin.
 */
function isLikelyCorsOnErrorResponse(error: Error): boolean {
  const msg = error.message.toLowerCase()
  return msg.includes('failed to fetch') || msg.includes('cors') || msg.includes('network')
}

/**
 * Fetch manifest.json for a single tile via GET request.
 * Returns undefined if the tile is not published (404). Every other failure throws a StaticTileError (or the caller's
 * AbortError) whose message names the URL and the real cause: HTTP status, network/CORS, timeout, or an invalid manifest.
 */
export async function fetchTileManifest(
  tile: MapTile,
  options: StaticTileProviderOptions,
): Promise<PlanetManifest | undefined> {
  const { baseUrl, signal, cors = true } = options
  const url = tileManifestUrl(tile, baseUrl)
  assertSecureTileBase(
    url,
    options.pageProtocol ?? (typeof location !== 'undefined' ? location.protocol : undefined),
  )

  const timeout = AbortSignal.timeout(15000)
  const fetchOptions: RequestInit = {
    method: 'GET',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }
  if (cors) {
    fetchOptions.mode = 'cors'
  }

  let response: Response
  try {
    response = await fetch(url, fetchOptions)
  } catch (error) {
    if (signal?.aborted) throw error
    if (timeout.aborted || (error instanceof Error && error.name === 'TimeoutError'))
      throw new StaticTileError(`Manifest ${url}: timed out after 15 s`, 'timeout', url)
    throw new StaticTileError(
      `Manifest ${url}: network or CORS error (${error instanceof Error ? error.message : String(error)}). ` +
        'Check that the host is reachable over HTTPS and sends Access-Control-Allow-Origin for this page.',
      'network',
      url,
    )
  }
  if (response.status === 404) return undefined
  if (isSpaFallbackResponse(response)) {
    return undefined
  }
  if (!response.ok)
    throw new StaticTileError(
      `Manifest ${url}: ${describeHttp(response.status)}`,
      'http',
      url,
      response.status,
    )
  let data: unknown
  try {
    data = await response.json()
  } catch {
    const type = response.headers.get('content-type') ?? 'unknown content type'
    if (type.includes('text/html')) {
      return undefined
    }
    throw new StaticTileError(`Manifest ${url}: not valid JSON (${type})`, 'invalid', url)
  }
  try {
    return validatePlanetManifest(data, tile)
  } catch (error) {
    throw new StaticTileError(
      `Manifest ${url}: invalid manifest (${error instanceof Error ? error.message : String(error)})`,
      'invalid',
      url,
    )
  }
}

/**
 * Batch fetch manifests for multiple tiles.
 * Returns a map of tile IDs to manifests (only includes available tiles). A tile that fails for any reason other than
 * 404 rejects the whole call with that tile's error; use `fetchTileManifest` per tile to keep going.
 * @deprecated Use fetchTileManifestsRobust for production use to avoid one failure blocking all tiles.
 */
export async function fetchTileManifests(
  tiles: MapTile[],
  options: StaticTileProviderOptions,
): Promise<Map<string, PlanetManifest>> {
  const results = new Map<string, PlanetManifest>()
  const fetches = tiles.map(async (tile) => {
    const manifest = await fetchTileManifest(tile, options)
    if (manifest) {
      results.set(mapTileId(tile), manifest)
    }
  })
  await Promise.all(fetches)
  return results
}

/** Result of fetching a single tile manifest. */
export interface TileFetchResult {
  tileId: string
  manifest?: PlanetManifest
  absent?: boolean
  error?: StaticTileError
}

/** Summary of a robust batch fetch operation. */
export interface BatchFetchResult {
  manifests: Map<string, PlanetManifest>
  absent: string[]
  failed: Map<string, string>
  newlyFailed: string[]
}

/**
 * Fetch manifests for multiple tiles independently, with retry tracking.
 * Each tile is fetched independently so one failure does not block others.
 * - 404 and SPA fallback (HTML 200) responses mark a tile as absent (not retried)
 * - 403 and CORS errors on 403 mark a tile as absent (common for S3 missing keys)
 * - Network errors and timeouts are retried up to the tracker's limit
 * - After max retries, the tile is marked permanently failed
 *
 * Returns manifests for available tiles plus lists of absent/failed tiles.
 */
export async function fetchTileManifestsRobust(
  tiles: MapTile[],
  options: StaticTileProviderOptions,
  tracker: TileLoadTracker,
): Promise<BatchFetchResult> {
  const manifests = new Map<string, PlanetManifest>()
  const newlyFailed: string[] = []

  const fetchOne = async (tile: MapTile): Promise<void> => {
    const tileId = mapTileId(tile)
    if (!tracker.shouldRequest(tileId)) return

    try {
      const manifest = await fetchTileManifest(tile, options)
      if (manifest) {
        manifests.set(tileId, manifest)
      } else {
        tracker.markAbsent(tileId)
      }
    } catch (error) {
      if (options.signal?.aborted) return

      const tileError =
        error instanceof StaticTileError ? error : new StaticTileError(String(error), 'network', '')

      if (tileError.status === 403 || isLikelyCorsOnErrorResponse(tileError)) {
        tracker.markAbsent(tileId)
        return
      }

      const hasMoreRetries = tracker.recordRetry(tileId)
      if (!hasMoreRetries) {
        tracker.markFailed(tileId, tileError.message)
        newlyFailed.push(tileId)
      }
    }
  }

  await Promise.all(tiles.map(fetchOne))

  return {
    manifests,
    absent: tracker.getAbsent(),
    failed: tracker.getFailed(),
    newlyFailed,
  }
}

/** Log a summary of absent/failed tiles (called once when loading completes). */
export function logTileLoadSummary(
  loaded: number,
  absent: string[],
  failed: Map<string, string>,
): void {
  if (absent.length === 0 && failed.size === 0) return

  const parts: string[] = [`Tile loading complete: ${loaded} loaded`]
  if (absent.length > 0) {
    parts.push(`${absent.length} absent (not published)`)
  }
  if (failed.size > 0) {
    parts.push(`${failed.size} failed`)
  }
  console.log(parts.join(', '))

  if (absent.length > 0 && absent.length <= 10) {
    console.log('  Absent tiles:', absent.join(', '))
  } else if (absent.length > 10) {
    console.log(`  Absent tiles: ${absent.slice(0, 10).join(', ')} and ${absent.length - 10} more`)
  }

  if (failed.size > 0) {
    console.log('  Failed tiles:')
    for (const [id, reason] of failed) {
      console.log(`    ${id}: ${reason}`)
    }
  }
}

/**
 * Check if a manifest is current (has the expected geometry revision).
 */
export function isManifestCurrent(manifest: PlanetManifest): boolean {
  return manifest.geometryRevision === PLANET_GEOMETRY_REVISION
}

/**
 * Build the URL for a tile's GLB file.
 */
export function tileGlbUrl(
  baseUrl: string,
  tile: MapTile,
  layer: 'terrain' | 'buildings-osm',
  manifest: PlanetManifest,
): string {
  const path = mapTilePath(tile)
  return `${normalizeTilesBase(baseUrl)}/${path}/${manifest.files[layer].path}`
}
