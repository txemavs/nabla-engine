/**
 * Surface types derived from OSM landuse/natural/leisure tags.
 * Used to select surface materials.
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

/** Base colors for each surface type (hex strings). */
export const SURFACE_COLORS: Record<SurfaceType, string> = {
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

/**
 * Classify OSM tags into a surface type.
 * Priority: natural > landuse > leisure > amenity.
 */
export function classifySurface(tags: Record<string, string>): SurfaceType {
  const natural = tags.natural
  const landuse = tags.landuse
  const leisure = tags.leisure
  const water = tags.water
  const waterway = tags.waterway

  // Water features
  if (
    natural === 'water' ||
    water ||
    waterway === 'riverbank' ||
    waterway === 'dock' ||
    landuse === 'reservoir' ||
    landuse === 'basin'
  )
    return 'water'

  // Natural features
  if (natural === 'beach' || natural === 'sand' || natural === 'dune') return 'sand'
  if (natural === 'wood' || natural === 'tree_row' || landuse === 'forest') return 'forest'
  if (natural === 'scrub' || natural === 'heath' || natural === 'grassland') return 'scrub'
  if (natural === 'wetland' || natural === 'marsh' || natural === 'swamp') return 'wetland'
  if (natural === 'bare_rock' || natural === 'scree' || natural === 'rock') return 'rock'
  if (natural === 'fell' || natural === 'tundra') return 'scrub'

  // Landuse features
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

  // Leisure features (parks, sports)
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

/**
 * Check if a set of tags represents a landcover feature worth rendering.
 */
export function isLandcoverFeature(tags: Record<string, string>): boolean {
  const surface = classifySurface(tags)
  if (surface === 'default') return false

  // Skip features that are just metadata or boundaries
  if (tags.boundary) return false
  if (tags.place) return false

  return true
}

/**
 * Check if a feature should be rendered as water with animated normals.
 */
export function isWaterFeature(tags: Record<string, string>): boolean {
  return classifySurface(tags) === 'water'
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
