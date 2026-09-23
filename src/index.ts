export { parseScene, createEntity, rotationDegrees, toDegrees, SceneGraph } from './scene.js'
export type { Entity, SceneDocument, Transform, Vec3Tuple, QuatTuple } from './scene.js'
export { SceneEditor } from './editor.js'
export { Simulation, FIXED_STEP, idleInput } from './simulation.js'
export type { PlayerInput, PlayerSnapshot } from './simulation.js'
export { createSampleScene } from './sample.js'

export { vehicleDefinition } from './vehicle.js'
export { createA3, createCarrier } from './presets.js'
export type { VehicleDefinition, VisualDefinition } from './scene.js'

export { EARTH_RADIUS, MADRID, geoToLocal, localToGeo, type GeoPoint } from './geography.js'

export {
  createCarrierPortals,
  createPortal,
  createPortalPair,
  portalMapping,
  portalCrossing,
} from './portal.js'

export { boxSolid, extrudeElement, extrudeFace, removeVertex, validateSolid } from './solid.js'
export type { SolidGeometry } from './solid.js'

export { createRealWorld, IRUN_VENTAS } from './real-world.js'
export type { WorldExtract, MapFeature } from './real-world.js'
export { terrainHeight, terrainVertices, terrainIndices } from './terrain.js'
export type { TerrainData } from './terrain.js'
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
} from './draped-road.js'
export type { RoadElevation, RoadGeometryOptions, RoadCollider } from './draped-road.js'

export { WorldStream, wantedWorldTiles, worldTileAt, WORLD_TILE_SIZE } from './world-stream.js'
export type { WorldStreamHost } from './world-stream.js'

export { entityCapabilities, type EntityCapability } from './capabilities.js'
export { entityCatalog, createCatalogEntities, type CatalogId } from './catalog.js'

export {
  classifySurface,
  isLandcoverFeature,
  isWaterFeature,
  isWaterwayCenterline,
  getWaterwayWidth,
  SURFACE_COLORS,
  type SurfaceType,
} from './landcover.js'

export {
  assembleMultipolygonRings,
  pointInPolygon,
  associateHoles,
  type WayGeometry,
  type AssembledRing,
  type AssemblyResult,
} from './multipolygon.js'

export { toWorldPose, fromWorldPose, worldPoseGeography, reframeVector } from './world-pose.js'
export type { WorldPose } from './world-pose.js'

export { PLANET_GRID_VERSION, planetCellAt, planetCellBounds } from './planet-grid.js'

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
} from './map-tiles.js'

export { mapTilePath, parseMapTilePath, mapTileFilename, mapTileSample } from './map-tiles.js'
