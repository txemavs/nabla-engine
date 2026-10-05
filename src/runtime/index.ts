export { PlaySession, type PlayOptions, type SessionState } from './session.js'
export { GameRuntime } from './game.js'
export { playGroundClearance } from './placement.js'
export { FrameLoop } from './frame-loop.js'
export { createRuntimeText, type RuntimeText, type RuntimeLocale } from './messages.js'
export { GameHud, type GameHudState } from './hud.js'
export { WheelDebugOverlay, type WheelDebugData } from '../diagnostics/wheel-debug.js'
export { VehicleEffects } from './vehicle-effects.js'
export { createGameCameraState, updateGameCamera, type GameCameraState } from './game-camera.js'
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
  TouchDriving,
  driveSliderThrottle,
  driveHandbrakePull,
  driveWheelSteer,
  drivePilotAngle,
  drivePilotSteer,
  type TouchDrivingActions,
  type TouchDrivingVisibility,
  type TouchDrivingInput,
} from './touch-driving.js'
export { GameplayStreaming, type GameplayWorldStream } from './streaming.js'
export { Sidearm } from './sidearm.js'
export { Gallery, shotView } from './gallery.js'
export { fireSidearm } from './shooting.js'
export { createGallery } from '../examples/gallery.js'
export { GameRenderPipeline, type GameRenderFrame } from './render-pipeline.js'
export {
  normalizePerformance,
  performanceDefaults,
  performancePresets,
  performanceProfile,
  streamBudget,
  tileBudget,
  shadowTiers,
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
