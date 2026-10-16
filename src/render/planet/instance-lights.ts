import { localToGeo, type GeoPoint } from '../../math/geo/sphere.js'
import { atlasFileUrl } from '../../planet/atlas-z15.js'
import { fetchTileManifest, type StaticTileProviderOptions } from './static-tiles.js'
import { loadAtlasInstances } from './instances.js'
import type { FieldLightMark, FieldLightSource } from '../entity/field-lights.js'

/** Positions and identities come from the same Atlas publication as the driven terrain. */
export function atlasLightMarks(value: unknown, anchor: GeoPoint): FieldLightMark[] {
  const rows = (value as { instances?: unknown[] } | null)?.instances
  if (!Array.isArray(rows)) throw new Error('Invalid Atlas instances')
  return rows.slice(0, 20000).flatMap((raw) => {
    const row = raw as { type?: string; local?: unknown[]; osmTags?: Record<string, unknown> }
    if (row?.type !== 'street_lamp' || !Array.isArray(row.local) || row.local.length !== 3)
      return []
    const [x, , z] = row.local
    if (
      typeof x !== 'number' ||
      typeof z !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(z)
    )
      return []
    const geo = localToGeo(anchor, [x, 0, z])
    const tags = Object.fromEntries(
      Object.entries(row.osmTags ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
    return [{ lat: geo.latitude, lon: geo.longitude, tags: { ...tags, highway: 'street_lamp' } }]
  })
}
export function atlasFieldLightSource(options: StaticTileProviderOptions): FieldLightSource {
  return async (tile, signal) => {
    const manifest = await fetchTileManifest(tile, { ...options, signal })
    if (!manifest?.instances) return []
    const json = await loadAtlasInstances(
      atlasFileUrl(options.baseUrl, tile, manifest.instances.path),
      manifest.instances,
      signal,
    )
    return atlasLightMarks(json, manifest.anchor)
  }
}
