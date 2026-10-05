export { RetractableMount } from './retractable.js'
export {
  quadGeometry,
  surfaceMatrix,
  type InstrumentMounts,
  type SurfaceQuad,
  type Point3,
} from './mounts.js'
export type {
  BeaconEquipment,
  VehicleEquipment,
  VehiclePresentationAdapter,
  VehiclePresentationResolver,
} from './adapter.js'
export { CarInstruments } from '../entity/car-instruments.js'
export { CarLights, type CarLampState, type LampBinding } from '../entity/car-lights.js'
export {
  VehicleLightController,
  type VehicleLampState,
  type VehicleLightChannel,
} from './light-controller.js'
export { VehicleLightRig, vehicleLightBudget } from './light-rig.js'
export {
  CarMirrors,
  authoredMirrorSurfaces,
  fitMirrorCamera,
  raisedMirrorNormal,
  type MirrorPolicy,
} from '../entity/car-mirrors.js'
export {
  driverHeadPose,
  overheadDrivingPose,
  overheadDrivingHeight,
  followDrivingHeading,
  DrivingTelemetry,
} from '../entity/driving-camera.js'
export type {
  CarInstrumentDefinition,
  CarInstrumentTelemetry,
} from '../entity/car-instrument-definition.js'
export { authoredMirrorLenses } from './mirror-lenses.js'
export {
  poseSteeringWheel,
  steeringAxis,
  steeringWheelAngle,
  steeringFullLockSteer,
  steeringWheelLock,
} from '../entity/steering-wheel.js'
