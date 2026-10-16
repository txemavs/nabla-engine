import { mapCache } from './cache.js'
import { sha256 } from '../../util/sha256.js'
import type { PlanetLayerFile } from '../../planet/contract.js'
import { Ray, Vector3 } from 'three'
import type { PlanetCollisionChunk, PlanetPayload } from '../../planet/contract.js'

/** Atlas sidecar trees use the same instanced renderer and collision poles as embedded trees. */
export function atlasTreeInstances(
  value: unknown,
  chunks: PlanetCollisionChunk[],
): PlanetPayload['vegetation'] {
  const rows = (value as { instances?: unknown[] } | null)?.instances
  if (!Array.isArray(rows)) throw new Error('Invalid Atlas instances')
  const result: PlanetPayload['vegetation'] = []
  const ray = new Ray(new Vector3(), new Vector3(0, -1, 0))
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3(),
    hit = new Vector3()
  for (const raw of rows.slice(0, 20000)) {
    const row = raw as {
      type?: string
      local?: unknown[]
      height?: number
      osmTags?: Record<string, string>
    }
    if (row?.type !== 'tree' || !Array.isArray(row.local) || row.local.length !== 3) continue
    const [x, , z] = row.local
    if (
      typeof x !== 'number' ||
      typeof z !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(z)
    )
      continue
    let y: number | undefined
    // Snap to loaded terrain, never to building roofs or a stale source elevation.
    for (const chunk of chunks) {
      const bounds = chunk.bounds
      if (chunk.buildings || x < bounds[0] || x > bounds[3] || z < bounds[2] || z > bounds[5])
        continue
      ray.origin.set(x, bounds[4] + 1, z)
      for (let i = 0; i < chunk.triangles.length; i += 9) {
        a.fromArray(chunk.triangles, i)
        b.fromArray(chunk.triangles, i + 3)
        c.fromArray(chunk.triangles, i + 6)
        if (ray.intersectTriangle(a, b, c, false, hit) && (y === undefined || hit.y > y)) y = hit.y
      }
    }
    if (y === undefined) continue
    const authored = row.height ?? Number.parseFloat(row.osmTags?.height ?? '')
    const height = Number.isFinite(authored) && authored > 0 && authored < 100 ? authored : 6
    result.push({ position: [x, y, z], size: [height, height] })
  }
  return result
}

/** Shared verified cache for the worker vegetation and geographic lamp presenter. */
export async function loadAtlasInstances(
  url: string,
  file: PlanetLayerFile,
  signal: AbortSignal,
): Promise<unknown> {
  if (file.bytes > 16 * 1024 * 1024) throw new Error('Atlas instances exceed size limit')
  const cache = mapCache('nabla-planet-instances-v1')
  const cached = await cache.match(url).catch(() => undefined)
  const response =
    cached ?? (await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }))
  if (!response.ok) throw new Error('Instances HTTP ' + response.status)
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength !== file.bytes || (await sha256(bytes)) !== file.sha256)
    throw new Error('Atlas instances checksum mismatch')
  signal.throwIfAborted()
  const value = JSON.parse(new TextDecoder().decode(bytes))
  await cache.put(url, new Response(bytes)).catch(() => {})
  return value
}
