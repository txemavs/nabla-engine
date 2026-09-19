/**
 * @nabla/engine — Reusable 3D mini-engine for Nabla apps.
 *
 * Ported from Agency (txemavs/agency-ui main) stage modules.
 * This is a PORT, not a rewrite.
 *
 * @packageDocumentation
 */

// GL math primitives
export {
  type Vec2,
  type Vec3,
  cssToGl,
  scaleViewTranslation,
  lookAt,
  perspective,
  frustum,
  mul4,
  invert4,
  transformPoint,
  rayQuadHit,
  hitTri,
} from './gl/glMath.js'

// GLB parser
export {
  type GlbWrap,
  type GlbAlbedo,
  type GlbAlpha,
  type GlbPrimitive,
  type LampMode,
  type RoomMeshPose,
  isPaintMaterial,
  isBrakeLightMaterial,
  isHeadCMaterial,
  isTailPMaterial,
  BRAKE_LIGHT_PAINT,
  BRAKE_LIGHT_GLOW,
  HEAD_C_PAINT,
  HEAD_C_GLOW,
  TAIL_P_PAINT,
  TAIL_P_GLOW,
  primGlow,
  primPaint,
  xformPoint,
  nodeMatrix,
  computeVertexNormals,
  GLB_BOX_UV_PER_M,
  boxProjectUv,
  decodeGlbAlbedo,
  parseGlb,
  poseRotation,
  metersYupModel,
  poseNormalMat,
} from './gl/glbMesh.js'

// GL camera
export {
  type StageOrbit as GlStageOrbit,
  type SkyboxFaceId,
  isSkyboxFace,
  orbitEye,
  orbitEyeAt,
  orbitRay,
  IDENTITY_STAGE_ORBIT as GL_IDENTITY_STAGE_ORBIT,
  STAGE_ORBIT_DIST_MIN,
  STAGE_ORBIT_DIST_MAX,
  STAGE_ORBIT_PITCH_MIN,
  STAGE_ORBIT_PITCH_MAX,
  STAGE_ORBIT_WHEEL,
  STAGE_ORBIT_LOOK,
  clampStageOrbit as clampGlStageOrbit,
  dollyOrbit,
  orbitLookDelta,
} from './gl/glCamera.js'

// World units
export {
  PX_PER_MM,
  MM_PER_M,
  entityYawDeg,
  altitudeY,
  HOME_SHIP_KEY,
  DESKTOP_KEY,
  MONITOR_MAIN_KEY,
  SCREEN_BASE_MM,
  metresToCssMm,
  CONSOLE_GAP_MM,
  CONSOLE_DEPTH_MM,
  CONSOLE_TOP_MM,
  CONSOLE_Z,
  CONSOLE_RX,
  DECK_HEIGHT_MM,
  DECK_Y,
  SCREEN_BASE_Y,
  NOMINAL_VIEWPORT_H,
  defaultEyeY,
  type EntityPose,
  IDENTITY_ENTITY,
  TABLE_ENTITY,
  entityTransform,
} from './world.js'

