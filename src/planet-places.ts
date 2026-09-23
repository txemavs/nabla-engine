import { planetTileFrame, type PlanetTileSource } from './planet-tile.js'
import type { Vec3Tuple } from './scene.js'
export interface PlanetPlace {
  id: string
  text: string
  category: 'city' | 'town' | 'village'
  position: Vec3Tuple
}
/** Small label metadata stays independent of the expensive GLB geometry. */
export function planetPlaces(source: PlanetTileSource): PlanetPlace[] {
  const frame = planetTileFrame(source.tile)
  const { segments, heights } = source.elevation
  const result: PlanetPlace[] = []
  const seen = new Set<string>()
  for (const f of source.features) {
    const category = f.tags.place
    const coordinate = f.rings[0]?.coordinates[0]
    if (
      !['city', 'town', 'village'].includes(category) ||
      !f.tags.name ||
      !coordinate ||
      seen.has(f.id)
    )
      continue
    const p = frame.project(coordinate)
    const u = p[0] / frame.width + 0.5,
      v = p[2] / frame.width + 0.5
    // Half-open ownership avoids labels repeated on neighboring tiles.
    if (u < 0 || u >= 1 || v < 0 || v >= 1) continue
    const x = u * segments,
      y = v * segments,
      ix = Math.floor(x),
      iy = Math.floor(y)
    const fx = x - ix,
      fy = y - iy
    const h = (dx: number, dy: number) => heights[(iy + dy) * (segments + 1) + ix + dx]
    p[1] =
      (1 - fx) * (1 - fy) * h(0, 0) +
      fx * (1 - fy) * h(1, 0) +
      (1 - fx) * fy * h(0, 1) +
      fx * fy * h(1, 1) +
      20
    seen.add(f.id)
    result.push({
      id: f.id,
      text: f.tags.name.slice(0, 100),
      category: category as PlanetPlace['category'],
      position: frame.local(p),
    })
  }
  return result
}
export function validPlanetPlaces(value: unknown): PlanetPlace[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (p): p is PlanetPlace =>
        !!p &&
        typeof p.id === 'string' &&
        typeof p.text === 'string' &&
        p.text.length > 0 &&
        p.text.length <= 100 &&
        ['city', 'town', 'village'].includes(p.category) &&
        Array.isArray(p.position) &&
        p.position.length === 3 &&
        p.position.every(Number.isFinite),
    )
    .slice(0, 512)
}
