/**
 * Planet buildings, applied while a map tile is generated.
 *
 * `rings` turns raw outer and inner ways into polygons.
 * `footprints` cuts `building:part` detail out of the generic building outline.
 * `roofs` replaces the flat cap of a supported extrusion with the tagged shape.
 */
export { buildingRings } from './rings.js'
export { buildingFootprints } from './footprints.js'
export { buildingRoof, buildingRoofWithFaces, type RoofResult } from './roofs.js'