// Pose types and camera
export {
  type Pose,
  type DesktopProjection,
  type StageMode,
  type StageOrbit,
  type StageCamera,
  type StageScreens,
  IDENTITY_POSE,
  parsePose,
  isIdentityPose,
  parseStageMode,
  IDENTITY_STAGE_ORBIT,
  STAGE_PERSPECTIVE,
  stageFovY,
  STAGE_WALK_SPEED,
  STAGE_WALK_SPRINT,
  STAGE_WALK_ACCEL,
  STAGE_WALK_DECEL,
  STAGE_WALK_SPRINT_MAG,
  STAGE_WALK_LOOK_MS,
  STAGE_LOOK_SENS,
  STAGE_STICK_DEAD,
  STAGE_STICK_RANGE,
  STAGE_TOUCH_WALK_SPLIT,
  STAGE_LOOK_ARROW,
  STAGE_LOOK_STICK,
  STAGE_CAMERA_RX_MAX,
  STAGE_CAMERA_RY_MAX,
  STAGE_CAMERA_Y_MIN,
  STAGE_CAMERA_Y_MAX,
  STAGE_HEAD_WHEEL,
  STAGE_EDGE_ZOOM_DEFAULT,
  STAGE_EDGE_ZOOM_MAX,
  STAGE_EDGE_ZOOM_PER_PX,
  clampStageCamera,
  parseStageCamera,
  isIdentityCamera,
  stageViewOrigin,
  stageViewTransform,
  SCREEN_X_STEP,
  IDENTITY_STAGE_SCREENS,
  parseScreenX,
  parseStageScreens,
  isIdentityScreens,
  stageScreenOrigin,
  stageScreenTransform,
  walkLookEngaged,
  stageLookDelta,
  stageArrowLookDelta,
  stageStickVector,
  stageWalkDelta,
  approachVel2,
  stageStickLookDelta,
  IDENTITY_STAGE_CAMERA,
} from './pose.js'

// Tune
export {
  type AgencyTune,
  TUNE_DEFAULTS,
  mergeTune,
  tune,
  resetTuneCache,
} from './tune.js'

// Kind types
export {
  type StageMeshRef,
  type StageImageRef,
} from './kind/types.js'

// Kind capability
export {
  CAPABILITY_DRIVE,
  CAPABILITY_FLY,
  CAPABILITY_PORTAL,
  CAPABILITY_SIT,
  CAPABILITY_SENSE,
  CAPABILITY_INFER,
  KIND_CAPABILITIES,
  type KindCapability,
  ADAPTER_NONE,
  ADAPTER_CANNON,
  ADAPTER_ISAAC,
  ADAPTER_ONNX,
  type KindContract,
  normalizeNames,
  hasCapability,
  kindPadWindow,
  isHullClass,
  kindMatchingMesh,
} from './kind/kindCapability.js'

// Entity AABB
export {
  type Aabb3,
  type EntityFace,
  ENTITY_FACES,
  isEntityFace,
  rememberEntityAabb,
  rememberedAabb,
  aabbFaceCorners,
  posedFaceCorners,
  aabbOpeningCorners,
  posedOpeningCorners,
  aabbFaceCenter,
  aabbFaceInYaw,
  primsAabbM,
  invertAffine,
  rayHitsAabb,
  rayHitsPosedAabb,
  aabbWireLines,
  poseOriginLines,
} from './kind/entityAabb.js'

// Kind props
export {
  HULL_FACES,
  type HullFace,
  BOX_FACES,
  type BoxFace,
  type InteriorKind,
  type BoxSize,
  CONTAINER_SIZE,
  type BoxSkin,
  ZERO_SKIN,
  hasLiner,
  clampSkin,
  innerBoxSize,
  innerBoxAabb,
  type BoxFaceSpec,
  type BoxPlane,
  type KindProps,
  layoutBoxFaces,
  CONTAINER_BOX_DEFAULTS,
  sizeFromFaceAxis,
  isBoxLayoutKey,
  boxLayoutDraft,
  BOX_FACE_LABELS,
  usesContainerBox,
  parseImageRef,
  imageRefToWire,
  isAtlasRef,
  parseMetres,
  skinMetresToMmLabel,
  skinMmInputToMetres,
  mergeKindProps,
  boxFaceSize,
} from './kind/kindProps.js'

// Vehicle spec
export {
  type VehicleSpec,
  DEFAULT_VEHICLE_SPEC,
  FACTORY_VEHICLE_SPEC,
  CONTAINER_SPEC,
  parseVehicleSpec,
  vehicleSpecBounds,
} from './vehicle/vehicleSpec.js'

