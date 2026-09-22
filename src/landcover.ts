import type { Vec3Tuple } from './scene.js'

/**
 * Surface types derived from OSM landuse/natural/leisure tags.
 * Used to select materials and texture atlas regions.
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

/** Texture atlas UV regions [x, y, w, h] normalized 0-1. */
export const SURFACE_ATLAS_UVS: Record<SurfaceType, [number, number, number, number]> = {
  grass: [0, 0, 0.25, 0.5],
  forest: [0.25, 0, 0.25, 0.5],
  farmland: [0.5, 0, 0.25, 0.5],
  sand: [0.75, 0, 0.25, 0.5],
  scrub: [0, 0.5, 0.25, 0.5],
  water: [0.25, 0.5, 0.25, 0.5],
  wetland: [0.5, 0.5, 0.25, 0.5],
  rock: [0.75, 0.5, 0.25, 0.5],
  residential: [0, 0, 0.25, 0.5],
  industrial: [0.25, 0, 0.25, 0.5],
  default: [0, 0, 0.25, 0.5],
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
  if (leisure === 'swimming_pool' || leisure === 'marina') return 'water'
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

/** Landcover polygon ready for rendering. */
export interface LandcoverPolygon {
  surfaceType: SurfaceType
  rings: Vec3Tuple[][]
  centroid: [number, number]
}
