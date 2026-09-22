import type { WorldExtract } from '../src/real-world.js'
import type { GeoPoint } from '../src/geography.js'

export function validBakedExtract(
  value: unknown,
  origin: GeoPoint,
  key: string,
): value is WorldExtract {
  if (!value || typeof value !== 'object') return false
  const d = value as WorldExtract
  return (
    d.source?.baked === true &&
    d.source.bakeVersion === 2 &&
    d.source.tileKey === key &&
    Math.abs(d.origin?.latitude - origin.latitude) < 0.00001 &&
    Math.abs(d.origin?.longitude - origin.longitude) < 0.00001 &&
    Number.isFinite(d.origin?.altitude) &&
    d.terrain?.columns === 121 &&
    d.terrain.rows === 121 &&
    d.terrain.spacing === 10 &&
    Array.isArray(d.terrain.heights) &&
    d.terrain.heights.length === 14641 &&
    d.terrain.heights.every(Number.isFinite) &&
    Array.isArray(d.features) &&
    d.features.every(
      (f) =>
        typeof f.id === 'string' &&
        f.tags &&
        typeof f.tags === 'object' &&
        Array.isArray(f.rings) &&
        f.rings.every(
          (r) =>
            typeof r.role === 'string' &&
            Array.isArray(r.coordinates) &&
            r.coordinates.every(
              (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite),
            ),
        ),
    )
  )
}

/** Revalidate even a warm browser cache so newly published bakes become visible. */
export async function revalidateBaked(
  base: string,
  origin: GeoPoint,
  key: string,
  signal: AbortSignal,
  cached: WorldExtract | undefined,
  etag: string | undefined,
  heights: () => Promise<number[]>,
): Promise<{ extract: WorldExtract | undefined; etag?: string; changed: boolean }> {
  try {
    const response = await fetch(
      `${base}/baked/${origin.latitude.toFixed(5)}/${origin.longitude.toFixed(5)}/${key}`,
      {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        headers: cached && etag ? { 'If-None-Match': etag } : {},
        cache: 'no-cache',
      },
    )
    if (response.status === 304 && cached) return { extract: cached, etag, changed: false }
    if (response.ok) {
      const baked: unknown = await response.json()
      if (validBakedExtract(baked, origin, key)) {
        const terrainHeights = await heights()
        return {
          extract: { ...baked, origin, terrain: { ...baked.terrain, heights: terrainHeights } },
          etag: response.headers.get('etag') ?? undefined,
          changed: true,
        }
      }
    }
  } catch {
    signal.throwIfAborted()
    // A cached extract remains usable while offline; never cache failed revalidation.
  }
  return { extract: cached, etag, changed: false }
}