// Vehicle definition
export {
  type VehicleVec3,
  type VehicleGear,
  type VehicleDefinition,
  type VehicleTune,
  type VehicleInput,
  type VehicleSnapshot,
  type VehicleWheelId,
  type VehicleWheelDebug,
  type VehicleDebugFrame,
  WHEEL_IDS,
  ANTI_ROLL_NM,
  ANTI_ROLL_BAR_N_PER_M,
  RECOVER_LIFT_M,
  ROLLOVER_ROLL_DEG,
  ROLLOVER_UP_DOT,
  ROLLOVER_HOLD_FRAMES,
  BRAKE_TO_REVERSE_MPS,
  HANDBRAKE_FRONT,
  HANDBRAKE_REAR,
  TURBO_HP,
  TURBO_FORCE_N,
  TURBO_WOT,
  TURBO_MIN_SPEED_MPS,
  DRIFT_REAR_GRIP,
  REMOUNT_MAX_SPEED,
  COLLIDER_CLEARANCE_M,
  STEP,
  MAX_SUB,
  specToDefinition,
  specToTune,
  chassisInertia,
  definitionNeedsRemount,
  emptySnapshot,
  emptyDebugFrame,
  A3_DEFINITION,
  A3_TUNE,
} from './vehicle/vehicleDef.js'

// Vehicle debug
export {
  type DebugLine,
  cross,
  debugLinesFromFrame,
} from './vehicle/vehicleDebug.js'

// Car pack
export {
  type CarPackMounts,
  type CarPackHubs,
  type CarPackWheelPositions,
  type CarPackAssets,
  type CarPack,
  matchesCarPack,
} from './vehicle/carPack.js'

// Obstacle kit
export {
  type StaticBox,
  type StaticObstacle,
  type DrivePose as ObstacleDrivePose,
  type ObstacleQuad,
  type ParkedCarBox,
  demoObstacles,
  obstaclesToBoxes,
  obstacleDebugLines,
  garageBoxDebugLines,
  obstacleQuads,
  parkedCarCollider,
} from './vehicle/obstacleKit.js'

// Vehicle control
export {
  resolveGear,
  brakesLit,
  type ControlForces,
  controlForces,
  applyAntiRoll,
  applyAntiRollBar,
  chassisUpDot,
  isInverted,
  RolloverWatch,
  type VehicleControls,
  applyVehicleInput,
} from './vehicle/vehicleControl.js'

// Avatar / Walk body
export {
  WALK_GRAVITY,
  WALK_JUMP_VY,
  WALK_MAX_VY,
  WALK_COYOTE_S,
  WALK_JUMP_BUFFER_S,
  WALK_GROUND_SLACK,
  WALK_SPEED,
  WALK_SPRINT_MULT,
  WALK_ACCEL,
  WALK_DECEL,
  WALK_EYE_HEIGHT_MM,
  WALK_BODY_HEIGHT_MM,
  WALK_BODY_RADIUS_MM,
  ROCKET_ESCAPE_S,
  ROCKET_HOVER,
  ROCKET_ESCAPE_THRUST,
  ROCKET_COOL_S,
  ROCKET_Y_MAX_M,
  WALK_CHASE_BACK_MM,
  WALK_CHASE_LIFT_MM,
  type WalkView,
  WALK_VIEWS,
  nextWalkView,
  rocketBurnStep,
  rocketThrust,
  rocketGravity,
  rocketAccel,
  walkGrounded,
  type WalkCamera,
  walkChaseCamera,
  approachVelocity,
} from './avatar/walkBody.js'

// Avatar controller
export {
  type AvatarMode,
  type AvatarInput,
  type AvatarState,
  createAvatarState,
  emptyAvatarInput,
  LOOK_SENS,
  PITCH_MIN,
  PITCH_MAX,
  stepAvatar,
  avatarCamera,
  avatarBodyPose,
  cycleAvatarView,
  setAvatarDriving,
  teleportAvatar,
} from './avatar/avatarController.js'

