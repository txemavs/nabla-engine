export { PlaySession, type PlayOptions, type SessionState } from './session.js'
export { GameRuntime } from './game.js'
export { playGroundClearance } from './placement.js'
export { FrameLoop } from './frame-loop.js'
export {
  AdaptiveResolutionScale,
  probeResolutionTier,
  qualityTierLabels,
  type AdaptiveResolutionOptions,
  type ResolutionProbeResult,
  type ResolutionScaleState,
} from './resolution-scale.js'
export {
  applySplashSkin,
  defaultNablaSplashSkin,
  injectSplashTheme,
  resolveSplashSkin,
  splashElements,
  splashMessageAt,
  type EngineSplashSkin,
  type SplashElements,
  type SplashLayout,
} from './splash.js'
export { createRuntimeText, type RuntimeText, type RuntimeLocale } from './messages.js'
export { GameHud, hudTelemetry, type GameHudState } from './hud.js'
export { WheelDebugOverlay, type WheelDebugData } from '../diagnostics/wheel-debug.js'
export { VehicleEffects } from './vehicle-effects.js'
export {
  createGameCameraState,
  cycleGameCamera,
  gameCameraView,
  isFirstPersonView,
  updateGameCamera,
  setGameCameraView,
  type GameCameraTransition,
  type GameCameraMode,
  type GameCameraState,
  type GameCameraView,
} from './game-camera.js'
export {
  START_CAMERA_HOLD_MS,
  StartCameraSequencer,
  resolveStartCameras,
  type ResolvedStartCamera,
  type StartCameraAction,
  type StartCameraName,
  type StartCameraSequence,
  type StartCameraStep,
} from './start-cameras.js'
export {
  GameInput,
  gamepadAxes,
  deadzone,
  availableGamepads,
  type GameInputSources,
} from './input.js'
export { waitForGround, GroundMissingError, type GroundProvider } from './ground.js'
export { warmGamePresentation, type PresentationWarmup } from './presentation-warmup.js'

export { VehicleMonitors } from './vehicle-monitors.js'
export { helmTouchAxis, type HelmTouchAxis } from './helm-touch.js'
export { vehicleMenuKey } from './vehicle-menu.js'
export {
  defaultSteeringWheelOffset,
  describeSteeringWheelOffset,
  formatSteeringWheelCm,
  initialSteeringWheelOffset,
  readSteeringWheelOffset,
  steeringWheelStorageKey,
  writeSteeringWheelOffset,
  type SteeringWheelSettings,
  type SteeringWheelStorage,
} from './steering-wheel-offsets.js'
export {
  defaultMirrorAdjustment,
  describeMirrorAdjustment,
  formatMirrorDegrees,
  initialMirrorAdjustment,
  mirrorStorageKey,
  readMirrorAdjustment,
  writeMirrorAdjustment,
  type MirrorSettings,
  type MirrorStorage,
} from './mirror-adjustment.js'
export {
  TouchDriving,
  isRoadTouchDriving,
  driveSliderThrottle,
  driveHandbrakePull,
  driveWheelSteer,
  drivePilotAngle,
  drivePilotSteer,
  type TouchDrivingActions,
  type TouchDrivingVisibility,
  type TouchDrivingVehicleSpec,
  type TouchDrivingInput,
} from './touch-driving.js'
export {
  registerControlProfile,
  unregisterControlProfile,
  hasControlProfile,
  controlProfile,
  controlProfiles,
  inferControlProfileId,
  resolveControlProfile,
  controlSurfaces,
  touchRigState,
  type BuiltInControlProfileId,
  type ControlProfile,
  type ControlProfileContext,
  type ControlProfileVehicle,
  type ControlSurfaces,
  type ControlTouchRig,
  type TouchRigState,
} from './control-profiles.js'
export {
  TouchFlight,
  flightFromMode2,
  type TouchFlightActions,
  type TouchFlightVisibility,
  type TouchFlightInput,
} from './touch-flight.js'
export { GameplayStreaming, type GameplayWorldStream } from './streaming.js'
export { Sidearm } from './sidearm.js'
export { Gallery, shotView } from './gallery.js'
export { fireSidearm } from './shooting.js'
export { createGallery } from '../examples/gallery.js'
export {
  placeables,
  placeable,
  hasPlaceable,
  createPlaceable,
  createPlaceablePortal,
  createPlaceableSprite,
  createPlaceableGallery,
  type PlaceableEntry,
  type PlaceableId,
} from '../catalog/placeables.js'
export { GameRenderPipeline, type GameRenderFrame } from './render-pipeline.js'
export {
  normalizePerformance,
  performanceDefaults,
  performancePresets,
  performanceProfile,
  streamBudget,
  tileBudget,
  shadowTiers,
  shadowBiasRange,
  normalizeShadowBias,
  type ShadowTier,
  type PerformanceSettings,
} from './performance.js'
export { worldWater } from './water.js'
export { FieldLighting } from './field-lighting.js'
export {
  FieldLights,
  osmFieldLightSource,
  type FieldLightOptions,
  type FieldLightSource,
  type FieldLightMark,
} from '../render/entity/field-lights.js'
export {
  portalRegistry,
  setPortalConnection,
  resolveWorldPortalViews,
  type WorldContent,
  type PortalConnection,
  type RegisteredPortal,
} from './world-content.js'
export { RemotePortalViews } from '../render/portal/remote.js'

export {
  gameCameraDefaults,
  resolveGameCameraSettings,
  type GameCameraSettings,
} from '../config/camera.js'
export {
  createPlanetSettingsPanel,
  formatPlanetVisualConfig,
  planetVisualConfigFromRuntime,
  installVehicleMonitorStyles,
  vehicleMonitorStyleText,
  CLOUD_PRESSURE_PRESETS,
  type PlanetSettingsPanel,
  type PlanetSettingsRuntime,
  type PlanetVisualConfig,
} from './planet-settings-panel.js'
