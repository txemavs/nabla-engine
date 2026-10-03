/**
 * Static tile provider: fetches tiles via GET requests to pre-built manifest.json files.
 * Suitable for deployment on static hosts (S3, nginx) where POST /prepare/tiles is unavailable.
 *
 * Directory structure expected:
 *   {baseUrl}/z/{zoom}/{x}/{y}/manifest.json
 *   {baseUrl}/z/{zoom}/{x}/{y}/{terrain-file}.glb
 *   {baseUrl}/z/{zoom}/{x}/{y}/{buildings-file}.glb
 */

import {
  validatePlanetManifest,
  PLANET_GEOMETRY_REVISION,
  type PlanetManifest,
} from '../../planet/contract.js'
import { mapTileId, mapTilePath, type MapTile } from '../../scene/mercator.js'

export interface StaticTileProviderOptions {
  baseUrl: string
  signal?: AbortSignal
  cors?: boolean
}

export interface StaticTileResult {
  manifest: PlanetManifest
  available: boolean
}

/**
 * Fetch manifest.json for a single tile via GET request.
 * Returns undefined if the tile is not available (404).
 */
export async function fetchTileManifest(
  tile: MapTile,
  options: StaticTileProviderOptions,
): Promise<PlanetManifest | undefined> {
  const { baseUrl, signal, cors = true } = options
  const path = mapTilePath(tile)
  const url = `${baseUrl.replace(/\/$/, '')}/${path}/manifest.json`

  const fetchOptions: RequestInit = {
    method: 'GET',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  }
  if (cors) {
    fetchOptions.mode = 'cors'
  }

  try {
    const response = await fetch(url, fetchOptions)
    if (!response.ok) {
      if (response.status === 404) return undefined
      throw new Error(`HTTP ${response.status}`)
    }
    const data = await response.json()
    return validatePlanetManifest(data, tile)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    return undefined
  }
}

/**
 * Batch fetch manifests for multiple tiles.
 * Returns a map of tile IDs to manifests (only includes available tiles).
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
  return `${baseUrl.replace(/\/$/, '')}/${path}/${manifest.files[layer].path}`
}

/**
 * Verify a fetched GLB's SHA256 hash matches the manifest.
 */
export async function verifyGlbHash(bytes: ArrayBuffer, expectedHash: string): Promise<boolean> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return hashHex === expectedHash
}