// Vehicle simulation
export {
  COLLISION_GROUP_GROUND,
  COLLISION_GROUP_CHASSIS,
  COLLISION_GROUP_STATIC,
  COLLISION_MASK_CHASSIS,
  COLLISION_MASK_STATIC,
  COLLISION_MASK_GROUND,
  type VehicleSimOptions,
  VehicleSim,
} from './vehicle/vehicleSim.js'

// Vehicle world (facade)
export {
  type DriveInput,
  type VehiclePose,
  VehicleWorld,
  createVehicleWorld,
} from './vehicle/vehicleWorld.js'

// Drive (enter/exit, camera)
export {
  DRIVE_NEAR_M,
  DRIVE_CABIN_Y_M,
  DRIVE_CHASE_BACK_M,
  DRIVE_CHASE_UP_M,
  DRIVE_FAR_BACK_M,
  DRIVE_FAR_UP_M,
  DRIVE_TOP_H_M,
  DRIVE_TOP_H_MIN,
  DRIVE_TOP_H_MAX,
  DRIVE_TOP_WHEEL,
  DRIVE_TOP_MOUSE_CLIMB,
  DRIVE_TOP_TILT_MAX,
  DRIVE_TOP_TILT_SENS,
  DRIVE_TOP_NADIR_DEG,
  DRIVE_LOOK_SENS,
  DRIVE_PITCH_MIN,
  DRIVE_PITCH_MAX,
  type DriveView,
  DRIVE_VIEWS,
  type DriveInput as DriveInputContract,
  type DriveState,
  type DriveLook,
  type DriveCamera,
  identityDriveLook,
  driveLookDelta,
  driveLookDolly,
  nextDriveView,
  resetDriveLook,
  driveForward,
  driveRight,
  driveLookYaw,
  driveChaseFocus,
  drivePilotEye,
  driveCamera,
  driveExitPosition,
  driveMoving,
  type DriveableEntity,
  nearestDriveable,
} from './vehicle/drive.js'

// ─────────────────────────────────────────────────────────────────────────────
// PACKS — publishable vehicle/entity modules
// ─────────────────────────────────────────────────────────────────────────────

// Boxcar pack
export {
  BOXCAR_ENTITY_PREFIX,
  BOXCAR_ID,
  BOXCAR_SIZE,
  BOXCAR_WHEELBASE,
  BOXCAR_TRACK_FRONT,
  BOXCAR_TRACK_REAR,
  BOXCAR_WHEEL_RADIUS,
  BOXCAR_HUB_Y,
  BOXCAR_EYE_1P,
  BOXCAR_AVATAR_MOUNT,
  BOXCAR_FOCUS_HEIGHT,
  BOXCAR_MOUNTS,
  BOXCAR_HUBS,
  BOXCAR_ASSETS,
  boxcarWheelPositions,
  BOXCAR_PACK,
  BOXCAR_SPEC,
  matchesBoxcarPack,
} from './packs/boxcar/index.js'

// Ship 5×10 pack
export {
  type ShipPackGarage,
  type ShipPack,
  SHIP_ENTITY_PREFIX,
  SHIP_ID,
  SHIP_SIZE,
  SHIP_EYE_1P,
  SHIP_AVATAR_MOUNT,
  SHIP_FOCUS_HEIGHT,
  SHIP_MOUNTS,
  SHIP_GARAGE,
  SHIP_5X10_PACK,
  shipGarageBoxes,
  SHIP_5X10_SPEC,
  matchesShipPack,
} from './packs/ship5x10/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2: Dual-world rendering + Portals
// ─────────────────────────────────────────────────────────────────────────────

// Room skin (phi-net layout)
export {
  PHI,
  SKIN_H,
  SKIN_W,
  SKIN_D,
  type SkinFace,
  type SkinRect,
  roomSkinRects,
  roomSkinSize,
  roomSkinFaceCss,
  ROOM_SKIN_TURN,
  roomSkinTurn,
  ROOM_SKIN_AXES,
} from './skin/roomSkin.js'

