/** Rendering services for editor and viewer hosts composing their own viewport. */
export { CatchFloor } from './planet/catch-floor.js'
export { seaSeenFromBelow } from './planet/ocean-sheet.js'
export { TileDebugView, type TileDebugMode } from './planet/debug.js'
export { setNavigationPlaces, setNavigationRoads } from './entity/navigation-places.js'
export { setPlanetCharts } from './entity/helm-map.js'
export { PlanetWorld, projectedLayers, projectGroundPhoto } from './planet/world.js'
export {
  ASPHALT_CONTRAST_DEFAULT,
  ASPHALT_CONTRAST_MAX,
  ASPHALT_CONTRAST_MIN,
  ASPHALT_CONTRAST_PIVOT,
  asphaltContrast,
  setAsphaltContrast,
} from './planet/ground-material.js'
export type { LoadDiagnostics, StreamError } from './planet/world.js'
export { portalEnvironment } from './portal/environment.js'
export { mapCacheStats, setMapCacheBudget, clearMapCache } from './planet/cache.js'
export { receiveMapGeometry, type PreparedMapGeometry } from './planet/geometry.js'
export { DrivingTelemetry } from './entity/driving-camera.js'
export { renderPortals, type ExternalPortalView } from './portal/portals.js'
export { WorldEnvironment, configureWorldRenderer } from './planet/world-environment.js'
export { tileAsset, restoreTileLayers, type TileArtifact } from './planet/tile-asset.js'
export {
  TILE_LAYERS,
  hiddenTileLayers,
  setHiddenTileLayers,
  tileMeshHidden,
  parseLayerSpec,
  formatLayerSpec,
  loadHiddenLayers,
  saveHiddenLayers,
  type TileLayer,
  type LayerStorage,
} from './planet/tile-layers.js'
