export { parseScene } from './scene/document.js'
export type { SceneDocument } from './scene/document.js'
export { SceneGraph } from './scene/graph.js'
export { SceneEditor } from './scene/history.js'
export { createEntity, rotationDegrees, toDegrees } from './entity/schema.js'
export type { Entity, Transform, Vec3Tuple, QuatTuple } from './entity/schema.js'
export { Simulation, FIXED_STEP, idleInput } from './simulation/simulation.js'
export { initPhysics } from './simulation/physics.js'
export type { PlayerInput, PlayerSnapshot } from './simulation/simulation.js'
export { createSampleScene } from './scene/sample.js'

export { vehicleDefinition } from './entity/vehicle/vehicle.js'
export { createA3 } from './catalog/vehicles/a3.js'
export { createJeep } from './catalog/vehicles/jeep.js'
export { createOutboard } from './catalog/vehicles/boat.js'
export { createCarrier } from './catalog/vehicles/carrier.js'
export { createCessna } from './catalog/vehicles/cessna.js'
export type { VehicleDefinition, VisualDefinition } from './entity/schema.js'

export { EARTH_RADIUS, MADRID, geoToLocal, localToGeo, type GeoPoint } from './math/geo/sphere.js'

export {
  createCarrierPortal,
  createPortal,
  createPortalPair,
  portalMapping,
  portalCrossing,
} from './entity/portal/portal.js'

export {
  boxSolid,
  extrudeElement,
  extrudeFace,
  removeVertex,
  validateSolid,
} from './math/solid/mesh.js'
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
export type {
  RoadElevation,
  RoadGeometryOptions,
  RoadCollider,
} from './planet/land/roads/draped-road.js'

export { entityCapabilities, type EntityCapability } from './entity/capability.js'
export { entityCatalog, createCatalogEntities, type CatalogId } from './catalog/palette.js'

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

export { PlanetWorld } from './render/planet/world.js'
export { GeographicView } from './render/planet/sky.js'
export { SeaWater } from './render/planet/water.js'
export {
  SceneView,
  type SceneViewOptions,
  type CarInstrumentDefinition,
  type CarInstrumentTelemetry,
} from './presentation/scene-view.js'
export { ShadowManager } from './render/shadows.js'

export { OceanSheet } from './render/planet/ocean-sheet.js'
export { simplifiedTide } from './planet/tide.js'
export { DepthOfField } from './render/effects/depth-of-field.js'
export { PerformanceMonitor, type FrameSample } from './diagnostics/performance-monitor.js'
export { FlightAudio } from './audio/flight.js'

export { capturePng } from './render/capture.js'

export { createPoliceCar } from './catalog/vehicles/police.js'

export {
  HtmlMonitor,
  type MonitorData,
  type MonitorOptions,
} from './render/monitors/html-monitor.js'

export {
  LayeredMonitor,
  type MonitorDefinition,
  type MonitorLayer,
} from './render/monitors/layered-monitor.js'
export { MonitorMenu, type MonitorMenuItem, type MonitorAction } from './render/monitors/menu.js'
