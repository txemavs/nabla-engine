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

export { createCarrierPortals, createPortalPair, portalMapping, portalCrossing } from './portal.js'
