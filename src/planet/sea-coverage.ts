import { EARTH_RADIUS } from '../math/geo/sphere.js'
import { SURFACE_LAYERS } from './land/surface.js'
/** Keep the active ocean surface separate from published tile fill BEFORE rendering,
 * chart creation or collision extraction. Elevated inland water and negative measured
 * terrain remain. Near-zero water provides the current coastal mask.
 */
export function seaCoverageIndex(
  position: Float32Array,
  index: Uint32Array | undefined,
  metadata: { category?: string; groundLayer?: number; skirt?: unknown; marineFill?: boolean },
  anchorAltitude = 0,
): Uint32Array | undefined {
  const water = metadata.category === 'Surfaces' && metadata.groundLayer === SURFACE_LAYERS.water
  const terrain = metadata.category === 'Terrain' && metadata.marineFill === true && !metadata.skirt
  if (!water && !terrain) return index
  const tolerance = water ? 0.5 : 0.002
  const count = position.length / 3
  const sea = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    const altitude =
      Math.hypot(
        position[i * 3],
        position[i * 3 + 1] + EARTH_RADIUS + anchorAltitude,
        position[i * 3 + 2],
      ) - EARTH_RADIUS
    sea[i] = Number(Math.abs(altitude) <= tolerance)
  }
  const source = index ?? Uint32Array.from({ length: count }, (_, i) => i)
  const kept: number[] = []
  for (let i = 0; i < source.length; i += 3) {
    const a = source[i],
      b = source[i + 1],
      c = source[i + 2]
    if (sea[a] && sea[b] && sea[c]) continue
    kept.push(a, b, c)
  }
  return kept.length === source.length ? index : new Uint32Array(kept)
}
