import { adaptAtlasZ16, ATLAS_Z16_SCHEMA } from '../../planet/atlas-z16.js'
/**
 * Static tile provider: fetches tiles via GET requests to pre-built manifest.json files.
 * Suitable for deployment on static hosts (S3, nginx) where POST /prepare/tiles is unavailable.
 *
 * Directory structure expected (baseUrl does NOT include the trailing `/z`; `mapTilePath` adds `z/{zoom}/{x}/{y}`):
 *   {baseUrl}/z/{zoom}/{x}/{y}/manifest.json
 *   {baseUrl}/z/{zoom}/{x}/{y}/{terrain-file}.glb
 *   {baseUrl}/z/{zoom}/{x}/{y}/{buildings-file}.glb
 *   {baseUrl}/z/{zoom}/{x}/{y}/{asphalt|supports|road-collision-…}.glb   optional candidate roads
 *
 * Example: baseUrl `https://tiles.example.org/world` gives
 *   https://tiles.example.org/world/z/15/16224/11998/manifest.json
 *
 * GLB integrity (size and SHA-256 from the manifest) is verified by the planet worker when it loads the files.
 * HTTPS uses native Web Crypto; HTTP LAN workers use the portable SHA-256 verifier.
 * An HTTPS page still cannot load tiles from an `http:` host (mixed content).
 */

import {
  validatePlanetManifest,
  PLANET_GEOMETRY_REVISION,
  type PlanetManifest,
} from '../../planet/contract.js'
import { mapTileId, mapTilePath, type MapTile } from '../../scene/mercator.js'
import {
  adaptAtlasManifest,
  atlasPackageRef,
  atlasPackageUrl,
  type AtlasZ15Options,
} from '../../planet/atlas-z15.js'
import {
  AtlasPackageFailure,
  mainThreadAtlasPackageLoader,
  type AtlasPackageLoader,
} from './atlas-package-loader.js'

export interface StaticTileProviderOptions {
  /** Application-owned tile origin. Use `/` (or normalized empty string) for this origin. */
  baseUrl: string
  /** Exact pinned publication from the development registry. */
  publication?: { manifestUrl: string; revision: string }
  signal?: AbortSignal
  cors?: boolean
  /** Protocol of the embedding page, for the mixed-content check. Defaults to `location.protocol`. */
  pageProtocol?: string
  /**
   * Read `nabla-z15-package/1` cells published by nabla-atlas: when a manifest points to a package
   * the package is fetched (size and SHA-256 verified) and its LiDAR/orthophoto choices are
   * applied to the returned manifest. Plain engine manifests are returned unchanged.
   */
  atlas?: AtlasZ15Options
  /**
   * HTTP statuses that mean "this tile is not published" and return undefined instead of throwing.
   * Default `[404]`; S3-style hosts answer 403 for an object that is not uploaded.
   */
  missingStatuses?: readonly number[]
  /** Called with the status when a tile is reported missing. */
  onMissing?: (status: number) => void
  /**
   * Manifest file names tried in order per cell, e.g. `['manifest.compressed.json', 'manifest.json']`
   * for a test set published next to the production manifests; a missing one moves to the next.
   * Default `['manifest.json']`. Ignored for a pinned `publication`.
   */
  manifestFiles?: readonly string[]
  /** Where Atlas packages are fetched and verified. Default: on the main thread. */
  packageLoader?: AtlasPackageLoader
}

export interface StaticTileResult {
  manifest: PlanetManifest
  available: boolean
}

export type StaticTileErrorKind = 'http' | 'network' | 'timeout' | 'invalid' | 'insecure'

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

/** Trim the base URL and drop trailing slashes. */
export function normalizeTilesBase(baseUrl: string): string {
  if (typeof baseUrl !== 'string')
    throw new Error(
      'Terrain source missing: provide an explicit tile baseUrl; use / for this origin.',
    )
  return baseUrl.trim().replace(/\/+$/, '')
}