// Room paint / OfficeWorld
export {
  type RoomPaintRgb,
  type RoomGround,
  type RoomEntity,
  type RoomPaint,
  type OfficeWorld,
  GROUND_AREA_M2,
  GROUND_SIDE_MM,
  GROUND_HEIGHT_MM,
  GROUND_ART_CX,
  GROUND_ART_CY,
  GROUND_CENTER_X_MM,
  GROUND_CENTER_Z_MM,
  HELM_PAINT,
  parseRoomPaint,
  deriveOffice,
  clonePaint,
  groundWorldMm,
} from './office/roomPaint.js'

// Office CSS transforms
export {
  roomHalfPx,
  officeFloorTransform,
  officeCeilTransform,
  officeLeftWallTransform,
  officeRightWallTransform,
  officeBackWallTransform,
  officeSkyTransform,
  officeDeckTransform,
  HELM_WALL_MARGIN_MM,
  HELM_FLOOR_MARGIN_MM,
  HELM_CEIL_MARGIN_MM,
  helmInside,
  WALK_MARGIN_MM,
  clampRoomWalk,
  officeAabbMm,
} from './office/officeTransforms.js'

// Helm screen layout
export {
  type HelmScreen,
  parseHelmScreen,
  adjacentHelmScreen,
  hopHelmScreen,
  allHelmScreens,
  helmScreenIndex,
  helmScreenAt,
} from './office/helmScreen.js'

// Interior (dual-render model)
export {
  type InteriorRender,
  type Interior,
  HOME_INTERIOR_AABB,
  homeInterior,
  interiorForHost,
  interiorContainsCamera,
} from './interior/interior.js'

// Portal: HomeCarrier
export {
  type HomeCarrier,
  IDENTITY_CARRIER,
  isIdentityCarrier,
  composeAnchoredPose,
  inverseRideHomeCarrier,
  rideHomeCarrier,
  ridesHomeCarrier,
  meshRidesHomeCarrier,
  rideMeshPose,
  rideCssMm,
  rideGlMm,
  rideCamera,
  inverseRideCamera,
} from './portal/homeCarrier.js'

// Portal: graph
export {
  type PortalArriveKind,
  type PortalToward,
  type EntityPortal,
  type PortalPose,
  type LivePortal,
  type PortalHost,
  type PortalLane,
  type PortalSide,
  type BoxFace as PortalBoxFace,
  type PortalArrive,
  SHIP_PORTAL_OPEN_W_M,
  SHIP_PORTAL_OPEN_H_M,
  CONTAINER_MESH_AABB,
  SHIP_HULL_AABB,
  portalLocal,
  portalCrossing,
  approachCamera,
  enterNaveCamera,
  enterHostCamera,
  insideCamera,
  portalPoseOnFace,
  outsidePose,
  parseEntityPortals,
  portalIdOn,
  portalBoxFaces,
  portalShortName,
  portalCaption,
  mapThroughPortals,
} from './portal/portalGraph.js'

// Portal: wormhole
export {
  WORMHOLE_OPEN_W_M,
  WORMHOLE_OPEN_H_M,
  WORMHOLE_BAR_M,
  WORMHOLE_EXIT_M,
  WORMHOLE_KIND_NS,
  type WormholePose,
  type WormholeMouth,
  type WormholeHost,
  type WormholeTransit,
  isWormholeId,
  isWormholeHost,
  wormholeShortName,
  wormholeFaceCaption,
  wormholeBackCaption,
  wrapHeading,
  wormholeCrossing,
  wormholeTransit,
  wormholeArrive,
  listWormholes,
} from './portal/wormhole.js'

// Portal: projection (CAVE frustum)
export {
  type PortalViewProj,
  portalEyeCss,
  portWindowCss,
  portalViewProjParts,
  portalViewProj,
} from './portal/portalProj.js'
