export { RetractableMount } from './retractable.js'
export { LandingGearVisual, mountLandingGear, landingGearMeshBounds } from './landing-gear.js'
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
  clampMirrorAdjustment,
  clampMirrorAngle,
  defaultMirrorCapture,
  fitMirrorCamera,
  mirrorAngleCentred,
  mirrorAngleRange,
  mirrorModelKey,
  mirrorPolicyForQuality,
  mirrorSideOf,
  raisedMirrorNormal,
  resolveMirrorCapture,
  type MirrorAdjustment,
  type MirrorAngle,
  type MirrorCapturePolicy,
  type MirrorPolicy,
} from '../entity/car-mirrors.js'
export {
  driverHeadPose,
  overheadDrivingPose,
  overheadDrivingHeight,
  overheadFootHeight,
  followDrivingHeading,
  DrivingTelemetry,
  GroundHeading,
  CriticalFollow,
  criticalStep,
  headingDirection,
} from '../entity/driving-camera.js'
export {
  advanceCinematicAngle,
  cinematicOrbitPose,
  cinematicOrbitRadius,
  type CinematicOrbitInput,
} from '../entity/cinematic-camera.js'
export type {
  CarInstrumentDefinition,
  CarInstrumentTelemetry,
} from '../entity/car-instrument-definition.js'
export { authoredMirrorLenses } from './mirror-lenses.js'
export {
  clampSteeringWheelOffset,
  poseSteeringWheel,
  steeringAxis,
  steeringPivot,
  steeringWheelAngle,
  steeringWheelCentred,
  steeringFullLockSteer,
  steeringWheelLock,
  steeringWheelOffsetPosition,
  steeringWheelOffsetRange,
  type SteeringWheelOffset,
} from '../entity/steering-wheel.js'