export function tileManifestUrl(tile: MapTile, baseUrl: string, file = 'manifest.json'): string {
  return `${normalizeTilesBase(baseUrl)}/${mapTilePath(tile)}/${file}`
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
 * Fetch manifest.json for a single tile via GET request.
 * Returns undefined if the tile is not published (404, or the statuses in `missingStatuses`). Every other failure throws a StaticTileError (or the caller's
 * AbortError) whose message names the URL and the real cause: HTTP status, network/CORS, timeout, or an invalid manifest.
 */
export async function fetchTileManifest(
  tile: MapTile,
  options: StaticTileProviderOptions,
): Promise<PlanetManifest | undefined> {
  if (options.publication) return fetchOneManifest(tile, options, options.publication.manifestUrl)
  const [last, ...earlier] = [...(options.manifestFiles ?? ['manifest.json'])].reverse()
  for (const file of earlier.reverse()) {
    let missing = false
    const url = tileManifestUrl(tile, options.baseUrl, file)
    const manifest = await fetchOneManifest(
      tile,
      { ...options, onMissing: () => (missing = true) },
      url,
    )
    if (!missing) return manifest
  }
  return fetchOneManifest(tile, options, tileManifestUrl(tile, options.baseUrl, last))
}

/** One manifest request: undefined when missing, a StaticTileError for every other failure. */
async function fetchOneManifest(
  tile: MapTile,
  options: StaticTileProviderOptions,
  url: string,
): Promise<PlanetManifest | undefined> {
  const { baseUrl, signal, cors = true } = options
  assertSecureTileBase(
    url,
    options.pageProtocol ?? (typeof location !== 'undefined' ? location.protocol : undefined),
  )

  const timeout = AbortSignal.timeout(15000)
  const fetchOptions: RequestInit = {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
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
  if (!response.ok && (options.missingStatuses ?? [404]).includes(response.status)) {
    options.onMissing?.(response.status)
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
    throw new StaticTileError(`Manifest ${url}: not valid JSON (${type})`, 'invalid', url)
  }
  let manifest: PlanetManifest
  try {
    manifest =
      (data as { schema?: string })?.schema === ATLAS_Z16_SCHEMA
        ? adaptAtlasZ16(data, tile, baseUrl)
        : validatePlanetManifest(data, tile)
  } catch (error) {
    throw new StaticTileError(
      `Manifest ${url}: invalid manifest (${error instanceof Error ? error.message : String(error)})`,
      'invalid',
      url,
    )
  }
  if (options.publication && manifest.atlasZ16?.revision !== options.publication.revision)
    throw new StaticTileError('Pinned Z16 revision mismatch', 'invalid', url)
  return options.atlas && manifest.z15Package
    ? adaptWithAtlasPackage(tile, manifest, options, url)
    : manifest
}

/** Fetch, verify and apply the Atlas package a manifest points to. Every failure names the URL. */
async function adaptWithAtlasPackage(
  tile: MapTile,
  manifest: PlanetManifest,
  options: StaticTileProviderOptions,
  manifestUrl: string,
): Promise<PlanetManifest> {
  const fail = (message: string, kind: StaticTileErrorKind, url: string, status?: number) =>
    new StaticTileError(`Atlas package ${url}: ${message}`, kind, url, status)
  let url = manifestUrl
  try {
    const ref = atlasPackageRef(manifest)!
    url = atlasPackageUrl(options.baseUrl, tile, ref)
    const loader = options.packageLoader ?? mainThreadAtlasPackageLoader
    const pkg = await loader.load(
      { url, tile, bytes: ref.bytes, sha256: ref.sha256, cors: options.cors },
      options.signal,
    )
    return adaptAtlasManifest(manifest, pkg, options.atlas)
  } catch (error) {
    if (error instanceof StaticTileError || options.signal?.aborted) throw error
    if (error instanceof AtlasPackageFailure && error.kind === 'http')
      throw fail(describeHttp(error.status!), 'http', url, error.status)
    throw fail(error instanceof Error ? error.message : String(error), 'invalid', url)
  }
}

/**
 * Batch fetch manifests for multiple tiles.
 * Returns a map of tile IDs to manifests (only includes available tiles). A tile that fails for any reason other than
 * 404 rejects the whole call with that tile's error; use `fetchTileManifest` per tile to keep going.
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
  return (
    manifest.files[layer].url ??
    `${normalizeTilesBase(baseUrl)}/${path}/${manifest.files[layer].path}`
  )
}
