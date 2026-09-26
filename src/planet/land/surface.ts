/**
 * OSM tags mapped onto a ground material.
 *
 * Priority is natural, then landuse, then leisure. Water wins over a tag that would
 * otherwise be grass. `SURFACE_LAYERS` is the nesting order shared by the editor and batches.
 * `mapSurfaceColor` rewrites old baked defaults at render time; an authored colour stays.
 */
export type SurfaceType =
  | 'grass'
  | 'forest'
  | 'farmland'
  | 'sand'
  | 'scrub'
  | 'water'
  | 'wetland'
  | 'rock'
  | 'residential'
  | 'industrial'
  | 'default'

/** Previous defaults, recognised so a saved zone can be recoloured without a rebuild. */
const LEGACY_SURFACE_COLORS: Record<SurfaceType, string> = {
  grass: '#7cb868',
  forest: '#4a8c3a',
  farmland: '#c5b87a',
  sand: '#e8dca8',
  scrub: '#8ba86a',
  water: '#4a90a8',
  wetland: '#6a9878',
  rock: '#9a9a8a',
  residential: '#d0c8b8',
  industrial: '#b8b0a0',
  default: '#7c927b',
}

export const SURFACE_COLORS: Record<SurfaceType, string> = {
  grass: '#416629',
  forest: '#234828',
  farmland: '#947133',
  sand: '#b79960',
  scrub: '#3d5e2e',
  water: '#102f43',
  wetland: '#315740',
  rock: '#787a6b',
  residential: '#8c8a86',
  industrial: '#929386',
  default: '#416629',
}

/** Update generated defaults at render time, including old baked/cached zones.
 * Authored colors remain authored data; no cache invalidation or geometry rebuild is needed. */
const retiredResidential = new Set(['#d0c8b8', '#c4b8a4', '#b0a28e'])

export function mapSurfaceColor(surface: SurfaceType, color: string): string {
  const hex = color.toLowerCase()
  return (surface === 'water' && hex === '#296b83') ||
    hex === LEGACY_SURFACE_COLORS[surface] ||
    (surface === 'residential' && retiredResidential.has(hex))
    ? SURFACE_COLORS[surface]
    : color
}

/** Classify OSM tags into a surface type. Priority: natural, then landuse, then leisure. */
export function classifySurface(tags: Record<string, string>): SurfaceType {
  const natural = tags.natural
  const landuse = tags.landuse
  const leisure = tags.leisure
  const water = tags.water
  const waterway = tags.waterway

  if (
    natural === 'water' ||
    water ||
    waterway === 'riverbank' ||
    waterway === 'dock' ||
    landuse === 'reservoir' ||
    landuse === 'basin'
  )
    return 'water'

  if (natural === 'beach' || natural === 'sand' || natural === 'dune') return 'sand'
  if (natural === 'wood' || natural === 'tree_row' || landuse === 'forest') return 'forest'
  if (natural === 'scrub' || natural === 'heath' || natural === 'grassland') return 'scrub'
  if (natural === 'wetland' || natural === 'marsh' || natural === 'swamp') return 'wetland'
  if (natural === 'bare_rock' || natural === 'scree' || natural === 'rock') return 'rock'
  if (natural === 'fell' || natural === 'tundra') return 'scrub'

  if (
    landuse === 'grass' ||
    landuse === 'meadow' ||
    landuse === 'village_green' ||
    landuse === 'recreation_ground'
  )
    return 'grass'
  if (
    landuse === 'farmland' ||
    landuse === 'farm' ||
    landuse === 'orchard' ||
    landuse === 'vineyard' ||
    landuse === 'plant_nursery' ||
    landuse === 'allotments'
  )
    return 'farmland'
  if (landuse === 'industrial' || landuse === 'commercial' || landuse === 'retail')
    return 'industrial'
  if (landuse === 'residential' || landuse === 'garages') return 'residential'
  if (landuse === 'cemetery' || landuse === 'religious') return 'grass'

  if (leisure === 'park' || leisure === 'garden' || leisure === 'common') return 'grass'
  if (
    leisure === 'pitch' ||
    leisure === 'sports_centre' ||
    leisure === 'stadium' ||
    leisure === 'golf_course'
  )
    return 'grass'
  if (leisure === 'nature_reserve') return 'forest'
  if (leisure === 'playground' || leisure === 'dog_park') return 'grass'
  if (leisure === 'swimming_pool') return 'water'
  if (leisure === 'beach_resort') return 'sand'

  return 'default'
}

/** A landcover polygon worth rendering. Boundaries and place nodes are metadata. */
export function isLandcoverFeature(tags: Record<string, string>): boolean {
  const surface = classifySurface(tags)
  if (surface === 'default') return false
  if (tags.boundary) return false
  if (tags.place) return false
  return true
}

/** Water with animated normals. A centerline river is not an area. */
export function isWaterFeature(tags: Record<string, string>): boolean {
  return classifySurface(tags) === 'water'
}

/** River or stream drawn as a ribbon when no area polygon exists. */
export function isWaterwayCenterline(tags: Record<string, string>): boolean {
  const waterway = tags.waterway
  return waterway === 'river' || waterway === 'stream'
}

/** OSM `width` when it parses, otherwise 15 m for a river and 3 m for a stream. Capped at 100 m. */
export function getWaterwayWidth(tags: Record<string, string>): number {
  const widthTag = tags.width
  if (widthTag) {
    const parsed = parseFloat(widthTag)
    if (Number.isFinite(parsed) && parsed > 0) return Math.min(parsed, 100)
  }
  if (tags.waterway === 'river') return 15
  if (tags.waterway === 'stream') return 3
  return 5
}

/** Stable precedence for nested OSM surfaces, shared by editor and batches. */
export const SURFACE_LAYERS: Record<SurfaceType, number> = {
  default: 1,
  residential: 2,
  industrial: 3,
  farmland: 4,
  forest: 5,
  scrub: 6,
  wetland: 7,
  rock: 8,
  sand: 9,
  grass: 10,
  water: 11,
}
