export { parseScene, createEntity, rotationDegrees, toDegrees, SceneGraph } from './stage/scene.js'
export type { Entity, SceneDocument, Transform, Vec3Tuple, QuatTuple } from './stage/scene.js'
export { SceneEditor } from './stage/editor.js'
export { Simulation, FIXED_STEP, idleInput } from './simulation/simulation.js'
export { initPhysics } from './simulation/physics.js'
export type { PlayerInput, PlayerSnapshot } from './simulation/simulation.js'
export { createSampleScene } from './stage/sample.js'

export { vehicleDefinition } from './entity/vehicle/vehicle.js'
export { createA3 } from './catalog/a3.js'
export { createCarrier } from './catalog/carrier.js'
export type { VehicleDefinition, VisualDefinition } from './stage/scene.js'

export { EARTH_RADIUS, MADRID, geoToLocal, localToGeo, type GeoPoint } from './math/geo/sphere.js'

export {
  createCarrierPortals,
  createPortal,
  createPortalPair,
  portalMapping,
  portalCrossing,
} from './entity/portal/portal.js'

export { boxSolid, extrudeElement, extrudeFace, removeVertex, validateSolid } from './math/solid/mesh.js'
export type { SolidGeometry } from './math/solid/mesh.js'

export { createRealWorld } from './planet/assemble/world.js'
export { IRUN_VENTAS } from './planet/extract/contract.js'
export type { WorldExtract, MapFeature } from './planet/extract/contract.js'
export { terrainHeight, terrainVertices, terrainIndices } from './planet/land/terrain.js'
export type { TerrainData } from './planet/land/terrain.js'
export {
  roadGeometry,
  smoothFloatRoadGeometry,
  SMOOTH_FLOAT_MIN_OFFSET,
  SMOOTH_FLOAT_WINDOW,
  type RoadMode,
  roadHeightOffset,
  roadColliders,
  nearestRoadCenterline,
  LAYER_HEIGHT,
} from './planet/land/roads/draped-road.js'
export type { RoadElevation, RoadGeometryOptions, RoadCollider } from './planet/land/roads/draped-road.js'

export { entityCapabilities, type EntityCapability } from './entity/capability.js'
export { entityCatalog, createCatalogEntities, type CatalogId } from './stage/catalog.js'

export {
  classifySurface,
  isLandcoverFeature,
  isWaterFeature,
  isWaterwayCenterline,
  getWaterwayWidth,
  SURFACE_COLORS,
  type SurfaceType,
} from './planet/land/surface.js'

export { clipSegment, pointInPolygon } from './math/planar/polygon.js'
export {
  assembleMultipolygonRings,
  associateHoles,
  type WayGeometry,
  type AssembledRing,
  type AssemblyResult,
} from './planet/extract/multipolygon.js'

export { toWorldPose, fromWorldPose, worldPoseGeography, reframeVector } from './math/geo/pose.js'
export type { WorldPose } from './math/geo/pose.js'

export {
  MAP_TILE_MATRIX,
  MAP_ZOOMS,
  MERCATOR_LIMIT,
  mapTileAt,
  mapTileBounds,
  mapTileId,
  parseMapTileId,
  mapTileParent,
  mapTileChildren,
  mapTileGroundWidth,
  planMapZooms,
  readyMapCover,
  type MapTile,
  type MapZoomPlan,
} from './scene/mercator.js'

export { mapTilePath, parseMapTilePath, mapTileFilename, mapTileSample } from './scene/mercator.js'
