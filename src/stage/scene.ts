/** Compatibility barrel. Import `scene/` and `entity/schema` in new code. */
export { SceneGraph } from '../scene/graph.js'
export { parseScene, replaceMapScene, updateSceneEntity } from '../scene/document.js'
export type { SceneDocument } from '../scene/document.js'
export { createEntity, isMapBuilding, rotationDegrees, toDegrees } from '../entity/schema.js'
export type {
  Entity,
  QuatTuple,
  Transform,
  Vec3Tuple,
  VehicleDefinition,
  VisualDefinition,
} from '../entity/schema.js'
