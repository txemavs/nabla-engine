import { threadedSimulation } from '../simulation/threaded-simulation.js'
import { PerfMeter } from './perf-meter.js'
import {
  readVehicleLights,
  writeVehicleLights,
  type VehicleLightTuning,
} from '../render/vehicle-presentation/light-tuning.js'
import { detectCompressedTextureSupport } from '../render/planet/tile-compression.js'
import { installInterfaceStyles } from './interface-style.js'
import { mountEngineVersionLabel } from './engine-version.js'
import {
  getVehicleBeamCutoff,
  setVehicleBeamCutoff,
} from '../render/vehicle-presentation/authored-lights.js'
import type { FsrSettings } from '../render/effects/fsr1.js'
import { describePrograms, latestProgramId } from './shader-diagnostics.js'
import { MapInspector } from './map-inspector.js'
import { Headlamp } from '../render/entity/headlamp.js'
import type { MapTile } from '../scene/mercator.js'
import { installShaderWarmup } from '../render/shader-warmup.js'
import {
  frameDrawCalls,
  rendererBackend,
  type RenderBackend,
  type RenderBackendKind,
  webgpuSkippedMaterials,
  webgpuNodeKit,
} from '../render/backend.js'
import { atlasFieldLightSource } from '../render/planet/instance-lights.js'
import { UsbFeedback } from './usb/feedback.js'
import { UsbControllers, idleUsbFrame, usbDeviceKey } from './usb/controllers.js'
import type { UsbFrame, UsbStorage } from './usb/controllers.js'
import {
  actionHeld,
  inputMode,
  actionCompletesChord,
  actionAxis,
  bindingForKey,
  inputBindings,
  contextualAction,
  legacyInputAction,
  gamepadActionButtons,
  controlsHint,
  type InputContext,
} from '../config/input-bindings.js'
import { readXRQuality } from './xr-quality.js'
import type { GameXR, XRForklift, XRGrab, XRLoadout, XRMotorcycle } from './xr-runtime-parts.js'

type XRParts = typeof import('./xr-runtime-parts.js')
import { vehicleOptions } from './vehicle-options.js'
import {
  normalizeVehiclePreferences,
  readVehiclePreferences,
  writeVehiclePreferences,
  type VehiclePreferences,
} from './vehicle-preferences.js'
import { assetQualityForDevice, type AssetQuality } from '../render/entity/asset-quality.js'
import { normalizeWeaponWheel, stepWeaponWheel } from './weapon-wheel.js'
import { normalViewTuning, smokeTuning, actionCamTuning } from '../config/gameplay-tuning.js'
import { trailerPlatformTuning } from '../config/gameplay-tuning.js'
import { presetVehicle } from '../catalog/vehicles/library.js'
import { randomRoadVehicle } from './random-vehicle.js'
import {
  readDriverPose,
  writeDriverPose,
  type DriverPoseAdjustment,
} from '../config/driver-pose.js'
import { GameToolbar } from './game-toolbar.js'
import { BodycamAim } from './bodycam-aim.js'
import { ActionCam } from './action-cam.js'
import type { ActionCamSettings } from './action-cam-settings.js'
import { smokeDensity, setSmokeDensity } from '../render/entity/smoke-density.js'
import { WeaponControls } from './weapon-controls.js'
/**
 * Compose a complete browser game over the shared gameplay coordinator.
 * This owner creates GPU resources, terrain streaming, input listeners, audio,
 * monitors and a single frame loop. Hosts supply a canvas and authored planetary
 * scene; dispose releases owned resources without removing the host canvas.
 */
import {
  autoResolutionScaleRange,
  maxPixelRatio,
  resolveDisplaySettings,
  type DisplaySettings,
} from '../config/display.js'
import {
  AdaptiveResolutionScale,
  probeResolutionTier,
  type ResolutionProbeResult,
  type ResolutionScaleState,
} from './resolution-scale.js'
import type { RuntimeFrameSample } from '../diagnostics/runtime-frame.js'
export type { RuntimeFrameSample } from '../diagnostics/runtime-frame.js'
import { controlDefaults } from '../config/controls.js'
import { lightingDefaults } from '../config/lighting.js'
import { streamingDefaults } from '../config/streaming.js'
import { simulationDefaults } from '../config/simulation.js'
import { gameCameraDefaults, type GameCameraSettings } from '../config/camera.js'
import {
  portalRegistry,
  setPortalConnection,
  resolveWorldPortalViews,
  type WorldContent,
} from './world-content.js'
import { RemotePortalViews } from '../render/portal/remote.js'
import { FieldLighting } from './field-lighting.js'
import type { FieldLightOptions } from '../render/entity/field-lights.js'
import type {
  VehicleLampState,
  VehicleLightMode,
  VehicleLightSwitches,
} from '../render/vehicle-presentation/light-controller.js'
import { worldWater } from './water.js'
import { liveSkyClock, skyRate, type SkyClock } from '../planet/sky.js'
import { HeldWeapon } from './held-weapon.js'
import { weaponSlots } from '../catalog/weapons/slots.js'
import { weaponPresets } from '../catalog/weapons/library.js'
import {
  readSidearmTuning,
  writeSidearmTuning,
  normalizeSidearmTuning,
  type SidearmTuning,
} from './sidearm-tuning.js'
import { setCarMenuMusicLabel } from '../catalog/monitors/car.js'
import { assets, disposeObject } from '../render/entity/assets.js'
import type { Entity, Vec3Tuple } from '../entity/schema.js'
import {
  browserPerformanceDefaults,
  cloudStyleForPerformancePreset,
  normalizePerformance,
  performancePresets,
  streamBudget,
  tileBudget,
  visibilityChoices,
  type PerformanceSettings,
  type VisibilitySettings,
} from './performance.js'
import { readSavedPlanetVisual, writeSavedPlanetVisual } from './planet-visual.js'
import type { MissingTile } from '../planet/missing-tiles.js'
import { GameRenderPipeline } from './render-pipeline.js'
import {
  createGpuTiming,
  WebGPUGpuTiming,
  type TimestampRenderer,
} from '../diagnostics/gpu-timing.js'
import { Sidearm } from './sidearm.js'
import {
  normalizeWeaponPoses,
  type WeaponPose,
  type WeaponPoseTuning,
  weaponPoseStorageKey,
} from './weapon-pose-tuning.js'
import { PickupInventory, type WorldPickup } from '../simulation/items/pickups.js'
import { fireModeLabel, nextFireMode } from '../simulation/weapons/machine-pistol.js'
import { FirearmSamples } from '../audio/firearm-samples.js'
import { FireModeBadge } from './fire-mode-badge.js'
import { Gallery } from './gallery.js'
import { fireSidearm, sidearmButtonAction } from './shooting.js'
import { CasingMotion } from '../simulation/weapons/casings.js'
import { Casings } from '../render/entity/casings.js'
import { DroppedMagazines } from '../render/entity/magazines.js'
import type { MagazineEntity } from '../simulation/weapons/magazine.js'
import type { FirearmEvent } from '../simulation/weapons/firearm.js'
import { TouchDriving, type TouchDrivingVisibility } from './touch-driving.js'
import {
  controlSurfaces,
  resolveControlProfile,
  touchRigState,
  type ControlSurfaces,
} from './control-profiles.js'
import { TouchFlight } from './touch-flight.js'
import { TouchWalk, touchLookPitchRate, touchLookRate } from './touch-walk.js'
import { SceneryPhysics, type SceneryLayer } from './scenery-physics.js'
import { vehicleMenuKey } from './vehicle-menu.js'
import { VehicleWarmup } from './vehicle-warmup.js'
import { nextPaint } from './next-paint.js'
import { activePlayMode, isVRMode } from './settings-scope.js'
import { XRDebugPanel } from './xr-debug.js'
import { createEntity } from '../entity/schema.js'
import { showLoadingBadge } from './loading-badge.js'
import { readAudioMix, writeAudioMix, type AudioMixLevels } from '../audio/mixer.js'
import type { MusicTrack } from '../audio/music.js'
import {
  cameraFovFor,
  cameraFovRange,
  nextCameraFovOffset,
  readCameraFovOffset,
  writeCameraFovOffset,
  type CameraFovBase,
} from './camera-fov.js'
import {
  defaultSteeringWheelOffset,
  describeSteeringWheelOffset,
  initialSteeringWheelOffset,
  readSteeringWheelOffset,
  writeSteeringWheelOffset,
  type SteeringWheelSettings,
} from './steering-wheel-offsets.js'
import type { SteeringWheelOffset } from '../render/entity/steering-wheel.js'
import {
  defaultMirrorAdjustment,
  describeMirrorAdjustment,
  initialMirrorAdjustment,
  readMirrorAdjustment,
  writeMirrorAdjustment,
  type MirrorSettings,
} from './mirror-adjustment.js'
import type { MirrorAdjustment, MirrorAngle } from '../render/entity/car-mirrors.js'
import { VehicleMonitors } from './vehicle-monitors.js'
import type { Simulation } from '../simulation/simulation.js'
import * as THREE from 'three'
import { parseScene, type SceneDocument } from '../scene/document.js'
import { SceneView } from '../presentation/scene-view.js'
import { mirrorPolicyForQuality } from '../render/entity/car-mirrors.js'
import { GeographicView } from '../render/planet/sky.js'
import { reuseFog } from '../render/planet/fog.js'
import {
  PlanetWorld,
  type TileTiming,
  type LoadDiagnostics,
  type TileDiscoveryMode,
  type PlanetSourceOptions,
  groundPhotoAnisotropy,
  setGroundPhotoAnisotropy,
} from '../render/planet/world.js'
import { setPlanetCharts } from '../render/entity/helm-map.js'
import { setNavigationPlaces, setNavigationRoads } from '../render/entity/navigation-places.js'
import {
  normalizeLightTuning,
  readLightTuning,
  writeLightTuning,
  type LightTuning,
} from './light-tuning.js'
export {
  AVATAR_ANIM_STATES,
  AVATAR_STRIDE_SPEED,
  PlayerBody,
  PlayerBodyRig,
  localAvatarState,
  type AvatarAnimState,
  type AvatarInput,
  type AvatarNetState,
  type PlayerBodyAssets,
} from '../render/entity/player-body.js'
/** The engine's default player body (assets/avatar, credits in assets/avatar/LICENSES.md). */
const DEFAULT_PLAYER_BODY: PlayerBodyAssets = {
  model: '/avatar/avatar.glb',
  animations: '/avatar/avatar.anims.glb',
}
import {
  PlayerBodyRig,
  type AvatarNetState,
  type PlayerBodyAssets,
} from '../render/entity/player-body.js'
export {
  lightTuningBase,
  lightTuningDefaults,
  lightTuningRanges,
  type LightTuning,
} from './light-tuning.js'
import {
  WorldEnvironment,
  configureWorldRenderer,
  PLANET_DEFAULTS,
} from '../render/planet/world-environment.js'
import { CatchFloor } from '../render/planet/catch-floor.js'
import {
  asphaltContrast as currentAsphaltContrast,
  setAsphaltContrast as applyAsphaltContrast,
} from '../render/planet/ground-material.js'
import { ShadowManager } from '../render/shadows.js'
import { shadowBiasRange, shadowTiers } from '../render/shadow-tiers.js'
import {
  localToGeo,
  geoToLocal,
  localFrame,
  EARTH_RADIUS,
  type GeoPoint,
} from '../math/geo/sphere.js'
import { nearestExtraZ15 } from './nearest-z15.js'
import { mapTileSample, mapTileAt, mapTileId } from '../scene/mercator.js'
import type { PlayOptions } from './session.js'
import {
  createGameCameraState,
  IdleCinematic,
  downwardViewFar,
  gameCameraView,
  isFirstPersonView,
  mouseLooksWithoutButton,
  setGameCameraView,
  updateGameCamera,
  type GameCameraState,
  type GameCameraView,
} from './game-camera.js'
import {
  StartCameraSequencer,
  descentWarmHeights,
  resolveStartCameras,
  type ResolvedStartCamera,
  type StartCameraAction,
  type StartCameraSequence,
} from './start-cameras.js'
export type { StartCameraName, StartCameraSequence, StartCameraStep } from './start-cameras.js'
import { GameRuntime as SharedGameRuntime } from './game.js'
import { availableGamepads } from './input.js'
import { playGroundClearance } from './placement.js'
import { hiddenTileLayers, setHiddenTileLayers } from '../render/planet/tile-layers.js'
import { auditGround, type GroundAudit } from './ground-audit.js'
import { FrameLoop } from './frame-loop.js'
import { normalizeTilesBase } from '../render/planet/static-tiles.js'
import { workerAtlasPackageLoader } from '../render/planet/atlas-package-loader.js'
import { loadingWorkersEnabled, workerLoading } from '../render/planet/loading-workers.js'
import { VehicleEffects } from './vehicle-effects.js'
import { gearLabel } from '../entity/vehicle/gear-label.js'

import { groundAtSeam, waitForArea, waitForGround } from './ground.js'
import {
  uploadSceneTextures,
  warmGamePresentation,
  warmEffectPresentation,
} from './presentation-warmup.js'
import { AccidentReplacement, replacementRoadSpot } from './accident-replacement.js'
import { GameHud } from './hud.js'
import { FlipCinematic } from './flip-cinematic.js'
import { navigationRoads, NavigationPlaceLookup } from '../render/entity/navigation-places.js'
import { WheelDebugOverlay } from '../diagnostics/wheel-debug.js'
import { createRuntimeText, type RuntimeLocale } from './messages.js'
import { t } from '../i18n/index.js'

export interface GameFrame {
  speedKmh: number
  gear: number | null
  /** HUD text: `R`, `D3` in automatic mode, `M3` in manual mode; null outside a gearbox vehicle. */
  gearLabel: string | null
  location: ReturnType<typeof localToGeo> | null
  /**
   * Active control profile and which readouts it shows. Hosts with their own speed/gear
   * widgets hide them when `speed`/`gear` are false (on foot, carrier flight, trailers).
   */
  controls: ControlSurfaces
}
/**
 * Overhead damping of a start descent (`StartCameraStep.fromHeight`), 1/s: from 600 m about
 * 80 m remain after 2.2 s, versus 1.6 s to settle at the normal 3/s. A presentation choice.
 */
const START_DESCENT_DAMPING = 1.2
/** Loading stages `prepareReveal` reports, including mounted menu vehicle preparation. */
const REVEAL_STAGES = 5

/** Pre-play attract/boot view: sky and planet only, camera outside the planet (TV-style). */
export interface AttractOptions {
  /** Camera distance above the surface, metres (default 18 000 km). */
  altitude?: number
  /** Orbit period in seconds; 0 holds still (default 120). */
  orbitSeconds?: number
  /** Tilt from local vertical, radians (default 0.45). */
  tilt?: number
  /**
   * Sky clock of the attract view. Default: the real clock now (rate 1), so the planet shows the
   * real day or night; gameplay switches to the scene's own clock when it is revealed.
   */
  clock?: SkyClock
}
/** The steering wheel of the vehicle the player drives (see `GameRuntime.steeringWheel`). */
export interface SteeringWheelState {
  vehicleId: string
  /** Vehicle name for menus, e.g. "S3 Nabla · 400 CV DSG". */
  name: string
  /** Steering model: the URL of its steering GLB. Adjustments are shared per model. */
  model: string
  /** Current adjustment on top of the GLB pose, metres. */
  offset: SteeringWheelOffset
  /** What `resetSteeringWheelOffset` returns to: the host default, else centred. */
  defaultOffset: SteeringWheelOffset
  /** True when the player's own choice is saved for this model. */
  saved: boolean
}
/** The mirrors of the vehicle the player drives (see `GameRuntime.mirrors`). */
export interface MirrorState {
  vehicleId: string
  /** Vehicle name for menus, e.g. "S3 Nabla · 400 CV DSG". */
  name: string
  /** Mirror model (`mirrorModelKey`). Adjustments are shared per model. */
  model: string
  /** Sides this vehicle has mirrors on (`left`, `right`, …). */
  sides: string[]
  /** Current glass adjustment per side on top of the authored aim, degrees (absent = 0°/0°). */
  adjustment: MirrorAdjustment
  /** What `resetMirrorAdjustment` returns to: the host default, else the authored aim. */
  defaultAdjustment: MirrorAdjustment
  /** True when the player's own choice is saved for this model. */
  saved: boolean
}
/** H notices per light switch position (English keys, see messages.es.ts). */
const lightModeNotice: Record<VehicleLightMode, string> = {
  off: 'Lights off',
  position: 'Position lights',
  low: 'Dipped beams',
  auto: 'Automatic lights',
}

/** One vehicle's place in the world, from `GameRuntime.vehiclePlacements`. */
export interface VehiclePlacement {
  id: string
  name: string
  /** Body model URL, to tell the catalog preset apart. */
  visual: string | null
  color: string | null
  /** WGS84 degrees. */
  lat: number
  lon: number
  /** Metres above the mean-radius sphere. */
  alt: number
  /** Compass heading, degrees clockwise from north (0 ≤ h < 360). */
  heading: number
  /** Tractor id when this trailer is hitched. */
  towedBy: string | null
  /** The vehicle the player occupies. */
  player: boolean
}

/** A shot fired by the local player, as reported to `GameRuntime.addShotListener`. */
export interface ShotReport {
  /** Weapon position, simulation world. */
  origin: Vec3Tuple
  /** Hit point, or where the bullet trace ended. */
  end: Vec3Tuple
  /** Solid hit: entity (null for map colliders), point, normal and the damage applied. */
  hit: { entityId: string | null; point: Vec3Tuple; normal: Vec3Tuple; damage: number } | null
}

/** `GameRuntime.vehicleLightState`: switch positions plus live lamp inputs. */
export type VehicleLightState = VehicleLightSwitches & VehicleLampState

export interface GameRuntimeOptions {
  /**
   * Renderer prepared by {@link createRenderBackend} on `canvas` (e.g. WebGPU for `?renderer=webgpu`).
   * Omit for the default WebGL renderer, created here exactly as before.
   */
  backend?: RenderBackend
  /**
   * Image shown in the headset while the game prepares its first XR frame (e.g. the host logo).
   * WebXR cannot replace the browser's own loading environment; this replaces it at once.
   */
  xrSplashUrl?: string
  /** Desktop FSR 1 upscaling, opt-in; immersive XR bypasses it. */
  fsr?: Partial<FsrSettings>
  /** Opt-in stall/shader capture; disabled during normal play. */
  performanceLog?: boolean
  /** Override automatic low-profile/Quest geometry selection. Requires a new runtime. */
  usb?: { storage?: UsbStorage | null }
  assetQuality?: AssetQuality
  /** Fixed initial pickup location; projected onto the ground, takes precedence over a vehicle. */
  weaponPickupLocation?: GeoPoint
  /** Place the initial HK on the ground beside the nearest road car (or a specific vehicle id). */
  weaponPickupNearVehicle?: boolean | string
  /** Per-instance camera recovery settings; omitted fields use Engine defaults. */
  camera?: Partial<GameCameraSettings>
  canvas: HTMLCanvasElement
  /** Render the Engine-owned gameplay HUD inside the canvas parent. */
  hud?: boolean
  /** Initial audio preference; hosts may change it later with setAudioEnabled. */
  audio?: boolean
  /**
   * Looping background music on the music bus, streamed and started after the first gesture.
   * The player's mix (`setAudioMix`, saved as `nabla.audioMix`) sets its level and mute.
   */
  music?: MusicTrack
  /** Per-instance UI language and optional message-template overrides. English is the fallback. */
  locale?: RuntimeLocale
  messages?: Readonly<Record<string, string>>
  /** Additional host focus policy, for editor menus and docked panels. */
  acceptsInput?: () => boolean
  scene: SceneDocument
  /** Vehicle assemblies prepared during the intro, before gameplay is revealed. Empty by default. */
  /** 'spawn' starts with usable ground and streams the surroundings while playing.
   * 'nearby' waits for the spawn Z15 and its three nearest neighbours.
   * 'area' is an explicit opt-in for finite demonstrations that need full coverage before reveal. */
  startupTerrain?: 'spawn' | 'nearby' | 'area'
  preloadVehicles?: readonly (readonly Entity[])[]
  /** Spawn one of these prepared assemblies on a road behind the player 2 s after an occupied-vehicle impact explosion. */
  accidentReplacementVehicles?: readonly (readonly Entity[])[]
  world?: WorldContent
  tiles?: { baseUrl: string; apiUrl?: string; mode?: TileDiscoveryMode } & PlanetSourceOptions
  /** Disable only the visible water sheet for a synthetic sea-level test surface. */
  sea?: boolean
  /**
   * Also rest every other vehicle of the scene on the loaded ground before play (the player's
   * vehicle always is). Needed on real terrain, where a fixed authored height is wrong.
   * Towed trailers keep their offset from the tractor.
   */
  restParkedOnGround?: boolean
  clock?: 'automatic' | 'manual'
  /**
   * Frame cap and resolution scaling; caps apply only to the automatic clock.
   * Omit the resolution fields for a fixed preset step (`presetResolutionScales`).
   * `resolutionScaleMode: 'auto'` adapts (starts at 0.5, 0.5..1); `resolutionScale` fixes it.
   */
  display?: Partial<DisplaySettings>
  /** Notified when auto resolution changes scale, or when the host switches mode. */
  onResolutionScale?: (state: ResolutionScaleState) => void
  /**
   * Auto shows the Studio drive rig on coarse-pointer devices. `always` keeps the
   * wheel, accelerator and handbrake visible for mouse and touch. `false` disables them.
   */
  touchControls?: TouchDrivingVisibility | false
  /**
   * Cinematic camera after two barrel rolls / flips in under a second.
   * Default on; hosts and the in-game menu can turn it off.
   */
  flipCinematic?: boolean
  /**
   * R reset puts the vehicle on the nearest road/vía (scene roads + streamed OSM roads)
   * instead of uprighting it in place. Default on; hosts and the in-game menu can turn it off.
   */
  recoverToRoad?: boolean
  /** World gravity multiplier (see `simulationDefaults.gravityScaleRange`, default 1 = 9.81 m/s²). */
  gravityScale?: number
  /**
   * Factor on the quality tier's texel-scaled shadow bias, 0..3 (default 1). Higher removes
   * residual shadow stripes (acne) at the cost of slightly detached shadows; live via `setShadowBias`.
   */
  shadowBias?: number
  /**
   * Asphalt contrast on the roads photo drape, applied at draw time (tile textures untouched):
   * 0.5–2.5, 1 = unchanged (default). Shared by every runtime in the page; see `setAsphaltContrast`.
   */
  asphaltContrast?: number
  /**
   * Start camera sequence for a start in a vehicle (`play({ vehicleId })`), e.g.
   * `['overhead', { view: 'driver', after: 800, transitionMs: 1800 }, { view: 'chase', after: 'engine' }]`:
   * overhead first, down into the driver's seat, the engine start-up there, then out to the chase
   * camera. Driving input or C ends it early. Default none: the driver view from the first frame.
   * See `StartCameraStep`.
   */
  startCameras?: StartCameraSequence
  depthOfField?: boolean
  performance?: Partial<PerformanceSettings>
  /** Explicit opt-in; omit to keep offline games independent of external light data. */
  fieldLights?: FieldLightOptions
  onProgress?: (status: string, loadedTiles?: string[]) => void
  onFrame?: (frame: GameFrame) => void
  /** Opt-in per-frame CPU and render counters; omit to avoid diagnostics collection. */
  onDiagnostics?: (sample: RuntimeFrameSample) => void
  onMessage?: (message: string) => void
  onError?: (error: unknown) => void
  /**
   * Driver steering-wheel adjustment per steering model: host defaults and where the player's
   * choice is saved (pass `localStorage` to keep it between visits). See `setSteeringWheelOffset`.
   */
  steeringWheel?: SteeringWheelSettings
  /**
   * Driver mirror glass adjustment per mirror model: host defaults and where the player's choice
   * is saved (pass `localStorage` to keep it between visits). See `setMirrorAngle`.
   */
  mirrors?: MirrorSettings
  /**
   * Light switch position once a vehicle's engine runs (after the start-up sequence, or at entry
   * with `ignition: false`): `position` (posición, default), `low` (cruce / dipped, e.g. a night
   * scene) or `off`. Lights stay off before and during the start-up. H then cycles
   * off → position → low → off.
   */
  startLights?: VehicleLightMode
}

/** Browser composition over the same session, camera, input and effects used by Studio.
 * Owns its renderer and listeners; the caller owns the canvas and surrounding UI.
 */

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/** A frame that yields the game step result (a promise when physics runs in a worker). */
type StepResult = Exclude<ReturnType<SharedGameRuntime['step']>, Promise<unknown>>
type FrameSteps = Generator<unknown, void, unknown>

export class GameRuntime {
  private readonly versionLabel: HTMLElement | null
  /** XR system once `loadXR()` resolved; null on a page that never asked for XR. */
  private xrSystem: GameXR | null = null
  private xrParts: XRParts | null = null
  private xrLoading: Promise<GameXR> | null = null
  /**
   * The XR system. XR code is loaded on demand: call `await runtime.loadXR()` first (XR / AR
   * pages do it before their UI); reading this before throws.
   */
  get xr(): GameXR {
    if (!this.xrSystem) throw new Error('XR is not loaded: await runtime.loadXR() first')
    return this.xrSystem
  }
  /** True once the XR code is loaded. */
  get xrLoaded(): boolean {
    return !!this.xrSystem
  }
  /** True while an XR session runs (false while XR is not loaded). */
  private get xrActive(): boolean {
    return this.xrSystem?.active ?? false
  }
  /** XR quality settings: the live ones once loaded, else the saved ones. */
  private get xrQuality() {
    return this.xrSystem?.quality ?? readXRQuality()
  }
  readonly game = new SharedGameRuntime()
  readonly session = this.game.session
  /** The one scenery-physics service: sign and traffic-light poles register layers here. */
  readonly sceneryPhysics = new SceneryPhysics(() => this.session.simulation)
  readonly cameraState = this.game.cameraState
  private readonly document: SceneDocument
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(
    gameCameraDefaults.chaseFov,
    1,
    gameCameraDefaults.nearClip,
    gameCameraDefaults.farClip,
  )
  private readonly viewForward = new THREE.Vector3()
  private readonly renderer: THREE.WebGLRenderer
  /** Backend drawing this runtime: `webgpu` only when the host passed a WebGPU backend. */
  readonly backend: RenderBackendKind
  private readonly remoteViews: RemotePortalViews
  private readonly worldContent: WorldContent | undefined
  private readonly fieldLighting: FieldLighting | null
  /** Static bodies of lamp posts and tree trunks: a world layer of the scenery-physics service. */
  private readonly fieldPoles: SceneryLayer | null
  private display: DisplaySettings
  private readonly adaptive: AdaptiveResolutionScale
  private probing: Promise<unknown> | null = null
  private attract: {
    loop: FrameLoop
    elapsed: number
    orbitSpeed: number
    orbitTarget: number
    camera: THREE.PerspectiveCamera
    last: number | null
    options: Required<AttractOptions>
  } | null = null
  private quality: PerformanceSettings
  private readonly pipeline = new GameRenderPipeline()
  private readonly gallery: Gallery
  private sidearm: Sidearm | null = null
  /** Melee or bow from a numbered weapon slot; exclusive with the drawn sidearm. */
  private heldWeapon: HeldWeapon | null = null
  private heldDrawn = false
  private firearmSamplesVoice: FirearmSamples | null = null
  private get firearmSamples(): FirearmSamples {
    return (this.firearmSamplesVoice ??= new FirearmSamples(this.effects.audio))
  }
  private readonly inventory = new PickupInventory()
  private ownedWeaponId: string | null = null
  private readonly pickupModels = new Map<string, THREE.Group>()
  private pickupGeneration = 0
  private pickupGroundTime = 0
  private syncPickupGround(sim: Simulation, dt: number): void {
    if (!this.world || !this.inventory.items.length) return
    this.pickupGroundTime += dt
    if (this.pickupGroundTime < 0.5) return
    this.pickupGroundTime = 0
    for (const item of this.inventory.items) {
      if (
        new THREE.Vector3(...item.position).distanceTo(
          new THREE.Vector3(...sim.renderPlayerPosition),
        ) > 100
      )
        continue
      const height = this.world.groundHeight(item.position)
      if (height === undefined) continue
      const position: Vec3Tuple = [item.position[0], height + 0.01, item.position[2]]
      this.inventory.move(item.id, position)
      this.pickupModels.get(item.id)?.position.fromArray(position)
    }
  }
  private spawned: string[] = []
  private spawnSequence = 0
  private worldGravityScale = 1
  private accidentReplacement?: AccidentReplacement
  private exhaustOffset: Vec3Tuple = [0, 0, 0]
  private readonly idleCinematic = new IdleCinematic()
  private cameraActivity(): void {
    this.idleCinematic.activity(
      this.cameraState,
      !!this.session.simulation?.player.vehicleId,
      performance.now(),
    )
  }
  private exhaustAmount = 1
  get truckExhaustAmount(): number {
    return this.exhaustAmount
  }
  /** Provisional truck emission multiplier; 0.5 means half the particle quantity. */
  setTruckExhaustAmount(amount: number): number {
    if (!Number.isFinite(amount)) throw new Error('Invalid exhaust amount')
    this.exhaustAmount = Math.max(0, Math.min(2, amount))
    this.view.setTruckExhaustAmount(this.exhaustAmount)
    return this.exhaustAmount
  }
  get truckExhaustOffset(): Vec3Tuple {
    return [...this.exhaustOffset]
  }
  /** Provisional live truck exhaust offsets, metres: right, up, rearward. */
  setTruckExhaustOffset(offset: Vec3Tuple): Vec3Tuple {
    if (!offset.every(Number.isFinite)) throw new Error('Invalid exhaust offset')
    this.exhaustOffset = offset.map((value) => Math.max(-1, Math.min(1, value))) as Vec3Tuple
    // Vehicle forward is -Z, so positive rearward offsets use +Z.
    this.view.setTruckExhaustOffset(this.exhaustOffset)
    return this.truckExhaustOffset
  }
  private vehicleWarmup: VehicleWarmup | null = null
  private readonly drivingPrepared = new Set<string>()
  private enteringVehicle = false
  private vehiclePreparationCount = 0
  private finishVehiclePreparation: (() => void) | null = null
  private placed: { id: string; name: string; ids: string[] }[] = []
  private placeSequence = 0
  private aimLean = 0
  private weaponDrawn = false
  private fireRequested = false
  private xrForklift: XRForklift | null = null
  private xrMotorcycle: XRMotorcycle | null = null
  private xrLoadout: XRLoadout | null = null
  private xrGrab: XRGrab | null = null
  private triggerReleased = false
  /**
   * Left button held (on foot, pistol drawn). `fireRequested` is a one-frame edge cleared every
   * frame; RÁFAGA keeps firing while this stays true.
   */
  private triggerDown = false
  private fireModeBadge: FireModeBadge | null = null
  private magazineAction: 'drop' | 'insert' | 'release' | 'automatic' | null = null
  private readonly headlamp: Headlamp
  private weaponLightOn = false
  private readonly bodycam = new BodycamAim()
  private readonly actionCam = new ActionCam()
  private actionCamOn = actionCamTuning.enabled
  private safetyClickHeld = false
  private weaponLight: THREE.SpotLight | null = null
  private casingMotion: CasingMotion | null = null
  private casingMeshes: Casings | null = null
  private cartridgeMotion: CasingMotion | null = null
  private cartridgeMeshes: DroppedMagazines | null = null
  private magazineMotion: CasingMotion | null = null
  private magazineMeshes: DroppedMagazines | null = null
  private droppedMagazines = new Map<string, MagazineEntity>()
  /**
   * Free-mouse mode. While playing, the game owns the pointer (pointer lock on the canvas);
   * Escape, a menu taking focus, or a click on an in-world monitor release it, and it stays
   * released until the player clicks the game again.
   */
  private pointerFree = false
  private readonly touchDriving: TouchDriving | null
  private readonly flipCinematic = new FlipCinematic()
  /** Resolved `startCameras`; validated once at construction. */
  private readonly startCameras: ResolvedStartCamera[]
  /** The start camera sequence of the current play, while it runs. */
  private startSequence: StartCameraSequencer | null = null
  private readonly touchFlight: TouchFlight | null
  private readonly touchWalk: TouchWalk | null
  private readonly monitors: VehicleMonitors
  private readonly view: SceneView
  private readonly sky: GeographicView
  private readonly environment: WorldEnvironment
  private readonly effects: VehicleEffects
  private readonly shadows = new ShadowManager()
  private readonly sun = new THREE.DirectionalLight(
    lightingDefaults.sunColor,
    lightingDefaults.sunIntensity,
  )
  private readonly ambient = new THREE.AmbientLight(
    lightingDefaults.ambientColor,
    lightingDefaults.ambientIntensity,
  )
  private readonly catchFloor = new CatchFloor()
  /** Live look knobs (Ajustes → Luz); defaults are the shipped look. */
  private lighting: LightTuning = readLightTuning(browserStorage())
  private readonly origin = new THREE.Vector3()
  private readonly loop: FrameLoop
  private readonly keys = this.game.keys
  private readonly lifetime = new AbortController()
  private readonly observer: ResizeObserver
  private readonly world: PlanetWorld | null
  private terrainLoad: AbortController | null = null
  private loading: AbortController | null = null
  private readonly revealGates: Promise<unknown>[] = []
  /** `?performanceLog=1` per-second summary (frame, main CPU, physics main/worker, main idle). */
  private readonly perfMeter = new PerfMeter((summary) => {
    this.options.canvas.dataset.perf = JSON.stringify(summary)
  })
  private readonly preparationGates: Promise<unknown>[] = []
  private readonly revealTasks: (() => Promise<unknown>)[] = []
  private startHold: Promise<unknown> | null = null
  private inspector: MapInspector | null = null
  private readonly inspectorState = createGameCameraState()
  private stallLog: string[] = []
  private lastTime: number | null = null
  private fpsElapsed = 0
  private fpsFrames = 0
  readonly usbControllers: UsbControllers
  readonly usbFeedback = new UsbFeedback()
  private usbFrame: UsbFrame = idleUsbFrame()
  private previousButtons: boolean[] = []
  private previousPad: number | null = null
  private readonly originalTabIndex: string | null
  private disposed = false
  private readonly fieldLightTiles: MapTile[] = []
  private readonly placeLookup = new NavigationPlaceLookup()
  private readonly toolbar: GameToolbar
  private readonly weaponControls: WeaponControls
  private readonly hud: GameHud | null
  private readonly wheelDebug = new WheelDebugOverlay()
  private readonly text: ReturnType<typeof createRuntimeText>
  private fovBase: CameraFovBase = { firstPersonFov: 70, chaseFov: 48 }
  private fovOffset = 0
  private weaponTuning = readSidearmTuning(browserStorage())
  private sidearmAimPreview = false
  private weaponPosePreview: WeaponPose | null = null
  private weaponWheel = (() => {
    try {
      return normalizeWeaponWheel(
        JSON.parse(browserStorage()?.getItem('nabla.weaponWheel') ?? '{}'),
      )
    } catch {
      return normalizeWeaponWheel()
    }
  })()

  /** Shared legacy tuning: the baseline for weapons whose rig has no `poses`. */
  private readonly legacyWeaponPoses: WeaponPoseTuning = (() => {
    try {
      return normalizeWeaponPoses(
        JSON.parse(browserStorage()?.getItem('nabla.weaponPoses') ?? '{}'),
      )
    } catch {
      return normalizeWeaponPoses()
    }
  })()
  /** Resolved poses per weapon id (local override over rig poses over legacy tuning). */
  private readonly weaponPoseCache = new Map<string, WeaponPoseTuning>()
  private get weaponPoses(): WeaponPoseTuning {
    const sidearm = this.sidearm
    const id = sidearm?.preset?.id
    if (!id) return this.legacyWeaponPoses
    const cached = this.weaponPoseCache.get(id)
    if (cached) return cached
    const base = this.weaponPoseBaseline
    let result = base
    try {
      const saved = browserStorage()?.getItem(weaponPoseStorageKey(id))
      if (saved) result = normalizeWeaponPoses(JSON.parse(saved), base)
    } catch {
      /* Optional persistence. */
    }
    // Cache only once the rig (and its poses) has loaded.
    if (sidearm.rigPoses !== undefined) this.weaponPoseCache.set(id, result)
    return result
  }
  /** Poses without local edits: the rig file's `poses`, else the shared legacy tuning. */
  private get weaponPoseBaseline(): WeaponPoseTuning {
    const rig = this.sidearm?.rigPoses
    return rig ? normalizeWeaponPoses(rig, this.legacyWeaponPoses) : this.legacyWeaponPoses
  }
  private smokeOn = true
  private planet: {
    sky: boolean
    sun: boolean
    clouds: boolean
    sea: boolean
    cloudStyle: 'low' | 'artistic'
    cloudAmount: number
    cloudPressure: number
    lensFlareAmount: number
  } = {
    sky: PLANET_DEFAULTS.sky,
    sun: PLANET_DEFAULTS.sun,
    clouds: PLANET_DEFAULTS.clouds,
    sea: PLANET_DEFAULTS.sea,
    // Overwritten after quality is resolved. Alto and Ultra start artistic; a saved Planeta choice wins.
    cloudStyle: 'low',
    cloudAmount: PLANET_DEFAULTS.cloudAmount,
    cloudPressure: 0.12,
    lensFlareAmount: 1,
  }

  constructor(private readonly options: GameRuntimeOptions) {
    this.pipeline.diagnostics = !!options.performanceLog
    this.pipeline.fsr.setSettings(options.fsr ?? {})
    this.usbControllers = new UsbControllers(options.usb?.storage)
    try {
      this.smokeOn = browserStorage()?.getItem('nabla.smoke') !== '0'
      this.actionCamOn =
        (browserStorage()?.getItem('nabla.actionCam') ?? String(actionCamTuning.enabled)) === 'true'
      setSmokeDensity(
        Number(browserStorage()?.getItem('nabla.smokePercent') ?? smokeTuning.defaultPercent),
      )
    } catch {
      /* Keep the default if storage is disabled. */
    }
    this.startCameras = resolveStartCameras(options.startCameras)
    try {
      this.actionCam.setSettings(
        JSON.parse(browserStorage()?.getItem('nabla.actionCamSettings') ?? '{}'),
      )
    } catch {
      /* Keep defaults when storage is unavailable or invalid. */
    }
    this.flipCinematic.enabled = options.flipCinematic !== false
    applyAsphaltContrast(options.asphaltContrast ?? 1)
    // Reject malformed JavaScript callers before allocating browser resources.
    if (options.tiles) normalizeTilesBase(options.tiles.baseUrl)
    this.text = createRuntimeText(options.locale, options.messages)
    this.game.text = this.text
    this.game.recover.snapToRoad = options.recoverToRoad !== false
    this.worldGravityScale = options.gravityScale ?? simulationDefaults.gravityScaleRange.default
    this.game.recover.roads = () => navigationRoads().filter((road) => road.carriageway)
    this.game.recover.pavedAreas = () => this.world?.pavedAreas ?? []
    this.toolbar = new GameToolbar(
      options.canvas.parentElement!,
      () => this.fovOffset,
      (value) => {
        this.applyCameraFov(value)
        writeCameraFovOffset(browserStorage(), this.fovOffset)
      },
      {
        read: () => this.resolutionScaleState.scale,
        write: (resolutionScale) =>
          this.setDisplay({ resolutionScale, resolutionScaleMode: 'manual' }),
      },
    )
    this.toolbar.addAction(
      t('game.add-a-random-vehicle'),
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v16M4 12h16"/></svg>',
      40,
      async () => {
        try {
          const selected = randomRoadVehicle()
          this.options.onMessage?.('Preparando ' + selected.vehicle.name + '…')
          const id = await this.spawnVehicle(selected.vehicle)
          if (selected.trailer) {
            selected.trailer.vehicle!.tow = {
              vehicleId: id,
              hitch: selected.vehicle.vehicle!.hitch!,
              anchor: selected.trailer.vehicle!.towAnchor!,
            }
            const pose = this.session.simulation!.entityTransform(id)
            const yaw = 2 * Math.atan2(pose.rotation[1], pose.rotation[3])
            await this.placeVehicle(selected.trailer, pose.position, yaw)
          }
          this.options.onMessage?.(t('game.vehicle-added', { name: selected.vehicle.name }))
        } catch (error) {
          this.options.onMessage?.(
            error instanceof Error ? error.message : t('game.could-not-add-the-vehicle'),
          )
        }
      },
      'ADD',
    )
    this.weaponControls = new WeaponControls(
      options.canvas.parentElement!,
      (code) => this.action(code),
      (held) => this.sidearm?.setAiming(held),
      this.toolbar,
    )
    this.hud = options.hud ? new GameHud(options.canvas.parentElement!, this.text) : null
    this.scene.add(this.wheelDebug.root)
    this.display = resolveDisplaySettings(options.display, options.performance?.preset)
    this.adaptive = new AdaptiveResolutionScale({
      mode: this.display.resolutionScaleMode,
      scale: this.display.resolutionScale,
    })
    this.adaptive.setTargetFrameMs(this.display.maxFps ? 1000 / this.display.maxFps : null)
    Object.assign(this.cameraState, createGameCameraState(options.camera))
    this.cameraState.bodycam =
      (browserStorage()?.getItem('nabla.bodycam') ?? String(normalViewTuning.enabled)) === 'true'
    this.fovBase = {
      firstPersonFov: this.cameraState.settings.firstPersonFov,
      chaseFov: this.cameraState.settings.chaseFov,
    }
    this.applyCameraFov(readCameraFovOffset(browserStorage()))
    this.camera.near = this.cameraState.settings.nearClip
    this.camera.far = this.cameraState.settings.farClip
    const profile = options.performance?.preset
    const preset =
      profile && Object.hasOwn(performancePresets, profile)
        ? performancePresets[profile as keyof typeof performancePresets].settings
        : {}
    this.quality = normalizePerformance({
      ...browserPerformanceDefaults,
      ...preset,
      ...options.performance,
    })
    // Profile smoke: off forces it off for the session; otherwise it is the default under a saved value.
    try {
      if (this.quality.smoke === 0) setSmokeDensity(0)
      else if (browserStorage()?.getItem('nabla.smokePercent') == null)
        setSmokeDensity(this.quality.smoke)
    } catch {
      setSmokeDensity(this.quality.smoke)
    }
    const savedPlanet = readSavedPlanetVisual(browserStorage())
    if (savedPlanet) Object.assign(this.planet, savedPlanet)
    else this.planet.cloudStyle = cloudStyleForPerformancePreset(this.quality.preset)
    this.document = parseScene(options.scene)
    this.worldContent = options.world ? structuredClone(options.world) : undefined
    this.remoteViews = new RemotePortalViews(
      () => {},
      (message) => options.onMessage?.(message),
      (doc) => new SceneView(doc),
      (doc) =>
        doc.geography && options.tiles
          ? new PlanetWorld(
              doc.geography,
              () => {},
              () => {},
              options.tiles.baseUrl,
              options.tiles.apiUrl ?? '/prepare',
              options.tiles.mode ?? 'static',
              options.tiles,
            )
          : undefined,
    )
    if (!this.document.geography)
      throw new Error('A Nabla game requires planetary coordinates, including offline scenes')
    this.renderer =
      options.backend?.renderer ??
      new THREE.WebGLRenderer({
        canvas: options.canvas,
        antialias: true,
        alpha: true,
        logarithmicDepthBuffer: true,
      })
    this.backend = rendererBackend(this.renderer)
    options.canvas.dataset.renderer = this.backend
    console.info(`Nabla renderer: ${this.backend}`)
    if (this.backend === 'webgl') installShaderWarmup(this.renderer)
    configureWorldRenderer(this.renderer)
    if (options.onDiagnostics) {
      this.renderer.info.autoReset = false
      if (this.backend === 'webgpu') {
        const timing = new WebGPUGpuTiming(this.renderer as unknown as TimestampRenderer)
        this.pipeline.gpuTiming = timing.available ? timing : null
      } else {
        const gl = this.renderer.getContext()
        if (gl instanceof WebGL2RenderingContext) {
          this.pipeline.gpuTiming = createGpuTiming(gl)
        }
      }
    }
    this.applyPixelRatio()
    this.renderer.shadowMap.enabled = this.quality.shadows > 0
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.shadowMap.autoUpdate = false
    this.scene.add(this.sun, this.ambient, this.catchFloor.mesh)
    this.fieldLighting = options.fieldLights
      ? new FieldLighting({
          ...(options.tiles?.atlas
            ? {
                source: atlasFieldLightSource({
                  baseUrl: options.tiles.baseUrl,
                  atlas: options.tiles.atlas,
                  missingStatuses: [403, 404],
                }),
              }
            : {}),
          maxBeams:
            (
              {
                minimal: 0,
                mobile: 0,
                low: 4,
                road: 6,
                balanced: 8,
                high: 10,
                ultra: 12,
              } as Record<string, number>
            )[this.quality.preset] ?? lightingDefaults.maxBeams,
          ...options.fieldLights,
        })
      : null
    if (this.fieldLighting) this.scene.add(this.fieldLighting.lights.root)
    // Same colliders as before the unification: 65 m around every actor, no cap, 3 ms per frame.
    this.fieldPoles = this.fieldLighting
      ? this.sceneryPhysics.layer('field-lights', {
          movable: false,
          maxBodies: Infinity,
          world: { reach: 65, budgetMs: 3 },
        })
      : null
    this.view = new SceneView(this.document, false, false, {
      assetQuality:
        this.options.assetQuality ??
        assetQualityForDevice(this.quality.preset, navigator.userAgent),
      mirrorPolicy: mirrorPolicyForQuality(this.quality.preset),
      steeringWheelOffset: (model) => initialSteeringWheelOffset(options.steeringWheel, model),
      driverPoseOffset: (model) => readDriverPose(browserStorage(), model),
      mirrorAdjustment: (model) => initialMirrorAdjustment(options.mirrors, model),
      startLights: options.startLights ?? 'auto',
    })
    this.scene.add(this.view.root)
    this.headlamp = new Headlamp(this.view.vehicleLights.pedestrianLight)
    this.weaponLight = new THREE.SpotLight(0xfff4de, 0, 45, Math.PI / 9, 0.65, 1.5)
    this.weaponLight.userData.excludeFromViewmodel = true
    this.scene.add(this.weaponLight, this.weaponLight.target)
    this.monitors = new VehicleMonitors(
      options.canvas.parentElement!,
      (message) => options.onMessage?.(message),
      options.canvas,
      this.text,
    )
    this.monitors.onShipSwitch = (id, kind) => this.view.pressShipSwitch(id, kind)
    // The PORTAL panel's Lat/Lon «Ir» form moves the ship (and anyone in its cabin).
    this.monitors.onJump = (carrier, latitude, longitude) => {
      const sim = this.session.simulation
      if (sim) options.onMessage?.(sim.relocateVehicle(carrier, latitude, longitude))
    }
    if (this.worldContent) {
      const world = this.worldContent
      const source = (id: string) =>
        portalRegistry(world).find(
          (entry) => entry.entityId === id && entry.locationId === world.activeLocation,
        )
      this.monitors.projectRegistry = {
        entries: () =>
          portalRegistry(world).filter((entry) => entry.locationId !== world.activeLocation),
        selected: (id) =>
          world.connections?.find((connection) => connection.source === source(id)?.id)
            ?.destination,
        configure: (id, destination, open) => {
          const entry = source(id)
          if (!entry) throw new Error('Portal is not registered')
          const mouth = this.document.entities.find((entity) => entity.id === id)
          const sim = this.session.simulation
          if (
            open &&
            mouth?.portal?.clearsRamp &&
            mouth.parentId &&
            sim &&
            !sim.vehicleInfo(mouth.parentId).rampClosed
          )
            throw new Error('Close the garage door first')
          if (destination && sim) sim.configurePortal(id, null, 'closed')
          Object.assign(
            world,
            setPortalConnection(world, entry.id, destination, open ? 'window' : 'closed'),
          )
          this.remoteViews.dispose()
          return this.text(open ? 'Remote window open' : 'Remote window closed')
        },
        status: (id) => {
          const connection = world.connections?.find((item) => item.source === source(id)?.id)
          return connection
            ? this.text(
                connection.mode === 'window' ? 'Remote window open' : 'Remote window closed',
              )
            : undefined
        },
      }
    }
    this.monitors.rebuild(this.document)
    installInterfaceStyles(options.canvas.ownerDocument)
    this.gallery = new Gallery(options.canvas.parentElement!, this.text)
    this.versionLabel = mountEngineVersionLabel(options.canvas.parentElement!)
    this.sky = new GeographicView(this.document, () => {})
    // Reattach after Play extraction: viewer still parents the flare; game must too.
    this.scene.add(this.sky.lensFlare)
    this.environment = new WorldEnvironment(this.scene, this.sun, this.ambient)
    this.planet.sea = this.options.sea !== false
    this.syncPlanet()
    this.effects = new VehicleEffects(this.scene)
    this.effects.audio.mixer.set(readAudioMix(browserStorage()) ?? {})
    this.effects.reverseAlarmEnabled = (entity) =>
      this.vehiclePreferences(entity.visual?.body.url ?? entity.id).reverseAlarm
    // Music first: a `startOn: "host"` track must hold the audio before setEnabled() unlocks it.
    this.effects.audio.setMusic(options.music)
    this.effects.audio.setEnabled(options.audio !== false)
    if (options.music?.menuLabel) setCarMenuMusicLabel(options.music.menuLabel)
    const touchActions = {
      engage: () => {
        options.canvas.focus()
        this.effects.audio.unlock()
      },
      interact: () => this.action('interact'),
      camera: () => this.cycleCamera(),
      respawn: () => {
        const message = this.game.dispatch('recover')
        if (message) this.options.onMessage?.(message)
      },
    }
    this.touchDriving =
      options.touchControls === false
        ? null
        : new TouchDriving(
            options.canvas.parentElement!,
            touchActions,
            options.touchControls ?? 'auto',
            this.text,
            undefined,
            this.toolbar,
          )
    this.touchFlight =
      options.touchControls === false
        ? null
        : new TouchFlight(
            options.canvas.parentElement!,
            touchActions,
            options.touchControls ?? 'auto',
            this.text,
          )
    this.touchWalk =
      options.touchControls === false
        ? null
        : new TouchWalk(options.canvas.parentElement!, options.touchControls ?? 'auto', this.text)
    if (readXRQuality().shadows && this.quality.shadows === 0)
      this.quality = { ...this.quality, shadows: 512 }
    // XR preferences can promote a shadowless tier after renderer creation.
    // Keep the renderer in sync with the final tier before any materials compile.
    this.renderer.shadowMap.enabled = this.quality.shadows > 0
    this.shadows.setBiasScale(options.shadowBias ?? shadowBiasRange.default)
    if (this.quality.shadows > 0)
      this.shadows.init({
        camera: this.camera,
        scene: this.scene,
        lightDirection: new THREE.Vector3(25, -45, -25).normalize(),
        tier: shadowTiers[this.quality.shadows]!,
        nodeKit: webgpuNodeKit(this.renderer),
      })
    this.view.setVehicleShadowReceiving(!!this.quality.vehicleShadows)
    this.view.setupMaterials((material) => this.shadows.setupMaterial(material))
    this.shadows.setupMaterial(this.catchFloor.mesh.material)
    this.sun.visible = this.quality.shadows === 0
    this.world =
      options.tiles && this.document.geography
        ? new PlanetWorld(
            this.document.geography,
            () => {},
            (material) => this.shadows.setupMaterial(material),
            options.tiles.baseUrl,
            options.tiles.apiUrl ?? '/prepare',
            options.tiles.mode ?? 'static',
            // Loading workers (Atlas packages, package photos, cluster prep) on by default for
            // every backend; `?loadingWorkers=0` keeps all of it on the main thread.
            loadingWorkersEnabled(globalThis.location?.search ?? '')
              ? {
                  ...options.tiles,
                  packageLoader: workerAtlasPackageLoader(),
                  loading: workerLoading(),
                }
              : options.tiles,
          )
        : null
    if (this.world) {
      const renderer = this.renderer
      this.world.gpu = {
        initTexture: (texture) => renderer.initTexture(texture),
        compileAsync: (object) => renderer.compileAsync(object, this.camera, this.scene),
      }
      // KTX2 tile textures are transcoded in the tile worker to a format this renderer samples.
      this.world.textureSupport = detectCompressedTextureSupport(renderer)
      let announced: string | undefined
      let painted = false
      this.world.beforeInstall = (key) => {
        // No diagnostic delay during preload. During play, let the DOM indicator paint
        // before an indivisible mesh upload can occupy the main thread.
        if (!options.performanceLog || this.session.state !== 'playing') return true
        if (announced !== key) {
          announced = key
          painted = false
          options.canvas.dataset.tileInstallActive = '1'
          options.canvas.dataset.tileInstallDetail = 'Instalando celda ' + key
          window.dispatchEvent(new Event('nabla-stream-step'))
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (announced === key) painted = true
            }),
          )
          return false
        }
        return painted
      }
      this.world.afterInstall = (key) => {
        if (!options.performanceLog) return
        options.canvas.dataset.tileInstallActive = '0'
        options.canvas.dataset.tileInstallDetail = 'Última celda ' + key
        announced = undefined
        painted = false
        window.dispatchEvent(new Event('nabla-stream-step'))
      }
      const budget = streamBudget(this.quality)
      this.world.setQuality(budget.concurrent, budget.ahead, budget.retain, budget.tiles)
      this.world.setDistance(this.quality.distance)
      this.world.setRelief(this.quality.relief)
      this.scene.add(this.world.root)
      setPlanetCharts(() => this.world!.chartTiles)
      setNavigationPlaces(() => this.world!.iterateNavigationPlaces())
      setNavigationRoads(() => this.world!.iterateNavigationRoads())
    }
    this.loop = new FrameLoop((time) => {
      try {
        this.frame(time)
      } catch (error) {
        this.pause()
        this.options.onError?.(error)
      }
    })
    this.loop.setMaxFps(this.display.maxFps)
    this.originalTabIndex = options.canvas.getAttribute('tabindex')
    options.canvas.tabIndex = 0
    this.bindInput()
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(options.canvas)
    this.resize()
  }

  /**
   * Load the XR code (dynamic import) and create the XR system; resolves to the same instance on
   * every call. Desktop pages never call it, so they do not download the headset code.
   */
  loadXR(): Promise<GameXR> {
    this.assertAlive()
    this.xrLoading ??= import('./xr-runtime-parts.js').then((parts) => {
      if (this.disposed) throw new Error('GameRuntime was disposed')
      this.xrParts = parts
      this.xrSystem = this.createXR(parts)
      return this.xrSystem
    })
    return this.xrLoading
  }
  /** The XR system once {@link loadXR} has resolved, so a click can enter without awaiting. */
  get loadedXR(): GameXR | null {
    return this.xrSystem
  }
  private createXR(parts: XRParts): GameXR {
    let desktopView:
      Pick<GameCameraState, 'mode' | 'firstPerson' | 'bodycam' | 'pitch' | 'headPitch'> | undefined
    const desktopSunVisible = this.sun.visible
    this.xrGrab = new parts.XRGrab(this.scene)
    this.xrForklift = new parts.XRForklift()
    const splash = new parts.XRSplash(this.options.xrSplashUrl)
    const xr = new parts.GameXR(
      this.renderer,
      this.camera,
      this.scene,
      (active) => {
        this.loop.stop()
        this.releaseInput()
        if (this.xrGrab?.slideHeld) this.sidearm?.moveSlide(0, performance.now())
        this.xrGrab?.reset()
        this.xrMotorcycle?.reset()
        this.xrLoadout?.suspend(performance.now())
        if (this.sidearm) this.sidearm.tracked = active
        if (active) this.effects.audio.unlock()
        this.lastTime = null
        this.options.canvas.dataset.xr = String(active)
        if (active) {
          const { mode, firstPerson, bodycam, pitch, headPitch } = this.cameraState
          desktopView = { mode, firstPerson, bodycam, pitch, headPitch }
          this.stopAttract()
          // Submit frames from the first XR callback: the splash until the scene's shaders are
          // compiled for the headset views, so the browser's loading room never stalls.
          let warm = false
          let frames = 0
          splash.reset()
          void this.renderer
            .compileAsync(this.scene, this.camera)
            .catch(() => {})
            .then(() => {
              warm = true
            })
          this.renderer.setAnimationLoop((time, frame) => {
            if (!frame || this.disposed) return
            try {
              xr.update(frame)
              if (!warm) {
                splash.render(this.renderer, this.camera, ++frames > 1)
                return
              }
              this.frameXR(time)
            } catch (error) {
              this.pause()
              this.options.onError?.(error)
              void xr.exit()
            }
          })
        } else {
          this.renderer.setAnimationLoop(null)
          if (this.sidearm) this.sidearm.model.visible = false
          this.sun.visible = desktopSunVisible
          if (desktopView)
            Object.assign(this.cameraState, desktopView, {
              lastPose: null,
              lastView: null,
              transition: null,
            })
          this.resize()
          if (!this.disposed && this.session.state === 'playing' && this.options.clock !== 'manual')
            this.loop.start()
        }
      },
      (error) => this.options.onError?.(error),
    )
    return xr
  }

  /** Prepare usable terrain and presentation before starting physics; reject cancelled/failed loads. */
  async play(options: PlayOptions = {}): Promise<void> {
    // Engine default avatar (assets/avatar): the mannequin under the monitor head, unless the
    // host called setPlayerBody (null keeps the head only).
    if (!this.playerBodyChosen)
      void this.loadPlayerBody(DEFAULT_PLAYER_BODY, true).catch((error) => console.warn('player body', error))
    this.assertAlive()
    this.stop()
    const controller = new AbortController()
    this.loading = controller
    this.options.canvas.dataset.loadingStage = 'terrain'
    this.world?.setStartupMode(
      this.options.startupTerrain !== 'area',
      this.options.startupTerrain === 'nearby' ? 4 : 1,
    )
    const document = structuredClone(this.document)
    let spawnGround: number | undefined
    try {
      if (this.world) {
        const progress = (status: string) =>
          this.options.onProgress?.(
            status,
            this.world!.activeTiles.map((tile) => tile.key),
          )
        // A finite example loads its declared coverage before the player can cross a seam.
        for (const tile of this.options.startupTerrain === 'area'
          ? (this.options.tiles?.tiles ?? [])
          : []) {
          await waitForGround(
            this.world,
            geoToLocal(this.document.geography!, mapTileSample(tile, 1, 1, 2)),
            {
              signal: controller.signal,
              onProgress: progress,
            },
          )
        }
        const spawn =
          document.entities.find((entity) => entity.id === options.vehicleId) ??
          document.entities.find((entity) => entity.kind === 'spawn')
        if (!spawn) throw new Error('A spawn entity is required')
        const ground = await waitForGround(this.world, spawn.transform.position, {
          signal: controller.signal,
          onProgress: progress,
        })
        if (this.options.startupTerrain === 'nearby') {
          // These checks share the frozen four-cell plan and reject missing terrain rather than
          // revealing a scene with fewer cells or silently proceeding after an area timeout.
          for (const tile of this.world.startupTiles) {
            await waitForGround(
              this.world,
              geoToLocal(this.document.geography!, mapTileSample(tile, 1, 1, 2)),
              { signal: controller.signal, onProgress: progress },
            )
          }
        }
        spawn.transform.position[1] = ground + playGroundClearance(spawn)
        spawnGround = ground
        if (this.options.restParkedOnGround) {
          const authored = new Map(
            this.document.entities.map((entity) => [entity.id, entity.transform.position[1]]),
          )
          const towed = document.entities.filter((entity) => entity.vehicle?.tow)
          for (const entity of document.entities) {
            if (entity === spawn || !entity.vehicle || entity.vehicle.tow) continue
            entity.transform.position[1] =
              (await waitForGround(this.world, entity.transform.position, {
                signal: controller.signal,
                onProgress: progress,
              })) + playGroundClearance(entity)
          }
          for (const trailer of towed) {
            const tractor = document.entities.find(
              (entity) => entity.id === trailer.vehicle!.tow!.vehicleId,
            )
            if (!tractor) continue
            trailer.transform.position[1] =
              tractor.transform.position[1] +
              (authored.get(trailer.id)! - authored.get(tractor.id)!)
          }
        }
        progress('Ground ready')
      }
      // A boot probe may run alongside the ground wait; finish it before gameplay frames start.
      if (this.probing) await this.probing.catch(() => undefined)
      controller.signal.throwIfAborted()
      this.options.onProgress?.('Starting simulation…')
      this.options.canvas.dataset.loadingStage = 'physics'
      const simulation = await this.game.play(document, {
        playerMode: 'walk',
        vehicleDamage: true,
        ...options,
        planetaryTerrain: !!document.geography?.planetary,
      })
      simulation.setCollisionDistance(this.quality.collisions)
      // Worker mode: command HUD messages arrive with the worker's reply, not as return values.
      const threaded = threadedSimulation(simulation)
      if (threaded) threaded.onMessage = (message) => this.options.onMessage?.(message)
      this.worldGravityScale = simulation.setGravityScale(this.worldGravityScale)
      // Frames step the simulation from here on, while the reveal still prepares. Hold the
      // actor until its ground collision is active, then settle it on that surface.
      if (spawnGround !== undefined) simulation.holdForGround(spawnGround)
      controller.signal.throwIfAborted()
      this.cameraState.mode = options.vehicleId ? 'cockpit' : 'chase'
      this.startSequence =
        options.vehicleId && this.startCameras.length
          ? new StartCameraSequencer(this.startCameras)
          : null
      if (this.startSequence) {
        setGameCameraView(this.cameraState, this.startSequence.first, true)
        if (this.startSequence.holdsEngine) simulation.holdEngine()
      }
      this.options.canvas.dataset.startCameras = this.startSequence ? 'active' : 'none'
      // Everything the first gameplay seconds need is ready before the attract view goes away:
      // vehicle and sidearm models, shader programs, and any host gate (an intro sequence).
      this.options.onProgress?.('Preparing…')
      await this.prepareReveal(controller.signal)
      // Never reveal an actor that is still waiting for its ground collision.
      const holdStarted = performance.now()
      while (!simulation.settleGround(performance.now() - holdStarted > 30_000)) {
        controller.signal.throwIfAborted()
        await new Promise((resolve) => setTimeout(resolve, 16))
      }
      if (spawnGround !== undefined && this.world) {
        // Diagnostics: actor height above the rendered ground at reveal (negative: buried).
        const at = simulation.player.position
        const below = groundAtSeam(this.world, at)
        this.options.canvas.dataset.spawnGap =
          below === undefined ? 'none' : (at[1] - below).toFixed(2)
      }
      if (options.vehicleId) this.drivingPrepared.add(options.vehicleId)
      controller.signal.throwIfAborted()
      const first = this.startSequence?.steps[0]
      if (first?.view === 'map' && first.fromHeight !== undefined) {
        this.cameraState.mapHeight = first.fromHeight
        this.cameraState.mapDescentDamping = START_DESCENT_DAMPING
      }
      // The scene clock starts at its authored time (e.g. 10:00) at reveal, not at construction.
      const clock = this.document.sky
      if (clock?.mode === 'live' && clock.origin) this.setSkyClock({ ...clock, since: Date.now() })
      this.world?.setStartupMode(false)
      this.options.canvas.dataset.reveal = 'play'
      this.toolbar.setVisible(true)
      this.stopAttract()
      this.view.setPlaying(true)
      this.effects.audio.setSuspended(globalThis.document.hidden)
      this.world?.renderUpdate(this.origin, !!this.quality.buildings, this.session.simulation)
      this.lastTime = null
      if (this.options.clock !== 'manual' && !this.xrActive) this.loop.start()
    } catch (error) {
      if (this.loading === controller) this.stop()
      throw error
    } finally {
      if (this.loading === controller) {
        this.world?.setStartupMode(false)
        this.loading = null
      }
    }
  }

  /** Suspend the frame loop, physics, audio and held input while retaining loaded resources. */
  pause(): void {
    this.assertAlive()
    this.touchDriving?.setActive(false)
    this.touchFlight?.setActive(false)
    this.touchWalk?.setActive(false)
    this.game.pause()
    this.loop.stop()
    this.releaseInput()
    this.effects.audio.setSuspended(true)
    this.lastTime = null
  }
  /** Resume paused gameplay and automatic scheduling; manual-clock hosts still supply ticks. */
  resume(): void {
    this.assertAlive()
    this.game.resume()
    this.effects.audio.setSuspended(document.hidden)
    this.lastTime = null
    if (this.session.state === 'playing' && this.options.clock !== 'manual' && !this.xrActive)
      this.loop.start()
  }
  /** Cancel loading and reset gameplay/presentation for replay while retaining reusable renderer resources. */
  stop(): void {
    this.toolbar?.setVisible(false)
    this.placeLookup.reset()
    if (this.disposed) return
    this.terrainLoad?.abort()
    this.terrainLoad = null
    this.loading?.abort()
    this.loading = null
    this.loop.stop()
    this.world?.renderUpdate(this.origin, !!this.quality.buildings, null)
    this.touchDriving?.setActive(false)
    this.touchFlight?.setActive(false)
    this.touchWalk?.setActive(false)
    this.monitors.hide()
    this.pointerFree = false
    this.remoteViews.dispose()
    this.fieldLighting?.lights.reset()
    this.weaponDrawn = false
    this.heldWeapon?.dispose()
    this.heldWeapon = null
    this.heldDrawn = false
    this.clearPickups()
    this.accidentReplacement?.clear()
    this.drivingPrepared.clear()
    this.sidearmAimPreview = false
    if (this.sidearm) {
      this.sidearm.visible = false
      this.sidearm.reset()
      this.xrLoadout?.pistols[1]?.weapon.dispose()
      this.xrLoadout?.dispose()
      this.xrLoadout = null
    }
    this.casingMotion?.reset()
    this.casingMeshes?.sync([])
    this.cartridgeMotion?.reset()
    this.cartridgeMeshes?.sync([])
    this.magazineMotion?.reset()
    this.droppedMagazines.clear()
    this.magazineMeshes?.sync([])
    this.gallery.reset()
    this.gallery.update(this.view, false, 0)
    this.game.stop()
    this.releaseInput()
    this.view.setPlaying(false)
    this.effects.updateAudio(null, this.document, this.camera.position)
    this.effects.updateTires(null, 0, this.origin)
    this.lastTime = null
  }
  /** Host-owned scheduling is exclusive with the automatic loop. Time is in milliseconds. */
  tick(time: number): void {
    this.assertAlive()
    if (this.options.clock !== 'manual') throw new Error('tick requires a manual clock')
    if (!this.xrActive) this.frame(time)
  }
  /** Fit renderer and projection to canvas CSS dimensions; ignore notifications after disposal. */
  resize(): void {
    if (this.disposed || this.renderer.xr.isPresenting) return
    const width = Math.max(1, this.options.canvas.clientWidth)
    const height = Math.max(1, this.options.canvas.clientHeight)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }
  /** Release GPU/audio/DOM listeners and restore canvas tab index. Idempotent and terminal. */
  dispose(): void {
    this.versionLabel?.remove()
    this.usbFeedback.dispose()
    this.usbControllers.reset()
    if (this.disposed) return
    this.stopAttract()
    this.stop()
    this.disposed = true
    this.renderer.setAnimationLoop(null)
    this.xrSystem?.dispose()
    this.lifetime.abort()
    this.observer.disconnect()
    this.game.dispose()
    this.world?.dispose()
    setPlanetCharts(() => [])
    setNavigationPlaces(() => [])
    setNavigationRoads(() => [])
    this.xrGrab?.dispose()
    this.xrLoadout?.pistols[1]?.weapon.dispose()
    this.xrLoadout?.dispose()
    this.sidearm?.dispose()
    this.heldWeapon?.dispose()
    this.clearPickups()
    this.casingMeshes?.dispose()
    this.magazineMeshes?.dispose()
    this.cartridgeMeshes?.dispose()
    this.weaponLight?.removeFromParent()
    this.weaponLight?.target.removeFromParent()
    this.weaponLight?.dispose()
    this.gallery.dispose()
    this.touchDriving?.dispose()
    this.fireModeBadge?.dispose()
    this.fireModeBadge = null
    this.touchFlight?.dispose()
    this.touchWalk?.dispose()
    this.sceneryPhysics.dispose()
    this.monitors.dispose()
    this.view.dispose()
    this.vehicleWarmup?.dispose()
    this.sky.dispose()
    this.environment.dispose()
    this.fieldLighting?.dispose()
    this.effects.dispose()
    this.pipeline.dispose()
    this.shadows.dispose()
    this.catchFloor.dispose()
    this.weaponControls.dispose()
    this.toolbar.dispose()
    this.hud?.dispose()
    this.wheelDebug.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    if (this.originalTabIndex === null) this.options.canvas.removeAttribute('tabindex')
    else this.options.canvas.setAttribute('tabindex', this.originalTabIndex)
  }

  /** Same simulation and streaming as desktop, with tracked eyes and no screen-space passes. */
  private xrDebug: XRDebugPanel | null = null
  private xrStepPending: Promise<void> | null = null
  private xrStepCarry = 0
  private frameXR(time: number): void {
    GameRuntime.prototype.driveFrame.call(this, GameRuntime.prototype.frameXRSteps.call(this, time))
  }
  /**
   * Advance a frame generator. Inline physics returns plain values and the whole frame runs
   * synchronously, exactly as before. A worker step yields a promise: the frame resumes (and
   * renders) when it resolves, and frames requested meanwhile are skipped.
   */
  private frameBusy = false
  private driveFrame(steps: FrameSteps, resumed = false, sent?: unknown): void {
    if (this.frameBusy && !resumed) return
    for (let next = steps.next(sent); !next.done; next = steps.next(sent)) {
      const value = next.value
      if (value instanceof Promise) {
        this.frameBusy = true
        value.then(
          (result: unknown) => {
            this.frameBusy = false
            // Stopped or paused while the worker stepped: drop the rest of this frame.
            if (this.disposed || this.session.state !== 'playing') return
            try {
              GameRuntime.prototype.driveFrame.call(this, steps, true, result)
            } catch (error) {
              this.pause()
              this.options.onError?.(error)
            }
          },
          (error: unknown) => {
            this.frameBusy = false
            if (this.disposed || this.session.state !== 'playing') return
            this.pause()
            this.options.onError?.(error)
          },
        )
        return
      }
      sent = value
    }
  }
  private *frameXRSteps(time: number): FrameSteps {
    const xr = this.xrSystem!
    const parts = this.xrParts!
    const xrGrab = this.xrGrab!
    const xrForklift = this.xrForklift!
    const started = performance.now()
    const sim = this.session.simulation
    if (!sim || this.session.state !== 'playing') return
    const enabled = xr.visible
    const dt =
      enabled && this.lastTime !== null
        ? Math.min(simulationDefaults.maxFrameSeconds, Math.max(0, (time - this.lastTime) / 1000))
        : 0
    this.lastTime = enabled ? time : null
    if (!enabled) this.releaseInput()
    const vehicle = sim.player.vehicleId
    const info = vehicle ? sim.vehicleInfo(vehicle) : null
    xr.reservedInput = (source) =>
      (this.xrMotorcycle?.owns(source) ?? false) ||
      xrForklift.owns(source) ||
      xr.grabHands.some(
        (hand) =>
          hand.source === source &&
          !!this.xrLoadout?.occupied(hand) &&
          !this.xrLoadout.pistols.some((pistol) => pistol.holder?.source === source),
      )
    xr.interactCalibration(enabled, (source) => {
      const pistol = this.xrLoadout?.pistols.find((p) => p.holder?.source === source)
      return pistol?.weapon.worldMuzzle() ?? null
    })
    const controls = xr.input.read(
      xr.gameplaySources,
      !!info?.flightMode,
      !!vehicle,
      enabled,
      this.weaponDrawn,
    )
    if (vehicle && !info?.flightMode && this.xrLoadout) {
      const freeTrigger = (side: string) => {
        const hand = xr.grabHands.find((h) => h.source?.handedness === side)
        return hand && !this.xrLoadout!.occupied(hand) && !xr.calibrationOwns(hand.source)
          ? (hand.source?.gamepad?.buttons[0]?.value ?? 0)
          : 0
      }
      controls.touch.forward = freeTrigger('right') - freeTrigger('left')
    }
    for (const code of controls.actions) {
      if (code === 'xr.menu') xr.toggleMenu()
      else this.action(code)
    }
    // Keep a stable body heading. Head orientation belongs exclusively to WebXR.
    this.cameraState.yaw += controls.snap
    Object.assign(this.cameraState, {
      mode: sim.player.vehicleId ? 'cockpit' : 'chase',
      firstPerson: true,
      bodycam: false,
      pitch: 0,
      headYaw: 0,
      headPitch: 0,
      walkingMotion: null,
      firstPersonFovOffset: 0,
      entrance: null,
      seatMove: null,
      transition: null,
      lastPose: null,
      lastView: null,
    })
    this.touchDriving?.setActive(false)
    this.touchFlight?.setActive(false)
    this.touchWalk?.setActive(false)
    this.monitors.hide()
    this.world?.flushInstall(streamingDefaults.mobileInstallBudgetMs)
    this.view.flushMapInstall(
      streamingDefaults.mapInstallBudgetMs,
      streamingDefaults.mapInstallCount,
      xr.rig.position,
    )
    const bike =
      !!sim.player.vehicleId &&
      !!this.document.entities.find((e) => e.id === sim.player.vehicleId)?.vehicle?.twoWheeled
    this.xrMotorcycle ??= new parts.XRMotorcycle(xr.calibration)
    const motorcycleInput = this.xrMotorcycle.update(
      xr.grabHands.filter(
        (hand) =>
          !this.xrLoadout?.occupied(hand) &&
          !xr.calibrationOwns(hand.source) &&
          !xrForklift.owns(hand.source),
      ),
      bike ? this.view.motorcycleGrab(sim.player.vehicleId!) : null,
      info?.steer ?? 0,
      enabled,
    )
    if (bike) {
      controls.touch.forward = 0
      controls.touch.right = 0
      controls.touch.brake = false
    }
    const forklift =
      vehicle && this.document.entities.find((e) => e.id === vehicle)?.vehicle?.forklift
    sim.setForkliftInput(
      xrForklift.update(
        enabled
          ? xr.grabHands.filter(
              (h) => !this.xrLoadout?.occupied(h) && !xr.calibrationOwns(h.source),
            )
          : [],
        forklift ? (this.view.objects.get(vehicle!) ?? null) : null,
      ),
    )
    const wheelInput = xrGrab.wheel(
      enabled
        ? xr.grabHands.filter(
            (hand) =>
              !this.xrLoadout?.occupied(hand) &&
              !xr.calibrationOwns(hand.source) &&
              !xrForklift.owns(hand.source),
          )
        : [],
      vehicle ? this.view.steeringGrab(vehicle) : null,
      info?.steer ?? 0,
    )
    if (wheelInput !== null) controls.touch.right = wheelInput
    // Tethered PC VR keeps the desktop devices: the USB wheel and pedals, a standard gamepad and
    // the keyboard drive exactly as on the desktop (the same polling, mapping and bindings).
    // Standalone headsets have none of these, so nothing changes there.
    // Unlike the desktop frame, losing focus must not release input here: that would also drop
    // the headset controllers' state. Held keys are simply ignored until the canvas has focus.
    this.keys.expire(performance.now())
    const pad = this.pollGamepad()
    const input = this.game.readInput(dt, {
      keys: this.hasInput() ? this.keys.values : new Set(),
      yaw: this.cameraState.yaw + (sim.player.vehicleId ? 0 : xr.headYaw),
      pad,
      usb: this.usbFrame,
      touch: controls.touch,
      enabled,
    })
    if (bike) {
      input.forward = motorcycleInput.throttle
      input.right = motorcycleInput.steering
      input.frontBrake = motorcycleInput.frontBrake
      input.rearBrake = motorcycleInput.rearBrake
      input.brake = false
    }
    const water = worldWater(this.document.water, this.document.sky)
    const physicsStarted = performance.now()
    // WebXR only shows what renders inside this XR frame callback, so an XR frame never waits for
    // a worker step: it renders the latest state while the step runs, and the time of frames that
    // could not start a step joins the next one (capped). Inline physics is unchanged.
    if (!this.xrStepPending) {
      const stepped = this.game.step(dt + this.xrStepCarry, input, water.level, time)
      this.xrStepCarry = 0
      if (stepped instanceof Promise) {
        this.xrStepPending = stepped.then(
          () => {
            this.xrStepPending = null
          },
          (error: unknown) => {
            this.xrStepPending = null
            if (this.disposed) return
            this.pause()
            this.options.onError?.(error)
          },
        )
      }
    } else this.xrStepCarry = Math.min(this.xrStepCarry + dt, simulationDefaults.maxFrameSeconds)
    const physicsMs = performance.now() - physicsStarted
    if (this.world) this.game.streaming.update(this.world, sim, this.document, time)
    this.view.sync(sim, dt, true, 0, 0)
    // Own body never shows in the headset (also during ejection / bike recovery), so no helmet
    // shell or head pieces sit inside the eyes.
    this.view.avatar.visible = false
    this.game.updateCamera(this.view, xr.anchorCamera, time, dt)
    const eye = xr.anchorCamera.position.clone()
    const rotation = xr.anchorCamera.quaternion.clone()
    if (xr.quality.horizonLock) {
      // Comfort: the rig follows the vehicle heading only. Pitch, roll, lean and suspension
      // bounce of the cockpit camera would tilt the whole world inside the headset, which the
      // inner ear does not feel (main cause of VR sickness); the head pose stays WebXR's alone.
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rotation)
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-forward.x, -forward.z))
    }
    this.origin.set(0, 0, 0)
    if (
      new THREE.Vector3(...sim.player.position).length() > streamingDefaults.floatingOriginDistance
    )
      this.origin.fromArray(sim.player.position)
    this.view.root.position.copy(this.origin).negate()
    this.world?.renderUpdate(this.origin, !!this.quality.buildings, sim)
    const disk = sim.catchDisk()
    if (disk) this.catchFloor.show(disk.position, disk.rotation, this.origin)
    else this.catchFloor.hide()
    this.environment.updateSky(
      this.sky,
      eye,
      this.origin,
      this.document.sky ?? { mode: 'live' },
      this.quality.fog,
    )
    if (this.sky.enabled) this.environment.applyLighting(this.sky, this.planet.sun)
    this.view.night = this.sky.enabled && this.sky.atmosphere.day < lightingDefaults.nightThreshold
    this.view.daylight = this.sky.enabled ? this.sky.atmosphere.day : 1
    // A solid background is stereo-safe; the desktop atmosphere/DOF/mirrors render to 2D targets.
    this.scene.background = new THREE.Color(this.view.night ? '#101827' : '#93b7cd')
    this.scene.fog = reuseFog(
      this.scene.fog,
      this.scene.background,
      this.quality.fog * 0.75,
      this.quality.fog,
    )
    this.sun.visible = true
    this.cull(eye)
    xr.anchor(eye.clone().sub(this.origin), rotation)
    xr.calibrationScreen?.sync(this.camera, this.origin, enabled, time)
    const head = this.camera.getWorldPosition(new THREE.Vector3()).add(this.origin)
    this.effects.audio.setListener(
      head.toArray(),
      this.camera.getWorldQuaternion(new THREE.Quaternion()).toArray(),
      info?.speedKmh ?? 0,
    )
    this.gallery.update(this.view, true, dt)
    this.view.tracers.update(time)
    this.view.impacts.setLimit(xr.quality.impactLimit)
    this.casingMotion?.setLimit(xr.quality.casingLimit)
    this.view.sparks.enabled = xr.quality.sparks
    this.view.sparks.update(time)
    this.view.destruction.update(dt, this.smokeOn, (from, direction, length, excludeEntityId) => {
      const hit = sim.shoot(
        from.toArray() as Vec3Tuple,
        direction.toArray() as Vec3Tuple,
        length,
        0,
        excludeEntityId,
      )
      return hit
        ? { point: new THREE.Vector3(...hit.point), normal: new THREE.Vector3(...hit.normal) }
        : null
    })
    if (this.sidearm) {
      this.xrLoadout ??= new parts.XRLoadout(
        this.scene,
        [this.sidearm, this.createSidearm(this.sidearm.preset!)],
        xr.calibration,
      )
      const loadout = this.xrLoadout
      loadout.showVest = xr.quality.showVest
      const height = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y
      const events = loadout.update(
        xr.grabHands.filter(
          (hand) =>
            loadout.occupied(hand) ||
            (!xr.calibrationOwns(hand.source) &&
              !this.xrMotorcycle?.owns(hand.source) &&
              !xrForklift.owns(hand.source)),
        ),
        this.camera,
        this.origin,
        time,
        dt,
        enabled && this.weaponOwned,
        height,
        (from, distance) => {
          const hit = sim.shoot(from.clone().add(this.origin).toArray(), [0, -1, 0], distance, 0)
          return hit ? new THREE.Vector3(...hit.point).sub(this.origin) : null
        },
        (weapon) =>
          this.effects.audio.weaponSound(
            'slide-back',
            weapon.worldMuzzle()?.add(this.origin).toArray(),
          ),
      )
      this.weaponDrawn = loadout.pistols.some((p) => !!p.holder)
      this.magazineAction = null
      for (const [index, pistol] of loadout.pistols.entries()) {
        const weapon = pistol.weapon
        weapon.setTuning(this.weaponTuning)
        weapon.flashTuning = this.flashSettings
        weapon.setSmokeEnabled(this.smokeOn)
        const down =
          weapon.visible &&
          pistol.gripMode === 'handle' &&
          !!pistol.holder?.source?.gamepad?.buttons[0]?.pressed &&
          !loadout.slideHeld(pistol) &&
          !xr.calibrationOwns(pistol.holder?.source ?? null)
        this.fireRequested = down && !pistol.triggerDown
        this.triggerReleased = !down
        this.triggerDown = pistol.triggerDown = down
        this.updateSidearm(
          sim,
          time,
          dt,
          false,
          true,
          false,
          events.get(weapon),
          weapon,
          index === loadout.pistols.length - 1,
        )
        if (weapon.visible) weapon.syncTracked(loadout.mount(pistol), time, height)
        weapon.syncMuzzleLight(time, this.scene, this.camera, false)
      }
      this.fireRequested = this.triggerReleased = this.triggerDown = false
      this.updateSidearmLaser(sim, time, true)
      loadout.updateLasers(time, this.camera.fov, (origin, direction, range) => {
        const hit = sim.shoot(
          origin.clone().add(this.origin).toArray(),
          direction.toArray(),
          range,
          0,
        )
        return hit ? new THREE.Vector3(...hit.point).sub(this.origin) : null
      })
    }
    this.updateHeadlamp(this.camera)
    this.renderer.info.reset()
    const shadowEnabled = this.renderer.shadowMap.enabled
    const xrShadows = xr.quality.shadows && this.shadows.enabled
    this.renderer.shadowMap.enabled = xrShadows
    const shadowLights = this.shadows.lights.map((light) => ({ light, visible: light.visible }))
    for (const { light } of shadowLights) light.visible = xrShadows
    this.sun.visible = !xrShadows
    if (xrShadows) {
      this.shadows.setLightDirection(
        this.sun.target.position.clone().sub(this.sun.position).normalize(),
      )
      this.shadows.setLightIntensity(this.sun.intensity)
      this.shadows.setLightColor(this.sun.color)
      this.shadows.update(this.camera, this.origin)
      this.renderer.shadowMap.needsUpdate = true
    }
    const hiddenWheels =
      xr.quality.hideOwnWheels && sim.player.vehicleId
        ? (this.view.wheels.get(sim.player.vehicleId) ?? []).filter((wheel) => wheel.visible)
        : []
    for (const wheel of hiddenWheels) wheel.visible = false
    const sparkVisible = this.view.sparks.root.visible
    this.view.sparks.root.visible = xr.quality.sparks && sparkVisible
    try {
      this.renderer.render(this.scene, this.camera)
    } finally {
      for (const wheel of hiddenWheels) wheel.visible = true
      this.view.sparks.root.visible = sparkVisible
      this.sun.visible = this.quality.shadows === 0
      this.renderer.shadowMap.enabled = shadowEnabled
      for (const { light, visible } of shadowLights) light.visible = visible
    }
    this.options.canvas.dataset.vehicle = sim.player.vehicleId ?? ''
    this.options.canvas.dataset.cameraMode = 'vr'
    this.options.canvas.dataset.xrCalls = String(this.renderer.info.render.calls)
    this.effects.updateAudio(sim, this.document, eye)
    if (enabled && isVRMode(activePlayMode())) {
      this.xrDebug ??= new XRDebugPanel(this.camera, this)
      const layer = this.renderer.xr.getBaseLayer?.() as
        { framebufferWidth?: number; framebufferHeight?: number } | null | undefined
      const tiles = this.world?.cellStats
      this.xrDebug.sample({
        time,
        cpuMs: performance.now() - started,
        physicsMs,
        calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        framebuffer:
          layer?.framebufferWidth && layer.framebufferHeight
            ? [layer.framebufferWidth, layer.framebufferHeight]
            : null,
        tiles: tiles
          ? { loaded: tiles.loaded, visible: tiles.visible, pending: tiles.pending }
          : null,
        ...this.streaming,
      })
    }
    if (enabled)
      xr.recordStats(
        time,
        performance.now() - started,
        physicsMs,
        this.renderer.info.render.calls,
        this.renderer.info.render.triangles,
      )
    this.options.onFrame?.({
      speedKmh: sim.player.speed * 3.6,
      gear: info?.gear ?? null,
      gearLabel: null,
      location: localToGeo(this.document.geography!, sim.player.position),
      controls: this.controlSurfaces(sim),
    })
  }

  /** Run one desktop frame; with the physics worker it pauses at the step until the state arrives. */
  private frame(time: number): void {
    // Called through the prototype so hosts and tests may invoke it on a partial runtime.
    GameRuntime.prototype.driveFrame.call(this, GameRuntime.prototype.frameSteps.call(this, time))
  }
  private *frameSteps(time: number): FrameSteps {
    const sim = this.session.simulation
    if (this.disposed || !sim || this.session.state !== 'playing') return
    if (!Number.isFinite(time)) throw new Error('Invalid frame time')
    const measuring = !!this.options.onDiagnostics || !!this.xrSystem?.onStats
    const cpuStart = performance.now()
    const programsBefore = this.renderer.info.programs?.length ?? 0
    const programIdBefore = this.options.performanceLog
      ? latestProgramId(this.renderer.info.programs ?? [])
      : -1
    const frameMs = this.lastTime === null ? 0 : Math.max(0, time - this.lastTime)
    if (measuring) this.renderer.info.reset()
    const dt =
      this.lastTime === null
        ? 0
        : Math.min(simulationDefaults.maxFrameSeconds, Math.max(0, (time - this.lastTime) / 1000))
    this.lastTime = time
    const playing = this.session.state === 'playing' && !document.hidden
    if (this.inspector) {
      if (playing) this.inspectionFrame(time, dt, frameMs)
      return
    }
    const controls = this.controlSurfaces(sim)
    const rigs = touchRigState(controls.touch, playing)
    this.touchDriving?.setActive(rigs.driving.active)
    if (this.touchDriving) this.touchDriving.root.hidden = rigs.driving.hidden
    this.touchFlight?.setActive(rigs.flight.active)
    // On-foot sticks: only while walking (no vehicle) and playing.
    this.touchWalk?.setActive(playing && !sim.player.vehicleId)
    this.weaponControls.setActive(playing && !sim.player.vehicleId && this.weaponDrawn)
    if (document.hidden) return
    if (this.beamFlash && this.beamFlash.vehicle !== this.session.simulation?.player.vehicleId)
      this.releaseBeamFlash()
    if (!this.hasInput()) this.releaseInput()
    this.keys.expire(performance.now())
    this.canvasDiagnostics(frameMs)
    this.observeResolution(frameMs, time)
    const pad = this.pollGamepad()
    if (
      this.keys.values.size ||
      pad?.buttons.some((button) => button.pressed) ||
      pad?.axes.some((axis) => Math.abs(axis) > 0.15)
    )
      this.cameraActivity()
    this.idleCinematic.update(
      this.cameraState,
      !!sim.player.vehicleId,
      time,
      playing &&
        !this.view.vehicleMenu(sim.player.vehicleId ?? '')?.open &&
        !this.startSequence &&
        !sim.playerEjection &&
        !sim.playerBikeRecovery,
    )
    const installStart = performance.now()
    this.world?.flushInstall(
      this.quality.preset === 'mobile' || this.quality.preset === 'minimal'
        ? streamingDefaults.mobileInstallBudgetMs
        : streamingDefaults.installBudgetMs,
    )
    this.view.flushMapInstall(
      streamingDefaults.mapInstallBudgetMs,
      streamingDefaults.mapInstallCount,
      this.camera.position,
    )
    this.world?.renderUpdate(this.origin, !!this.quality.buildings, sim)
    const installMs = performance.now() - installStart
    const helmTouch = this.monitors.flightInput()
    const flightTouch = this.touchFlight?.input() ?? {
      forward: 0,
      right: 0,
      lift: 0,
      turn: 0,
      brake: false,
    }
    const walkTouch = this.touchWalk?.input() ?? { forward: 0, right: 0, look: { x: 0, y: 0 } }
    if (walkTouch.look.x || walkTouch.look.y) {
      const look = this.cameraState
      look.lastLookTime = performance.now()
      look.yaw -= walkTouch.look.x * touchLookRate * dt
      look.pitch = THREE.MathUtils.clamp(
        look.pitch + walkTouch.look.y * touchLookPitchRate * dt,
        -controlDefaults.pitchLimit,
        controlDefaults.pitchLimit,
      )
    }
    const input = this.game.readInput(dt, {
      keys: this.keys.values,
      yaw: this.cameraState.yaw,
      pad,
      usb: this.usbFrame,
      touch: {
        forward: Math.max(
          -1,
          Math.min(1, helmTouch.forward + flightTouch.forward + walkTouch.forward),
        ),
        right: Math.max(-1, Math.min(1, helmTouch.right + flightTouch.right + walkTouch.right)),
        lift: Math.max(-1, Math.min(1, helmTouch.lift + flightTouch.lift)),
        turn: Math.max(-1, Math.min(1, helmTouch.turn + flightTouch.turn)),
        brake: helmTouch.brake || flightTouch.brake,
      },
      driving: rigs.driving.seatedRoad
        ? this.touchDriving?.input()
        : { forward: 0, right: 0, brake: false },
      enabled: this.hasInput(),
      menuOpen: !!(sim.player.vehicleId && this.view.vehicleMenu(sim.player.vehicleId)?.open),
    })
    if (
      input.forward ||
      input.right ||
      input.brake ||
      input.lift ||
      input.turn ||
      walkTouch.look.x ||
      walkTouch.look.y
    )
      this.cameraActivity()
    if (this.startSequence && (input.forward || input.right || input.brake))
      this.applyStartCamera(this.startSequence.skip(), sim)
    const hydraulicContext = this.controlContext
    const hydraulicAxis = (
      positive: Parameters<typeof actionAxis>[1],
      negative: Parameters<typeof actionAxis>[2],
    ) => (this.hasInput() ? actionAxis(this.keys.values, positive, negative, hydraulicContext) : 0)
    sim.setForkliftInput([
      hydraulicAxis('forklift.liftUp', 'forklift.liftDown') +
        (this.usbFrame.axes.hydraulicLift ?? 0),
      hydraulicAxis('forklift.tiltUp', 'forklift.tiltDown') +
        (this.usbFrame.axes.hydraulicTilt ?? 0),
      hydraulicAxis('forklift.sideRight', 'forklift.sideLeft') +
        (this.usbFrame.axes.hydraulicSide ?? 0),
    ])
    const vehicleId = sim.player.vehicleId
    if (vehicleId) {
      this.view.sampleVehicleLightEnvironment(
        vehicleId,
        this.sky.enabled && this.sky.atmosphere.day < lightingDefaults.vehicleAutoDarkThreshold,
        playing ? dt : 0,
      )
    }
    this.touchDriving?.setDriving(rigs.driving.seatedRoad)
    this.touchDriving?.setPilot(!!vehicleId && this.cameraState.mode === 'cockpit')
    this.touchDriving?.reflect(input)
    const water = worldWater(this.document.water, this.document.sky)
    this.environment.ocean.setLevel(water.level)
    const physicsStart = performance.now()
    const crossing = (yield this.game.step(dt, input, water.level, time)) as StepResult
    this.usbFeedback.update(
      vehicleId ? sim.vehicleFeedback(vehicleId) : null,
      availableGamepads(),
      this.hasInput() && !this.controlContext.menu,
    )
    const physicsMs = performance.now() - physicsStart
    if (crossing)
      this.options.onMessage?.(
        crossing.blocked ? this.text('Passage blocked') : this.text('Stargate crossed'),
      )
    const streamStarted = performance.now()
    if (this.world) this.game.streaming.update(this.world, sim, this.document, time)
    this.syncPickupGround(sim, dt)
    const streamMs = performance.now() - streamStarted
    const presentationStarted = performance.now()
    this.view.night = this.sky.enabled && this.sky.atmosphere.day < lightingDefaults.nightThreshold
    this.view.daylight = this.sky.enabled ? this.sky.atmosphere.day : 1
    this.view.smokeEnabled = this.smokeOn
    this.view.sync(
      sim,
      dt,
      isFirstPersonView(this.cameraState, !!sim.player.vehicleId),
      this.cameraState.headYaw,
      this.cameraState.headPitch,
    )
    const presentationMs = performance.now() - presentationStarted
    this.advanceStartCameras(sim, time)
    const bodycamActive =
      !!this.cameraState.bodycam &&
      this.weaponDrawn &&
      !sim.player.vehicleId &&
      isFirstPersonView(this.cameraState, false)
    if (bodycamActive) {
      const follow = this.bodycam.step(dt, this.sidearm?.isAiming ?? false)
      this.cameraState.yaw += follow.yaw
      this.cameraState.pitch += follow.pitch
    } else this.bodycam.reset()
    if (this.sidearm) {
      this.sidearm.bodycamEnabled = bodycamActive
      this.sidearm.bodycamYaw = this.bodycam.yaw
      this.sidearm.bodycamPitch = this.bodycam.pitch
    }
    const targetEyes = isFirstPersonView(this.cameraState, !!sim.player.vehicleId)
    if (targetEyes && !sim.player.vehicleId && !sim.playerEjection && !sim.playerBikeRecovery) {
      this.cameraState.walkingMotion = this.actionCam.step(dt, {
        speed: this.actionCamOn
          ? sim.player.speed * Math.min(1, Math.hypot(input.forward, input.right))
          : 0,
        // The geographic demo's hover walker is supported without foot contacts.
        grounded: sim.player.grounded || sim.options.playerMode === 'hover',
        right: this.actionCamOn ? input.right : 0,
        yaw: this.cameraState.yaw,
        aim: this.sidearm?.aimTransition ?? 0,
      })
    } else {
      this.actionCam.reset()
      this.cameraState.walkingMotion = null
    }
    const fovOffsetTarget =
      this.cameraState.bodycam && targetEyes
        ? normalViewTuning.extraFovDegrees *
          (1 - (bodycamActive ? (this.sidearm?.aimTransition ?? 0) : 0))
        : 0
    const currentFovOffset = this.cameraState.firstPersonFovOffset ?? fovOffsetTarget
    this.cameraState.firstPersonFovOffset =
      currentFovOffset +
      (fovOffsetTarget - currentFovOffset) *
        (1 - Math.exp(-normalViewTuning.fovResponse * Math.min(dt, 0.1)))
    const { player, info } = this.game.updateCamera(this.view, this.camera, time, dt)
    const canvas = this.options.canvas
    canvas.dataset.vehicle = player.vehicleId ?? ''
    canvas.dataset.interior = player.interiorId ?? ''
    canvas.dataset.cameraMode = gameCameraView(this.cameraState, !!player.vehicleId)
    const eyes = isFirstPersonView(this.cameraState, !!player.vehicleId)
    const canLean =
      eyes && !player.vehicleId && this.weaponDrawn && !!this.sidearm?.isAiming && this.hasInput()
    const leanTarget = canLean
      ? actionAxis(this.keys.values, 'lean.right', 'lean.left', this.controlContext)
      : 0
    this.aimLean += (leanTarget - this.aimLean) * (1 - Math.exp(-14 * Math.min(dt, 0.1)))
    if (!eyes || player.vehicleId) this.aimLean = 0
    if (Math.abs(this.aimLean) > 0.0001) {
      const origin = this.camera.position.clone()
      const lateral = new THREE.Vector3(Math.sign(this.aimLean), 0, 0).applyQuaternion(
        this.camera.quaternion,
      )
      let distance = Math.abs(this.aimLean) * 0.23
      const wall = sim.shoot(origin.toArray(), lateral.toArray(), distance + 0.08, 0)
      if (wall)
        distance = Math.min(
          distance,
          Math.max(0, origin.distanceTo(new THREE.Vector3(...wall.point)) - 0.08),
        )
      this.camera.position.addScaledVector(lateral, distance)
      this.camera.rotateZ(
        ((-Math.sign(this.aimLean) * distance) / 0.23) * THREE.MathUtils.degToRad(12),
      )
      this.camera.updateMatrixWorld(true)
    }
    canvas.dataset.aimLean = this.aimLean.toFixed(3)
    this.effects.audio.setListener(
      this.camera.position.toArray(),
      this.camera.quaternion.toArray(),
      player.vehicleId ? sim.vehicleInfo(player.vehicleId).speedKmh : 0,
    )
    canvas.dataset.mapHeight = String(Math.round(this.cameraState.mapHeight))
    canvas.dataset.vehicleEntrance = this.cameraState.entrance ? 'active' : 'complete'
    if (crossing) canvas.dataset.portalCrossings = String(crossing.sequence)
    this.gallery.update(this.view, true, dt)
    this.view.tracers.update(time)
    this.view.scrapeSparks(sim, time)
    this.view.impacts.setLimit(this.xrQuality.impactLimit)
    this.casingMotion?.setLimit(this.xrQuality.casingLimit)
    this.view.sparks.enabled = this.xrQuality.sparks
    this.view.sparks.update(time)
    const replacement = playing ? this.accidentReplacement?.step(dt) : null
    if (replacement && this.world) {
      const occupied = sim.vehicleList().map(({ id, entity }) => ({
        position: sim.entityTransform(id).position,
        size: entity.size,
      }))
      const spot = replacementRoadSpot(
        sim.player.position,
        sim.player.vehicleId ? sim.player.yaw : this.cameraState.yaw,
        replacement[0],
        navigationRoads().filter((road) => road.carriageway),
        occupied,
      )
      if (spot)
        void this.placeVehicle(replacement, spot.position, spot.yaw, 8000).catch((error) =>
          console.warn('Accident replacement unavailable', error),
        )
    }
    for (const explosion of sim.consumeExplosions()) {
      const object = this.view.objects.get(explosion.entityId)
      if (object)
        this.view.destruction.explode(
          explosion.entityId,
          object,
          this.view.wreckParts(explosion.entityId).filter((part) => part.parent === this.view.root),
        )
      this.effects.audio.destruction(explosion.position)
      if (
        (explosion.occupied || sim.playerEjection?.vehicleId === explosion.entityId) &&
        explosion.cause === 'impact'
      ) {
        this.accidentReplacement ??= new AccidentReplacement(
          this.options.accidentReplacementVehicles ?? [],
        )
        this.accidentReplacement.schedule()
      }
    }
    for (const entity of this.document.entities) {
      if (entity.kind !== 'vehicle') continue
      const object = this.view.objects.get(entity.id)
      if (object)
        this.view.destruction.setDamage(entity.id, object, sim.vehicleDamage(entity.id).health)
    }
    this.view.destruction.update(dt, this.smokeOn, (from, direction, length, excludeEntityId) => {
      const hit = sim.shoot(
        from.toArray() as Vec3Tuple,
        direction.toArray() as Vec3Tuple,
        length,
        0,
        excludeEntityId,
      )
      return hit
        ? { point: new THREE.Vector3(...hit.point), normal: new THREE.Vector3(...hit.normal) }
        : null
    })
    if (this.heldWeapon) {
      this.heldWeapon.visible = this.heldDrawn && !sim.player.vehicleId
      this.heldWeapon.syncWorld(this.view.avatar, time, eyes)
    }
    if (this.sidearm) {
      this.sidearm.setTuning(this.weaponTuning)
      this.sidearm.slidePosePreview =
        this.sidearmAimPreview && !!this.weaponPosePreview?.startsWith('slide')
      this.sidearm.poseTuning = this.weaponPoses
      this.sidearm.playerWheel = this.sidearmAimPreview ? normalizeWeaponWheel() : this.weaponWheel
      this.sidearm.setSmokeEnabled(this.smokeOn)
      this.sidearm.visible = this.weaponDrawn || this.sidearmAimPreview
      if (this.weaponControls.aiming) this.sidearm.setAiming(true)
      this.updateSidearm(sim, time, dt, eyes)
      if (this.sidearmAimPreview)
        this.sidearm.setAiming(
          this.weaponPosePreview === null ||
            this.weaponPosePreview === 'aimed' ||
            this.weaponPosePreview.endsWith('Aimed'),
        )
      let aim: THREE.Vector3 | undefined
      if (this.sidearm.visible && !eyes && !this.sidearmAimPreview) {
        const overhead = this.cameraState.mode === 'map'
        const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(
          overhead
            ? this.view.avatar.getWorldQuaternion(new THREE.Quaternion())
            : this.camera.quaternion,
        )
        const rayOrigin = overhead
          ? this.view.avatar.getWorldPosition(new THREE.Vector3()).sub(this.view.root.position)
          : this.camera.position
        const hit = sim.shoot(rayOrigin.toArray(), direction.toArray(), this.sidearm.range, 0)
        aim = hit
          ? new THREE.Vector3(...hit.point)
          : rayOrigin.clone().addScaledVector(direction, this.sidearm.range)
        aim.add(this.view.root.position)
      }
      this.sidearm.syncWorld(
        this.view.avatar,
        time,
        eyes || this.sidearmAimPreview,
        aim,
        this.cameraState.mode === 'map'
          ? new THREE.Vector3(0, 1, 0).applyQuaternion(
              this.view.avatar.getWorldQuaternion(new THREE.Quaternion()),
            )
          : this.camera.up,
      )
      if (!this.fireModeBadge && this.options.canvas.parentElement)
        this.fireModeBadge = new FireModeBadge(this.options.canvas.parentElement)
      this.fireModeBadge?.show(
        this.sidearm.visible ? fireModeLabel(this.sidearm.fireMode, this.sidearm.selectFire) : null,
      )
      this.options.canvas.dataset.fireMode = this.sidearm.fireMode
      this.updateSidearmLaser(sim, time)
    } else {
      this.view.laser.enabled = false
    }
    this.fireRequested = false
    this.triggerReleased = false
    this.magazineAction = null
    const eye = this.camera.position.clone()
    this.origin.set(0, 0, 0)
    if (new THREE.Vector3(...player.position).length() > streamingDefaults.floatingOriginDistance)
      this.origin.fromArray(player.position)
    if (this.wheelDebug.isEnabled) {
      const surfaces: THREE.Object3D[] = []
      for (const entity of this.document.entities) {
        const object = this.view.objects.get(entity.id)
        if (object && (entity.terrain || entity.road)) surfaces.push(object)
      }
      this.world?.root.traverseVisible((object) => {
        if (
          (object as THREE.Mesh).isMesh &&
          ['Terrain', 'Roads'].includes(object.userData.category)
        )
          surfaces.push(object)
      })
      this.wheelDebug.setTerrainMeshes(surfaces)
      this.wheelDebug.update(sim, player.vehicleId, this.origin)
    }
    {
      this.placeLookup.request(player.position, (city, street) =>
        this.touchDriving?.setPlace(city, street),
      )
      const vid = player.vehicleId
      const sim = this.session.simulation
      if (vid && sim) {
        try {
          const xf = sim.entityTransform(vid)
          const [px, py, pz] = xf.position
          const [qx, qy, qz, qw] = xf.rotation
          const speed = player.speed
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
            new THREE.Quaternion(qx, qy, qz, qw),
          )
          const vel = forward.multiplyScalar(speed)
          this.flipCinematic.update(
            time,
            dt,
            true,
            {
              position: { x: px, y: py, z: pz },
              quaternion: { x: qx, y: qy, z: qz, w: qw },
              linvel: () => ({ x: vel.x, y: vel.y, z: vel.z }),
              angvel: () => {
                // Best-effort: derive spin from recent up-axis change inside FlipCinematic window.
                return { x: 0, y: 0, z: 0 }
              },
              leanAllowance: sim.vehicleInfo(vid).leanAllowance,
            },
            this.camera,
            this.cameraState,
          )
        } catch {
          this.flipCinematic.update(time, dt, false, null, this.camera, this.cameraState)
        }
      } else {
        this.flipCinematic.update(time, dt, false, null, this.camera, this.cameraState)
      }
    }
    const nearbyPickup = this.nearbyPickup(sim)
    canvas.dataset.pickup = nearbyPickup?.id ?? ''
    canvas.dataset.weaponOwned = String(this.weaponOwned)
    this.hud?.update({
      showSpeed: controls.speed,
      showGear: controls.gear,
      speedKmh: player.speed * 3.6,
      gear: info?.gear ?? null,
      gearLabel: info
        ? gearLabel(
            info.gear,
            info.manualTransmission,
            info.parked,
            info.engineModes && info.engineMode === 'beast',
          )
        : null,
      vehicle:
        this.document.entities.find((entity) => entity.id === player.vehicleId)?.name ?? null,
      cameraMode: canvas.dataset.cameraMode!,
      interaction: player.vehicleId
        ? controlsHint(this.controlContext, [
            'interact',
            'camera',
            'lights',
            'gps',
            'highBeam',
            'signal.left',
            'signal.right',
            'debug.wheels',
            'vehicle.menu',
            'forklift.menu',
          ])
        : nearbyPickup
          ? this.text('E pick up {0}', nearbyPickup.name)
          : 'WASD move · Space jump · E enter · V camera · C crouch · C+Space prone',
      wheelDebug: this.wheelDebug.formatHud(),
    })
    const audioStarted = performance.now()
    this.effects.updateAudio(sim, this.document, eye)
    const audioMs = performance.now() - audioStarted
    this.effects.updateTires(sim, dt, this.origin)
    this.environment.updateSea(
      this.document.geography,
      eye,
      this.origin,
      Math.max(this.quality.distance, this.quality.fog * 2),
      time,
      this.planet.sea,
    )
    const height = this.environment.updateSky(
      this.sky,
      eye,
      this.origin,
      this.document.sky ?? { mode: 'live' },
      this.quality.fog,
    )
    const previousFar = this.camera.far
    if (this.sky.enabled) {
      const direction = this.environment.applyLighting(this.sky, this.planet.sun)
      this.sun.intensity *= this.lighting.sun
      this.ambient.intensity *= this.lighting.ambient
      this.shadows.setLightDirection(direction.clone().negate())
      this.shadows.setLightIntensity(this.sun.intensity)
      this.shadows.setLightColor(this.sun.color)
      this.camera.far = downwardViewFar(
        Math.hypot(
          Math.max(height >= 2000 ? 80000 : 12000, this.quality.distance + 500),
          Math.max(0, height),
        ),
        eye.y,
        this.camera.getWorldDirection(this.viewForward).y,
        this.camera.fov,
        this.camera.aspect,
      )
    } else {
      this.scene.background = new THREE.Color('#a6bbd5')
      this.scene.fog = reuseFog(
        this.scene.fog,
        '#a6bbd5',
        this.quality.fog * 0.75,
        this.quality.fog,
      )
    }
    if (this.camera.far !== previousFar) this.camera.updateProjectionMatrix()
    this.view.root.position.copy(this.origin).negate()
    this.world?.renderUpdate(this.origin, !!this.quality.buildings, sim)
    const disk = sim.catchDisk()
    if (disk) this.catchFloor.show(disk.position, disk.rotation, this.origin)
    else this.catchFloor.hide()
    this.view.streetlights.update(eye, this.view.night, this.quality.distance)
    this.cull(eye)
    this.monitors.update(
      sim,
      this.document,
      this.camera,
      this.view.portalTablets,
      this.view.helmScreens,
      this.view.touchScreens,
      this.view.flightScreens,
      this.view.placeScreens,
      this.view.systemScreens,
      this.origin,
      this.cameraState.mode === 'cockpit',
    )
    const lightsStarted = performance.now()
    this.fieldLighting?.update({
      origin: this.document.geography,
      eye,
      renderOrigin: this.origin,
      night: this.view.night,
      time,
      heightAt: (p) => this.world?.groundHeight(p),
      tiles: this.world?.collectActiveMapTiles(this.fieldLightTiles) ?? [],
      scenery: this.fieldPoles,
    })
    this.camera.position.sub(this.origin)
    this.updateHeadlamp(this.camera, eyes)
    for (const [id, hud] of this.view.shipHuds) {
      const inside =
        (player.interiorId === id && eyes) ||
        (player.vehicleId === id && this.cameraState.mode === 'cockpit')
      hud.update(this.camera, this.origin, time, inside ? sim.vehicleInfo(id) : null)
    }
    this.applyLightTuning()
    if (this.sidearm) this.sidearm.flashTuning = this.flashSettings
    this.sidearm?.syncMuzzleLight(time, this.scene, this.camera, eyes || this.sidearmAimPreview)
    const lightsMs = performance.now() - lightsStarted
    const renderStarted = performance.now()
    try {
      this.pipeline.render({
        externalViews: this.worldContent
          ? resolveWorldPortalViews(
              this.worldContent,
              this.view.portals,
              (location, document, entity) => this.remoteViews.resolve(location, document, entity),
            )
          : undefined,
        renderer: this.renderer,
        scene: this.scene,
        camera: this.camera,
        view: this.view,
        sky: this.sky,
        clock: this.document.sky ?? { mode: 'live' },
        skyVisible: this.planet.sky,
        origin: this.origin,
        eye,
        ambient: this.ambient,
        lights: [this.sun, ...this.shadows.lights],
        shadows: this.shadows,
        monitors: this.monitors,
        time,
        mirrorVehicle:
          this.quality.mirrors && this.cameraState.mode === 'cockpit' ? player.vehicleId : null,
        shadowsEnabled: this.syncShadowSwitch(),
        localShadowUpdate: this.headlamp.needsShadowPass,
        tunnelFocus:
          bodycamActive && this.tunnelEnabled
            ? (this.sidearm?.aimTransition ?? 0) * (this.sidearm?.playerTunnel ?? 1)
            : undefined,
        depthOfField: this.options.depthOfField ?? !!this.quality.dof,
        cull: (position) => this.cull(position),
      })
      this.sidearm?.render(
        this.renderer,
        time,
        this.camera.aspect,
        eyes || this.sidearmAimPreview,
        this.scene,
        this.camera,
      )
      this.heldWeapon?.render(
        this.renderer,
        time,
        this.camera.aspect,
        eyes,
        this.scene,
        this.camera,
      )
    } finally {
      this.camera.position.copy(eye)
    }
    const cpuMs = performance.now() - cpuStart
    if (this.options.performanceLog && (cpuMs > 50 || frameMs > 100)) {
      const renderMs = performance.now() - renderStarted
      const programsAdded = (this.renderer.info.programs?.length ?? 0) - programsBefore
      this.options.canvas.dataset.stallDetail = `Pausa ${Math.round(frameMs)} ms · CPU ${Math.round(cpuMs)} · render ${Math.round(renderMs)} · terreno ${Math.round(installMs)} · física ${Math.round(physicsMs)} ms · shaders +${programsAdded}`
      this.options.canvas.dataset.stallAt = String(performance.now())
      const sample = {
        atSeconds: +(performance.now() / 1000).toFixed(2),
        frameIntervalMs: +frameMs.toFixed(1),
        cpuMs: +cpuMs.toFixed(1),
        renderMs: +renderMs.toFixed(1),
        physicsMs: +physicsMs.toFixed(1),
        installMs: +installMs.toFixed(1),
        streamingMs: +streamMs.toFixed(1),
        presentationMs: +presentationMs.toFixed(1),
        audioMs: +audioMs.toFixed(1),
        lightsMs: +lightsMs.toFixed(1),
        programsAdded,
        renderPasses: { ...this.pipeline.timings },
        newShaders: describePrograms(this.renderer.info.programs ?? [], programIdBefore).map(
          (shader) => ({
            ...shader,
            pass: this.pipeline.shaderPasses.get(shader.id) ?? 'outside-main-pipeline',
          }),
        ),
        programs: this.renderer.info.programs?.length ?? 0,
        calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        camera: this.cameraState.mode,
        quality: this.quality.preset,
        cellInstalling: canvas.dataset.tileInstallActive === '1',
        cell: canvas.dataset.tileInstallDetail,
        cells: this.world?.cellStats,
      }
      this.stallLog.push(JSON.stringify(sample))
      if (this.stallLog.length > 100) this.stallLog.shift()
      canvas.dataset.stallLog =
        'Nabla performance v2 — milliseconds measured on main thread; frame interval includes previous frame and scheduling, render is CPU submission, not GPU timing.\n' +
        this.stallLog.join('\n')
    }
    this.options.canvas.dataset.portalViews = String(this.pipeline.renderedPortals)
    if (this.options.performanceLog) {
      const threaded = threadedSimulation(sim)
      this.perfMeter.frame(
        threaded ? 'worker' : 'inline',
        {
          frameMs,
          cpuMs: performance.now() - cpuStart,
          physicsMainMs: physicsMs,
          physicsWorkerMs: threaded?.workerStepMs ?? 0,
        },
        performance.now(),
      )
    }
    if (this.options.onDiagnostics) {
      const gpuTiming = this.pipeline.gpuTiming?.finish()
      this.options.onDiagnostics({
        frameMs,
        cpuMs: performance.now() - cpuStart,
        physicsMs,
        installMs,
        calls: frameDrawCalls(this.renderer),
        triangles: this.renderer.info.render.triangles,
        width: this.renderer.domElement.width,
        height: this.renderer.domElement.height,
        droppedSeconds: sim.stats.droppedSeconds,
        gpuTiming,
        backend: this.backend,
        ...(this.backend === 'webgpu'
          ? { webgpuSkipped: webgpuSkippedMaterials(this.renderer) }
          : {}),
      })
    }
    this.xrSystem?.recordStats(
      time,
      performance.now() - cpuStart,
      physicsMs,
      this.renderer.info.render.calls,
      this.renderer.info.render.triangles,
    )
    this.options.onFrame?.({
      speedKmh: player.speed * 3.6,
      gear: info?.gear ?? null,
      gearLabel: info
        ? gearLabel(
            info.gear,
            info.manualTransmission,
            info.parked,
            info.engineModes && info.engineMode === 'beast',
          )
        : null,
      location: this.document.geography
        ? localToGeo(this.document.geography, player.position)
        : null,
      controls,
    })
  }

  /**
   * Render the current camera state once without stepping physics, reading input, audio, HUD
   * or host callbacks, 1 px scissored on the canvas. Programs (shadow and transmission passes
   * included), buffers and textures of that view are built while the host still covers it.
   */
  /** Home pauses physics without touching any body pose, velocity or drivetrain state. */
  private toggleInspection(): void {
    if (this.renderer.xr.isPresenting) return
    this.releaseInput()
    if (this.inspector) {
      this.inspector.returning = true
      this.inspector.position.copy(this.inspector.home)
      this.options.onMessage?.(t('game.back-to-the-vehicle-preparing-terrain'))
    } else {
      this.inspector = new MapInspector(this.camera.position.clone(), this.camera.quaternion)
      this.inspectorState.mode = 'map'
      if (this.session.simulation) this.session.simulation.terrainSupportPaused = true
      this.effects.audio.setSuspended(true)
      this.usbFeedback.stop()
      this.options.onMessage?.(t('game.god-mode-wasd-arrows-mouse-shift-fast-q-e-height'))
    }
    this.lastTime = null
    this.options.canvas.dataset.inspection = this.inspector.returning ? 'returning' : 'active'
  }
  private inspectionFrame(time: number, dt: number, frameMs: number): void {
    const inspector = this.inspector!,
      sim = this.session.simulation!
    if (this.beamFlash && this.beamFlash.vehicle !== this.session.simulation?.player.vehicleId)
      this.releaseBeamFlash()
    if (!this.hasInput()) this.releaseInput()
    this.keys.expire(time)
    inspector.step(this.keys.values, dt)
    const target = inspector.returning
      ? sim.player.position
      : (inspector.position.toArray() as Vec3Tuple)
    this.world?.renderUpdate(this.origin, !!this.quality.buildings, null)
    this.world?.update(target, [0, 0, 0])
    this.world?.flushInstall(streamingDefaults.installBudgetMs)
    this.warmFrame(sim, this.inspectorState, time, false, inspector)
    this.canvasDiagnostics(frameMs)
    if (
      inspector.returning &&
      (!this.world || groundAtSeam(this.world, sim.player.position) !== undefined)
    ) {
      this.world?.renderUpdate(this.origin, !!this.quality.buildings, sim)
      if (this.world && !sim.preparePlanetCollisions()) return
      sim.terrainSupportPaused = false
      this.game.streaming.reset()
      this.inspector = null
      this.lastTime = null
      this.effects.audio.setSuspended(false)
      this.options.canvas.dataset.inspection = 'off'
      this.options.onMessage?.(t('game.driving-resumed'))
    }
  }
  private warmFrame(
    sim: Simulation,
    state: GameCameraState,
    time: number,
    focus = false,
    inspector?: MapInspector,
  ): void {
    this.view.flushMapInstall(
      streamingDefaults.mapInstallBudgetMs * 3,
      streamingDefaults.mapInstallCount * 4,
      this.camera.position,
    )
    this.world?.renderUpdate(this.origin, !!this.quality.buildings, inspector ? null : sim)
    this.view.sync(
      sim,
      0,
      isFirstPersonView(state, !!sim.player.vehicleId),
      state.headYaw,
      state.headPitch,
    )
    const { player } = updateGameCamera(sim, this.view, this.camera, state, time, 0)
    if (inspector) {
      this.camera.position.copy(inspector.position)
      this.camera.quaternion.copy(inspector.rotation)
    }
    const eye = this.camera.position.clone()
    this.origin.set(0, 0, 0)
    const originPosition = inspector ? inspector.position : new THREE.Vector3(...player.position)
    if (originPosition.length() > streamingDefaults.floatingOriginDistance)
      this.origin.copy(originPosition)
    this.environment.updateSea(
      this.document.geography,
      eye,
      this.origin,
      Math.max(this.quality.distance, this.quality.fog * 2),
      time,
      this.planet.sea,
    )
    const height = this.environment.updateSky(
      this.sky,
      eye,
      this.origin,
      this.document.sky ?? { mode: 'live' },
      this.quality.fog,
    )
    if (this.sky.enabled) {
      const direction = this.environment.applyLighting(this.sky, this.planet.sun)
      this.sun.intensity *= this.lighting.sun
      this.ambient.intensity *= this.lighting.ambient
      this.shadows.setLightDirection(direction.clone().negate())
      this.shadows.setLightIntensity(this.sun.intensity)
      this.shadows.setLightColor(this.sun.color)
      this.camera.far = downwardViewFar(
        Math.hypot(
          Math.max(height >= 2000 ? 80000 : 12000, this.quality.distance + 500),
          Math.max(0, height),
        ),
        eye.y,
        this.camera.getWorldDirection(this.viewForward).y,
        this.camera.fov,
        this.camera.aspect,
      )
      this.camera.updateProjectionMatrix()
    }
    this.view.night = this.sky.enabled && this.sky.atmosphere.day < lightingDefaults.nightThreshold
    this.view.daylight = this.sky.enabled ? this.sky.atmosphere.day : 1
    this.view.root.position.copy(this.origin).negate()
    this.world?.renderUpdate(this.origin, !!this.quality.buildings, inspector ? null : sim)
    this.view.streetlights.update(eye, this.view.night, this.quality.distance)
    this.cull(eye)
    this.monitors.update(
      sim,
      this.document,
      this.camera,
      this.view.portalTablets,
      this.view.helmScreens,
      this.view.touchScreens,
      this.view.flightScreens,
      this.view.placeScreens,
      this.view.systemScreens,
      this.origin,
      state.mode === 'cockpit',
    )
    // Field lights (and every other light) as gameplay shows them: the light count is part of
    // each program, so a light that only appears after the reveal recompiles every material.
    this.fieldLighting?.update({
      origin: this.document.geography,
      eye,
      renderOrigin: this.origin,
      night: this.view.night,
      time,
      heightAt: (p) => this.world?.groundHeight(p),
      tiles: this.world?.collectActiveMapTiles(this.fieldLightTiles) ?? [],
      scenery: this.fieldPoles,
    })
    this.camera.position.sub(this.origin)
    const scissor = this.renderer.getScissor(new THREE.Vector4()),
      scissorTest = this.renderer.getScissorTest()
    this.applyLightTuning()
    const weaponVisible = this.sidearm?.visible ?? false
    if (this.sidearm) {
      this.sidearm.visible = !inspector
      this.sidearm.syncWorld(this.view.avatar, time, false)
    }
    try {
      if (!inspector) this.renderer.setScissor(0, 0, 1, 1)
      this.renderer.setScissorTest(!inspector)
      this.pipeline.render({
        renderer: this.renderer,
        scene: this.scene,
        camera: this.camera,
        view: this.view,
        sky: this.sky,
        clock: this.document.sky ?? { mode: 'live' },
        skyVisible: this.planet.sky,
        origin: this.origin,
        eye,
        ambient: this.ambient,
        lights: [this.sun, ...this.shadows.lights],
        shadows: this.shadows,
        monitors: this.monitors,
        time,
        mirrorVehicle: this.quality.mirrors && state.mode === 'cockpit' ? player.vehicleId : null,
        shadowsEnabled: this.syncShadowSwitch(),
        localShadowUpdate: this.headlamp.needsShadowPass,
        depthOfField: this.options.depthOfField ?? !!this.quality.dof,
        tunnelFocus: focus ? 1 : undefined,
        cull: (position) => this.cull(position),
      })
    } finally {
      if (this.sidearm) {
        this.sidearm.visible = weaponVisible
        this.sidearm.syncWorld(this.view.avatar, time, true)
      }
      this.renderer.setScissor(scissor)
      this.renderer.setScissorTest(scissorTest)
      this.camera.position.copy(eye)
    }
  }
  /**
   * Warm the start views behind the host's intro: the overhead descent at a few heights from
   * its start height down to the normal overhead height, then the cockpit and chase views.
   * A scratch camera state is used, and the camera and render origin are restored afterwards,
   * so the attract frames and the real descent start exactly as before. Best effort: a failure
   * only skips the warmup.
   */
  private async warmStartViews(signal: AbortSignal): Promise<void> {
    const sim = this.session.simulation
    if (!sim) return
    const settings = this.cameraState.settings
    const state = createGameCameraState(settings)
    state.yaw = this.cameraState.yaw
    const camera = this.camera
    const pose = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      up: camera.up.clone(),
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
    }
    const origin = this.origin.clone(),
      root = this.view.root.position.clone()
    const first = this.startSequence?.steps[0]
    // Prepare all selectable views before the optional cinematic descent heights.
    const views: { mode: GameCameraView; height?: number }[] = [
      { mode: 'map' },
      { mode: sim.player.vehicleId ? 'cockpit' : 'first-person' },
      { mode: 'chase' },
    ]
    if (first?.view === 'map' && first.fromHeight !== undefined)
      for (const height of descentWarmHeights(first.fromHeight, settings.mapHeight))
        views.push({ mode: 'map', height })
    // Light the views as the reveal will: a live clock starts at its authored time then (e.g.
    // 10:00), and day or night changes lights and therefore shader programs.
    const clock = this.document.sky
    if (clock?.mode === 'live' && clock.origin) this.setSkyClock({ ...clock, since: Date.now() })
    // Complete every requested view before play. A time cutoff shifts compilation
    // onto the first steering/camera frames and leaves the preparation incomplete.
    try {
      for (const [viewIndex, view] of views.entries()) {
        signal.throwIfAborted()
        setGameCameraView(state, view.mode, !!sim.player.vehicleId)
        state.transition = null
        state.lastPose = null
        state.lastView = null
        if (view.height !== undefined) {
          state.mapHeight = view.height
          state.mapDescentDamping = START_DESCENT_DAMPING
        }
        await this.reportLoadStep(
          view.mode === 'map'
            ? t('load.view.map')
            : t('load.view', { view: t('load.view.' + view.mode) }),
        )
        // Looking sideways/back exposes cockpit glass, mirrors and nearby geometry
        // absent from the forward render. Upload/draw those views before accepting input.
        const headAngles =
          view.mode === 'cockpit' || view.mode === 'first-person'
            ? [0, Math.PI / 2, -Math.PI / 2, Math.PI, 0]
            : [0]
        for (const angle of headAngles) {
          signal.throwIfAborted()
          state.headYaw = angle
          state.transition = null
          state.lastPose = null
          state.lastView = null
          this.warmFrame(sim, state, performance.now())
          if (this.tunnelEnabled) this.warmFrame(sim, state, performance.now(), true)
          await new Promise<void>((resolve) => setTimeout(resolve, 0))
        }
        // Effects need the final light count too, including field lights and shadow maps.
        await this.reportLoadStep(t('load.camera-effects', { n: viewIndex + 1 }))
        await warmEffectPresentation(
          this.renderer,
          this.camera,
          [
            this.effects.smoke.root,
            this.effects.marks.root,
            this.view.impacts.warmupObject(),
            ...[this.casingMeshes, this.cartridgeMeshes, this.magazineMeshes].flatMap((pool) =>
              pool ? [pool.root] : [],
            ),
          ],
          this.scene,
        )
        // Compile the viewmodel against the lights and shadow maps this view actually uses.
        await this.reportLoadStep(t('load.camera-weapon', { n: viewIndex + 1 }))
        await this.sidearm?.warm(this.renderer, this.scene)
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    } finally {
      this.document.sky = clock
      camera.position.copy(pose.position)
      camera.quaternion.copy(pose.quaternion)
      camera.up.copy(pose.up)
      camera.fov = pose.fov
      camera.near = pose.near
      camera.far = pose.far
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      this.origin.copy(origin)
      this.view.root.position.copy(root)
    }
  }
  /** The sky clock in use: `live` follows the real clock (optionally faster), `fixed` holds one instant. */
  get skyClock(): SkyClock {
    return this.document.sky ?? { mode: 'live' }
  }
  /** Change the time of day live; sun, sky, fog and lighting follow on the next frame. */
  setSkyClock(clock: SkyClock): void {
    this.assertAlive()
    this.document.sky =
      clock.mode === 'fixed'
        ? { mode: 'fixed', at: clock.at }
        : liveSkyClock(
            skyRate(clock),
            clock.since ?? Date.now(),
            clock.origin ? Date.parse(clock.origin) : Date.now(),
          )
  }
  /** Visible planetary layers (sky, sun, clouds, sea). */
  get planetLayers(): { sky: boolean; sun: boolean; clouds: boolean; sea: boolean } {
    return {
      sky: this.planet.sky,
      sun: this.planet.sun,
      clouds: this.planet.clouds,
      sea: this.planet.sea,
    }
  }
  /** Show or hide planetary layers; wires `GeographicView.setLayers` and the sea sheet. */
  setPlanetLayers(
    layers: Partial<{ sky: boolean; sun: boolean; clouds: boolean; sea: boolean }>,
  ): void {
    this.assertAlive()
    if (layers.sky !== undefined) this.planet.sky = layers.sky
    if (layers.sun !== undefined) this.planet.sun = layers.sun
    if (layers.clouds !== undefined) this.planet.clouds = layers.clouds
    if (layers.sea !== undefined) this.planet.sea = layers.sea
    this.syncPlanet()
    this.rememberPlanetVisual()
  }
  get cloudStyle(): 'low' | 'artistic' {
    return this.planet.cloudStyle
  }
  /** Artistic sheets or the simpler globe layer (`GeographicView.setCloudStyle`). */
  setCloudStyle(style: 'low' | 'artistic'): void {
    this.assertAlive()
    this.planet.cloudStyle = style
    this.sky.setCloudStyle(style)
    this.rememberPlanetVisual()
  }
  get cloudAmount(): number {
    return this.planet.cloudAmount
  }
  /**
   * Cloud coverage 0–1 (`GeographicView.setCloudWeather`).
   * Omit `storm` to keep the current cloud pressure (scene-controls amount slider).
   */
  setCloudWeather(amount: number, storm?: number): void {
    this.assertAlive()
    if (!Number.isFinite(amount) || amount < 0 || amount > 1)
      throw new Error('Cloud amount must be between 0 and 1')
    const pressure = storm === undefined ? this.planet.cloudPressure : storm
    if (!Number.isFinite(pressure) || pressure < 0 || pressure > 1)
      throw new Error('Cloud pressure must be between 0 and 1')
    this.planet.cloudAmount = amount
    this.planet.cloudPressure = pressure
    this.sky.setCloudWeather(amount, pressure)
    this.rememberPlanetVisual()
  }
  get cloudPressure(): number {
    return this.planet.cloudPressure
  }
  get lensFlareAmount(): number {
    return this.planet.lensFlareAmount
  }
  /** 0-1 sun lens flare strength (`GeographicView.setLensFlareAmount`). */
  setLensFlareAmount(amount: number): void {
    this.assertAlive()
    if (!Number.isFinite(amount) || amount < 0 || amount > 1)
      throw new Error('Lens flare amount must be between 0 and 1')
    this.planet.lensFlareAmount = amount
    this.sky.setLensFlareAmount(amount)
    this.rememberPlanetVisual()
  }
  /** Snapshot of Planeta visual knobs for host/demo config paste. */
  planetVisualConfig() {
    return {
      cloudStyle: this.planet.cloudStyle,
      cloudAmount: this.planet.cloudAmount,
      cloudPressure: this.planet.cloudPressure,
      lensFlare: this.planet.lensFlareAmount,
      sky: this.planet.sky,
      sun: this.planet.sun,
      clouds: this.planet.clouds,
      sea: this.planet.sea,
    }
  }
  /** Cockpit and chase FOV with the player's J-menu offset; read live by the camera each frame. */
  private applyCameraFov(offset: number): void {
    const fov = cameraFovFor(this.fovBase, offset)
    this.fovOffset = fov.chaseFov - this.fovBase.chaseFov
    this.cameraState.settings.firstPersonFov = fov.firstPersonFov
    this.cameraState.settings.chaseFov = fov.chaseFov
  }
  private rememberPlanetVisual(): void {
    writeSavedPlanetVisual(browserStorage(), {
      sky: this.planet.sky,
      sun: this.planet.sun,
      sea: this.planet.sea,
      clouds: this.planet.clouds,
      cloudStyle: this.planet.cloudStyle,
      cloudAmount: this.planet.cloudAmount,
      cloudPressure: this.planet.cloudPressure,
      lensFlareAmount: this.planet.lensFlareAmount,
    })
  }
  private syncPlanet(): void {
    this.sky.setLayers({
      sky: this.planet.sky,
      planets: this.planet.sky,
      sun: this.planet.sun,
      moon: this.planet.sky,
      clouds: this.planet.clouds,
    })
    this.sky.setCloudStyle(this.planet.cloudStyle)
    this.sky.setCloudWeather(this.planet.cloudAmount, this.planet.cloudPressure)
    this.sky.setLensFlareAmount(this.planet.lensFlareAmount)
  }
  /** Sea settings in use; undefined means the simplified tide. */
  get waterSettings(): SceneDocument['water'] {
    return this.document.water
  }
  /** Current sea level in metres and its state label, as drawn and used by physics. */
  get sea(): { level: number; state: string } {
    return worldWater(this.document.water, this.document.sky)
  }
  /** Change the sea live: a manual level in metres, or undefined for the simplified tide. */
  setWater(water: SceneDocument['water']): void {
    this.assertAlive()
    if (water === undefined) delete this.document.water
    else this.document.water = structuredClone(water)
  }
  /** Ids of vehicles added with `spawnVehicle`, oldest first. */
  get spawnedVehicles(): { id: string; name: string }[] {
    return this.spawned.map((id) => ({
      id,
      name: this.document.entities.find((e) => e.id === id)?.name ?? id,
    }))
  }
  /**
   * Add a vehicle on the real ground in front of the player, facing the same way, and
   * return its id. `template` is a complete vehicle entity (for example `presetVehicle`),
   * or the vehicle followed by the entities it hosts (`presetEntities`, e.g. the carrier
   * stern portal); ids and position are replaced. Throws when no ground is available ahead.
   */
  async spawnVehicle(template: Entity | readonly Entity[], distance?: number): Promise<string> {
    this.assertAlive()
    const vehicle = Array.isArray(template) ? template[0] : (template as Entity)
    if (!vehicle) throw new Error('A vehicle template is required')
    const sim = this.session.simulation
    if (!sim) throw new Error('A running game is required')
    const player = sim.player
    const own = player.vehicleId
      ? this.document.entities.find((e) => e.id === player.vehicleId)
      : undefined
    const yaw = own ? player.yaw : this.cameraState.yaw
    const [width, length] = [vehicle.size[0], vehicle.size[2]]
    const ahead = distance ?? (own ? 4 + (own.size[2] + length) / 2 : 4 + length / 2)
    // Free spot: straight ahead first, then beside it, then farther along the heading.
    const radius = (size: readonly number[]) => Math.hypot(size[0], size[2]) / 2
    const others = this.document.entities.flatMap((e) =>
      e.kind === 'vehicle' && e.id !== own?.id
        ? [{ at: sim.entityTransform(e.id).position, r: radius(e.size) }]
        : [],
    )
    const sideStep = width + 1.5 + (own ? own.size[0] / 2 : 0)
    const spot = (extra: number, side: number): Vec3Tuple => [
      player.position[0] - Math.sin(yaw) * (ahead + extra) + Math.cos(yaw) * side * sideStep,
      0,
      player.position[2] - Math.cos(yaw) * (ahead + extra) - Math.sin(yaw) * side * sideStep,
    ]
    const free = (at: Vec3Tuple) =>
      others.every(
        (o) =>
          Math.hypot(o.at[0] - at[0], o.at[2] - at[2]) > o.r + radius([width, 0, length]) + 0.5,
      )
    // Nearest first, so the vehicle lands as close to straight ahead as the other vehicles allow.
    const candidates = [0, 8, 16, 24, 32, 40]
      .flatMap((extra) => [0, 1, -1, 2, -2, 3, -3].map((side) => ({ extra, side })))
      .sort(
        (a, b) => a.extra + Math.abs(a.side) * sideStep - (b.extra + Math.abs(b.side) * sideStep),
      )
    const chosen = candidates.find((c) => free(spot(c.extra, c.side))) ?? candidates[0]
    const [x, , z] = spot(chosen.extra, chosen.side)
    return this.placeVehicle(template, [x, 0, z], yaw, 8000)
  }
  /**
   * Rest `template` on loaded ground at a local-metre position and install it on the
   * live view, simulation and input mixer (the same path as `spawnVehicle`).
   * `yaw` is gameplay radians; 0 faces north (−Z). Hosts convert WGS84 lat/lon with
   * `geoToLocal` and compass degrees with `headingYaw` before calling.
   * `template` may be `presetEntities` output: the vehicle first, then entities hosted on it
   * (`parentId` = the template id). The carrier needs its stern portal this way, or its
   * portal monitor stays dark and has no destination/open/close controls.
   */
  async placeVehicle(
    template: Entity | readonly Entity[],
    position: Vec3Tuple,
    yaw = 0,
    timeoutMs?: number,
  ): Promise<string> {
    this.assertAlive()
    const [vehicle, ...hostedTemplates] = Array.isArray(template) ? template : [template as Entity]
    if (!vehicle) throw new Error('A vehicle template is required')
    for (const child of hostedTemplates)
      if (child.parentId !== vehicle.id)
        throw new Error(`Entity ${child.id} must be hosted by ${vehicle.id}`)
    const sim = this.session.simulation
    if (!sim) throw new Error('A running game is required')
    const [x, , z] = position
    // Place the parked model now. Full driving preparation is deferred until first entry.
    // Behind an intro (`beforeReveal`) the host's cards cover loading; no badge over them.
    let ground: number
    if (this.world) {
      const hide =
        this.options.canvas.dataset.reveal === 'preparing'
          ? () => {}
          : showLoadingBadge(this.options.canvas.parentElement, this.text('Waiting for terrain…'))
      try {
        ground = await waitForGround(this.world, [x, 0, z], { timeoutMs: timeoutMs ?? 120_000 })
      } finally {
        hide()
      }
    } else ground = this.sceneGroundHeight(sim.player.position, x, z)
    this.assertAlive()
    if (this.session.simulation !== sim) throw new Error('Vehicle placement session ended')
    const id = `spawned-${++this.spawnSequence}`
    const entity: Entity = {
      ...structuredClone(vehicle),
      id,
      parentId: null,
      transform: {
        position: [x, 0, z],
        rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
      },
    }
    entity.transform.position[1] = ground + playGroundClearance(entity)
    // `carrier-stern` becomes `spawned-N-stern`; local transforms stay relative to the host.
    const hosted = hostedTemplates.map((child): Entity => ({
      ...structuredClone(child),
      id:
        id + (child.id.startsWith(vehicle.id) ? child.id.slice(vehicle.id.length) : `-${child.id}`),
      parentId: id,
    }))
    const added = [entity, ...hosted]
    // Physics first: with the worker (the default) the ids exist there only after its next
    // step, and the vehicle view reads vehicle state as soon as it is registered.
    sim.addVehicles(added)
    await threadedSimulation(sim)?.whenEntities(added.map((e) => e.id))
    this.assertAlive()
    if (this.session.simulation !== sim) throw new Error('Vehicle placement session ended')
    const modelsReady = this.view.addVehicles(added)
    this.game.addVehicles(added)
    // Ships with an interior (carrier) get their helm/telemetry/map/systems/portal monitor
    // panels from the document; a carrier placed after start needs them rebuilt or its screens
    // stay dark.
    if (entity.vehicle?.interior || hosted.some((e) => e.portal))
      this.monitors.rebuild(this.document)
    this.spawned.push(id)
    // Parked geometry must be visible even before its driving presentation is prepared.
    await modelsReady
    return id
  }
  /**
   * Ground height under local (x, z) when the game runs without terrain tiles: the first
   * upward-facing drawn surface (host scenery layers, static entities) below a point 2 m above
   * the player, else the surface under the player, else 1 m below the player.
   */
  private sceneGroundHeight(player: Vec3Tuple, x: number, z: number): number {
    const root = this.view.root
    root.updateMatrixWorld(true)
    const shown = (object: THREE.Object3D | null): boolean => {
      for (let o = object; o && o !== root; o = o.parent) if (!o.visible) return false
      return true
    }
    const normal = new THREE.Vector3()
    const top = player[1] + 2
    const below = (px: number, pz: number): number | null => {
      const origin = root.localToWorld(new THREE.Vector3(px, top, pz))
      const down = root
        .localToWorld(new THREE.Vector3(px, top - 1, pz))
        .sub(origin)
        .normalize()
      const ray = new THREE.Raycaster(origin, down, 0, 1000)
      for (const hit of ray.intersectObject(root, true)) {
        if (!hit.face || !shown(hit.object)) continue
        normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
        if (normal.dot(down) < -0.7) return root.worldToLocal(hit.point.clone()).y
      }
      return null
    }
    return below(x, z) ?? below(player[0], player[2]) ?? player[1] - 1
  }
  /**
   * Prepare the mounted vehicle materials, instruments, textures, shaders and mirror views
   * without adding it to the simulation. First entry calls this; placement only loads
   * the parked model. A host may explicitly prepare a vehicle early.
   */
  async prewarmVehicle(
    template: Entity | readonly Entity[],
    progress?: (phase: string) => Promise<void>,
  ): Promise<void> {
    this.assertAlive()
    const entities = Array.isArray(template) ? template : [template as Entity]
    this.vehicleWarmup ??= new VehicleWarmup({
      renderer: this.renderer,
      camera: this.camera,
      scene: this.scene,
      createView: (entities) => {
        const view = new SceneView(
          {
            version: 1,
            name: 'Vehicle preparation',
            entities: [createEntity('__warm-spawn', 'spawn'), ...entities],
          },
          false,
          false,
          {
            assetQuality:
              this.options.assetQuality ??
              assetQualityForDevice(this.quality.preset, navigator.userAgent),
            mirrorPolicy: mirrorPolicyForQuality(this.quality.preset),
            steeringWheelOffset: (model) =>
              initialSteeringWheelOffset(this.options.steeringWheel, model),
            mirrorAdjustment: (model) => initialMirrorAdjustment(this.options.mirrors, model),
            startLights: this.options.startLights ?? 'auto',
          },
        )
        view.setVehicleShadowReceiving(!!this.quality.vehicleShadows)
        view.setupMaterials((material) => this.shadows.setupMaterial(material))
        return view
      },
    })
    let started = false
    let badge: ReturnType<typeof showLoadingBadge> | undefined
    try {
      await this.vehicleWarmup.warm(entities, async (phase) => {
        if (!started && this.options.canvas.dataset.reveal !== 'preparing') {
          started = true
          if (this.vehiclePreparationCount++ === 0 && this.session.state === 'playing') {
            const simulation = this.session.simulation
            this.pause()
            this.finishVehiclePreparation = () => {
              if (
                !this.disposed &&
                this.session.simulation === simulation &&
                this.session.state === 'paused'
              )
                this.resume()
            }
          }
          badge = showLoadingBadge(this.options.canvas.parentElement, '')
        }
        const vehicle = entities[0]?.vehicle
        const module = vehicle?.twoWheeled
          ? 'motos'
          : vehicle?.hitch && !vehicle.passive
            ? 'camión articulado'
            : (entities[0]?.name ?? 'vehículo')
        badge?.update(`PLEASE WAIT · Cargando módulo de simulación de ${module} · ${phase}`)
        await progress?.(phase)
      })
    } finally {
      badge?.()
      if (started && --this.vehiclePreparationCount === 0) {
        const finish = this.finishVehiclePreparation
        this.finishVehiclePreparation = null
        finish?.()
      }
    }
  }
  /**
   * Couple a free trailer to a tractor. Omit `trailerId` to use the nearest hitchable trailer.
   * Retracts landing legs. The tractor/trailer must already be in the live simulation.
   */
  hitchTrailer(tractorId: string, trailerId?: string): string {
    this.assertAlive()
    const sim = this.session.simulation
    if (!sim) throw new Error('A running game is required')
    return sim.hitchTrailer(tractorId, trailerId)
  }
  /** Uncouple a trailer and deploy its landing legs. Omit the id to release the occupied tractor's trailer. */
  unhitchTrailer(trailerId?: string): string[] {
    this.assertAlive()
    const sim = this.session.simulation
    if (!sim) throw new Error('A running game is required')
    return sim.unhitchTrailer(trailerId)
  }
  private loadingTrailerCargo = false
  get driverPose(): { name: string; model: string; offset: DriverPoseAdjustment } | null {
    const id = this.session.simulation?.player.vehicleId
    const entity = this.document.entities.find((e) => e.id === id)
    const model = entity?.visual?.body.url
    if (!model || !entity?.vehicle?.headOffset) return null
    return { name: entity.name, model, offset: this.view.driverPoseAdjustment(model) }
  }
  setDriverPoseOffset(offset: DriverPoseAdjustment): DriverPoseAdjustment | null {
    const current = this.driverPose
    if (!current) return null
    const applied = this.view.setDriverPoseAdjustment(current.model, offset)
    writeDriverPose(browserStorage(), current.model, applied)
    return applied
  }
  resetDriverPoseOffset(): DriverPoseAdjustment | null {
    const current = this.driverPose
    if (!current) return null
    writeDriverPose(browserStorage(), current.model)
    return this.view.setDriverPoseAdjustment(current.model, { head: [0, 0, 0], view: [0, 0, 0] })
  }
  setTrailerPlatform(id: string, flat: boolean): string {
    this.assertAlive()
    return this.session.simulation!.setTrailerPlatform(id, flat)
  }
  async loadTrailerCars(tractorId: string): Promise<void> {
    const sim = this.session.simulation!
    const trailerId = sim.cargoTrailer(tractorId)
    if (!trailerId) throw Error('Engancha el portacoches para cargar los S3')
    if (this.loadingTrailerCargo) return
    if (sim.cargoCount(trailerId)) throw Error('El portacoches ya tiene carga')
    this.loadingTrailerCargo = true
    try {
      const trailer = sim.entityTransform(trailerId)
      for (const slot of trailerPlatformTuning.cargoSlots) {
        const template = presetVehicle('car', 'cargo-s3')
        const id = await this.placeVehicle(template, trailer.position, 0)
        sim.mountCargo(id, trailerId, [...slot])
      }
      this.options.onMessage?.('Dos S3 sujetos al portacoches')
    } finally {
      this.loadingTrailerCargo = false
    }
  }

  /** Occupied tractor: hitch a nearby free trailer, or uncouple the attached one. */
  toggleHitch(): string | null {
    this.assertAlive()
    return this.session.simulation?.toggleHitch() ?? null
  }
  /**
   * The steering wheel of the vehicle the player is in, or null on foot and in vehicles without
   * a separate steering mesh. Every car of the same model shares one adjustment.
   */
  get steeringWheel(): SteeringWheelState | null {
    const vehicleId = this.session.simulation?.player.vehicleId
    const model = vehicleId ? this.view.steeringWheelModel(vehicleId) : undefined
    if (!vehicleId || !model) return null
    const settings = this.options.steeringWheel
    return {
      vehicleId,
      name: this.document.entities.find((e) => e.id === vehicleId)?.name ?? vehicleId,
      model,
      offset: this.view.steeringWheelOffset(model),
      defaultOffset: defaultSteeringWheelOffset(settings, model),
      saved: readSteeringWheelOffset(settings?.storage, model) !== undefined,
    }
  }
  /**
   * Move the steering wheel of `model` (default: the player's vehicle) live, on top of the pose
   * baked into its GLB, and save the choice for that model. Values are metres, clamped to
   * ±8 cm and snapped to 0.5 cm (`steeringWheelOffsetRange`). The applied values are logged with
   * `console.info` in centimetres and metres, ready to become a host default or a GLB bake.
   * Returns the applied offset, or null when there is no steering wheel to adjust.
   */
  setSteeringWheelOffset(
    offset: Partial<SteeringWheelOffset>,
    model = this.steeringWheel?.model,
  ): SteeringWheelOffset | null {
    this.assertAlive()
    if (!model) return null
    const current = this.view.steeringWheelOffset(model)
    const applied = this.view.setSteeringWheelOffset(model, { ...current, ...offset })
    writeSteeringWheelOffset(this.options.steeringWheel?.storage, model, applied)
    console.info(`[nabla] Steering wheel ${model}: ${describeSteeringWheelOffset(applied)}`)
    return applied
  }
  /** Forget the saved choice of `model` (default: the player's vehicle) and return to the host default. */
  resetSteeringWheelOffset(model = this.steeringWheel?.model): SteeringWheelOffset | null {
    this.assertAlive()
    if (!model) return null
    const settings = this.options.steeringWheel
    writeSteeringWheelOffset(settings?.storage, model, undefined)
    const applied = this.view.setSteeringWheelOffset(
      model,
      defaultSteeringWheelOffset(settings, model),
    )
    console.info(`[nabla] Steering wheel ${model} reset: ${describeSteeringWheelOffset(applied)}`)
    return applied
  }
  /** Light calibration for the occupied vehicle model; null on foot. */
  get vehicleLightAdjustment() {
    const occupied = this.occupiedVehicle
    if (!occupied) return null
    return {
      model: occupied.model,
      name: occupied.name,
      lamps: occupied.lamps,
      values: readVehicleLights(occupied.model, occupied.lightDefaults),
    }
  }
  setVehicleLightAdjustment(patch?: Partial<VehicleLightTuning>): void {
    const occupied = this.occupiedVehicle
    if (occupied) writeVehicleLights(occupied.model, patch, occupied.lightDefaults)
  }
  /**
   * The occupied vehicle as the per-vehicle settings see it (null on foot): its name, model, which
   * lamp groups it can light and whether it has mirrors or exhaust. The menu groups every
   * per-vehicle option under this name and shows only what applies.
   */
  get occupiedVehicle() {
    const id = this.session.simulation?.player.vehicleId
    const entity = this.document.entities.find((item) => item.id === id)
    if (!id || !entity) return null
    return {
      id,
      name: entity.name ?? entity.id,
      model: entity.visual?.body.url ?? entity.id,
      lightDefaults: entity.vehicle?.lights?.tuning,
      lamps: this.view.vehicleLamps(id),
      mirrors: this.view.mirrorModel(id) !== undefined,
      exhaust: this.view.hasExhaust(id),
      options: vehicleOptions(entity.vehicle, {
        lamps: this.view.vehicleLamps(id),
        mirrors: this.view.mirrorModel(id) !== undefined,
        exhaust: this.view.hasExhaust(id),
      }),
    }
  }
  /** Saved per-model choices (exhaust, reversing alarm), cached until changed. */
  private readonly preferenceCache = new Map<string, VehiclePreferences>()
  private vehiclePreferences(model: string): VehiclePreferences {
    let value = this.preferenceCache.get(model)
    if (!value)
      this.preferenceCache.set(model, (value = readVehiclePreferences(browserStorage(), model)))
    return value
  }
  /** Change and save the occupied model's choices; null on foot. */
  setVehiclePreferences(patch: Partial<VehiclePreferences>): VehiclePreferences | null {
    this.assertAlive()
    const model = this.occupiedVehicle?.model
    if (!model) return null
    const next = writeVehiclePreferences(browserStorage(), model, patch)
    this.preferenceCache.set(model, next)
    return next
  }
  /** The occupied model's choices (defaults on foot). */
  get occupiedVehiclePreferences(): VehiclePreferences {
    const model = this.occupiedVehicle?.model
    return model ? { ...this.vehiclePreferences(model) } : normalizeVehiclePreferences({})
  }
  /** Whether the occupied vehicle sounds its reversing alarm (saved per model). */
  get reverseAlarmEnabled(): boolean {
    return this.occupiedVehiclePreferences.reverseAlarm
  }
  setReverseAlarmEnabled(enabled: boolean): void {
    this.setVehiclePreferences({ reverseAlarm: enabled })
  }
  /** Allowed FOV offset, degrees. */
  get cameraFovRange(): { readonly min: number; readonly max: number } {
    return cameraFovRange
  }
  /** Player FOV offset in degrees (also in the J menu), saved as `nabla.cameraFov`. */
  get cameraFovOffset(): number {
    return this.fovOffset
  }
  setCameraFovOffset(offset: number): number {
    this.assertAlive()
    this.applyCameraFov(offset)
    writeCameraFovOffset(browserStorage(), this.fovOffset)
    return this.fovOffset
  }
  /** Put the aiming weapon wheel back to its default and forget the saved one. */
  resetWeaponWheel(): void {
    this.assertAlive()
    this.weaponWheel = normalizeWeaponWheel()
    try {
      browserStorage()?.setItem('nabla.weaponWheel', JSON.stringify(this.weaponWheel))
    } catch {
      /* Optional storage. */
    }
  }
  /** Mirrors of the occupied vehicle; all copies of its model share one adjustment. */
  get mirrors(): MirrorState | null {
    const vehicleId = this.session.simulation?.player.vehicleId
    const model = vehicleId ? this.view.mirrorModel(vehicleId) : undefined
    if (!vehicleId || !model) return null
    const settings = this.options.mirrors
    return {
      vehicleId,
      name: this.document.entities.find((e) => e.id === vehicleId)?.name ?? vehicleId,
      model,
      sides: this.view.mirrorSides(vehicleId),
      adjustment: this.view.mirrorAdjustment(model),
      defaultAdjustment: defaultMirrorAdjustment(settings, model),
      saved: readMirrorAdjustment(settings?.storage, model) !== undefined,
    }
  }
  /**
   * Turn one mirror glass of `model` (default: the player's vehicle) live, on top of the aim baked
   * into the asset, and save the choice for that model. Degrees: `yaw` + outward / − inward,
   * `tilt` + up / − down, clamped to `mirrorAngleRange` and snapped to 0.5°. The reflected view
   * follows the glass. The applied values are logged with `console.info`, ready to become a host
   * default or a bake. Returns the model's whole adjustment, or null without mirrors.
   */
  setMirrorAngle(
    side: string,
    angle: Partial<MirrorAngle>,
    model = this.mirrors?.model,
  ): MirrorAdjustment | null {
    this.assertAlive()
    if (!model) return null
    const current = this.view.mirrorAdjustment(model)
    const next = { ...current, [side]: { ...(current[side] ?? { yaw: 0, tilt: 0 }), ...angle } }
    const applied = this.view.setMirrorAdjustment(model, next)
    writeMirrorAdjustment(this.options.mirrors?.storage, model, applied)
    console.info(
      `[nabla] Mirrors ${model}: ${describeMirrorAdjustment(applied, this.mirrorSidesOf(model))}`,
    )
    return applied
  }
  /** Forget the saved mirror choice of `model` (default: the player's vehicle); back to the host default. */
  resetMirrorAdjustment(model = this.mirrors?.model): MirrorAdjustment | null {
    this.assertAlive()
    if (!model) return null
    const settings = this.options.mirrors
    writeMirrorAdjustment(settings?.storage, model, undefined)
    const applied = this.view.setMirrorAdjustment(model, defaultMirrorAdjustment(settings, model))
    console.info(
      `[nabla] Mirrors ${model} reset: ${describeMirrorAdjustment(applied, this.mirrorSidesOf(model))}`,
    )
    return applied
  }
  private mirrorSidesOf(model: string): string[] {
    const id = this.document.entities.find((e) => this.view.mirrorModel(e.id) === model)?.id
    return id ? this.view.mirrorSides(id).sort() : ['left', 'right']
  }
  private readonly shotListeners = new Set<(shot: ShotReport) => void>()
  /** Observe every shot the local player fires (after its hit is resolved). Returns an unsubscribe. */
  addShotListener(listener: (shot: ShotReport) => void): () => void {
    this.shotListeners.add(listener)
    return () => this.shotListeners.delete(listener)
  }
  /**
   * Show a shot fired elsewhere (for example by another player) with the local effects: tracer,
   * gunshot, sparks, impact sound and a mark on `hit.entityId` when it names a local entity.
   * Simulation-world coordinates; nothing is pushed or damaged.
   */
  showRemoteShot(shot: {
    origin: Vec3Tuple
    end: Vec3Tuple
    hit?: { entityId?: string | null; point: Vec3Tuple; normal?: Vec3Tuple } | null
  }): void {
    this.assertAlive()
    const now = performance.now()
    if (![...shot.origin, ...shot.end].every(Number.isFinite)) return
    this.view.tracers.add(shot.origin, shot.end, now)
    this.effects.audio.gunshot(shot.origin)
    const hit = shot.hit
    if (!hit || !hit.point.every(Number.isFinite)) return
    const normal = hit.normal?.every(Number.isFinite) ? hit.normal : undefined
    this.view.sparks.add(hit.point, now, normal)
    const sim = this.session.simulation
    const entity = hit.entityId
      ? this.document.entities.find((e) => e.id === hit.entityId)
      : undefined
    const object = hit.entityId ? this.view.objects.get(hit.entityId) : undefined
    if (entity?.vehicle) this.effects.audio.metalImpact(hit.point)
    if (object && sim && hit.entityId)
      this.view.impacts.add(
        object,
        sim.entityTransform(hit.entityId),
        hit.point,
        normal ?? [0, 1, 0],
      )
    else this.view.impacts.addWorld(this.view.root, hit.point, normal ?? [0, 1, 0])
  }
  /** Repaint a vehicle with the same paint path as the vehicle menu's colour option. */
  setVehiclePaint(id: string, color: string, finish: 'paint' | 'chrome' = 'paint'): void {
    this.assertAlive()
    this.view.setVehiclePaint(id, color, finish)
  }
  /**
   * Light switches plus live lamp inputs of a vehicle (brake and reverse come from the
   * simulation), or null while its model loads or when it has no lights.
   */
  vehicleLightState(id: string): VehicleLightState | null {
    const switches = this.view.vehicleLightState(id)
    const sim = this.session.simulation
    if (!switches || !sim) return null
    const info = sim.vehicleInfo(id)
    return {
      ...switches,
      powered: sim.player.vehicleId === id || info.ignition === 'running',
      braking: info.braking,
      reversing: info.reversing,
    }
  }
  /**
   * Show `state` on a vehicle nobody drives here (for example another player's car): sets its
   * existing light switches and lamp inputs. `null` gives the lamps back to the simulation.
   */
  setVehicleLightState(id: string, state: VehicleLightState | null): boolean {
    this.assertAlive()
    if (!state) return this.view.setVehicleLightState(id, null, null)
    const { powered, braking, reversing, ...switches } = state
    return this.view.setVehicleLightState(id, switches, { powered, braking, reversing })
  }
  /** Remove a vehicle added with `spawnVehicle`. The player must be outside it. */
  removeSpawnedVehicle(id: string): void {
    this.assertAlive()
    if (!this.spawned.includes(id)) throw new Error(`Not a spawned vehicle: ${id}`)
    const sim = this.session.simulation
    if (sim) sim.removeVehicle(id)
    this.view.removeVehicle(id)
    this.game.removeVehicle(id)
    this.spawned = this.spawned.filter((other) => other !== id)
    this.monitors.rebuild(this.document)
  }

  /**
   * Where every vehicle in the scene is (start vehicle, host fleet and spawned ones), in WGS84
   * with a compass heading, for exporting a start / host-vehicles config. Trailers name the
   * tractor they are hitched to. Empty without a running game on geographic terrain.
   */
  vehiclePlacements(): VehiclePlacement[] {
    const sim = this.session.simulation
    const origin = this.document.geography
    if (!sim || !origin) return []
    const player = sim.player.vehicleId
    return sim.vehicleList().map(({ id, entity, towedBy }) => {
      const pose = sim.entityTransform(id)
      const at = new THREE.Vector3(...pose.position)
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
        new THREE.Quaternion(...pose.rotation),
      )
      forward.y = 0
      if (forward.lengthSq() < 1e-9) forward.set(0, 0, -1)
      const here = localToGeo(origin, at.toArray())
      // Bearing to a point 10 m ahead: the true compass heading at the vehicle, not the origin's.
      const ahead = localToGeo(origin, at.addScaledVector(forward.normalize(), 10).toArray())
      const rad = Math.PI / 180
      const dLon = (ahead.longitude - here.longitude) * rad
      const bearing = Math.atan2(
        Math.sin(dLon) * Math.cos(ahead.latitude * rad),
        Math.cos(here.latitude * rad) * Math.sin(ahead.latitude * rad) -
          Math.sin(here.latitude * rad) * Math.cos(ahead.latitude * rad) * Math.cos(dLon),
      )
      return {
        id,
        name: entity.name,
        visual: entity.visual?.body?.url ?? null,
        color: entity.color ?? null,
        lat: here.latitude,
        lon: here.longitude,
        alt: here.altitude,
        heading: (((bearing / rad) % 360) + 360) % 360,
        towedBy,
        player: id === player,
      }
    })
  }
  /** Groups added with `placeEntities` / `spawnEntities`, oldest first. */
  get placedObjects(): { id: string; name: string; ids: string[] }[] {
    return this.placed.map((entry) => ({ ...entry, ids: [...entry.ids] }))
  }
  /**
   * Place scenery in front of the player, like `spawnVehicle`: `entities` are in a local frame
   * whose origin is the ground contact point and whose −Z points away from the player (see
   * `createPlaceable`). `distance` is metres ahead of the player, or of the occupied vehicle's
   * nose. Returns the group id for `removePlaced`.
   */
  async spawnEntities(entities: readonly Entity[], distance = 4, name?: string): Promise<string> {
    this.assertAlive()
    const sim = this.session.simulation
    if (!sim) throw new Error('A running game is required')
    const player = sim.player
    const own = player.vehicleId
      ? this.document.entities.find((e) => e.id === player.vehicleId)
      : undefined
    const yaw = own ? player.yaw : this.cameraState.yaw
    const ahead = distance + (own ? own.size[2] / 2 : 0)
    const position: Vec3Tuple = [
      player.position[0] - Math.sin(yaw) * ahead,
      0,
      player.position[2] - Math.cos(yaw) * ahead,
    ]
    return this.placeEntities(entities, position, yaw, 8000, name)
  }
  /**
   * Install scenery (standalone portals, sprites, lamps, static boxes) on loaded ground at a
   * local-metre `position`, turned by gameplay `yaw` (0 faces north, −Z). Each top-level entity
   * keeps its local height above the terrain under it. Ids are replaced (`placed-N-…`) and
   * portal links inside the batch follow. Every portal is listed in every portal panel.
   * Returns the group id for `removePlaced`.
   */
  async placeEntities(
    entities: readonly Entity[],
    position: Vec3Tuple,
    yaw = 0,
    timeoutMs?: number,
    name?: string,
  ): Promise<string> {
    this.assertAlive()
    const sim = this.session.simulation
    if (!sim) throw new Error('A running game is required')
    if (!entities.length) throw new Error('Nothing to place')
    const world = this.world
    const [x, , z] = position
    const groundAt = (at: Vec3Tuple) => this.sceneGroundHeight(sim.player.position, at[0], at[2])
    const ground = world
      ? await waitForGround(world, [x, 0, z], { timeoutMs: timeoutMs ?? 120_000 })
      : groundAt(position)
    const group = `placed-${++this.placeSequence}`
    const ids = new Map(entities.map((e, i) => [e.id, `${group}-${i}`]))
    const turn = new THREE.Quaternion(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2))
    const added = entities.map((template): Entity => {
      const e = structuredClone(template)
      e.id = ids.get(template.id)!
      if (e.portal?.pairId) e.portal.pairId = ids.get(e.portal.pairId) ?? null
      const local = new THREE.Vector3(...e.transform.position)
      const offset = new THREE.Vector3(local.x, 0, local.z).applyQuaternion(turn)
      const at: Vec3Tuple = [x + offset.x, 0, z + offset.z]
      // Nearby stage pieces read loaded ground directly; far ones fall back to the origin.
      const below =
        offset.lengthSq() < 0.01
          ? ground
          : ((world ? groundAtSeam(world, at) : groundAt(at)) ?? ground)
      at[1] = below + local.y
      e.transform = {
        position: at,
        rotation: turn
          .clone()
          .multiply(new THREE.Quaternion(...e.transform.rotation))
          .toArray() as [number, number, number, number],
      }
      return e
    })
    this.view.addPlaced(added)
    sim.addPlaced(added)
    this.game.addPlaced(added)
    if (added.some((e) => e.portal)) this.monitors.rebuild(this.document)
    this.placed.push({ id: group, name: name ?? added[0].name, ids: added.map((e) => e.id) })
    for (const e of added) {
      const object = this.view.objects.get(e.id)
      if (object)
        void this.renderer.compileAsync(object, this.camera, this.scene).catch(() => undefined)
    }
    return group
  }
  /**
   * Link, relink or close a portal mouth in the running game (what the portal panel's Abrir /
   * Cerrar do). Both mouths need equal apertures; carrier sterns need the garage door closed.
   */
  configurePortal(
    id: string,
    destinationId: string | null,
    mode: 'closed' | 'window' | 'open',
  ): string {
    this.assertAlive()
    const sim = this.session.simulation
    if (!sim) throw new Error('A running game is required')
    return sim.configurePortal(id, destinationId, mode)
  }
  /** Attach a render-only geographic layer in local metres; follows the floating origin. */
  attachSceneryLayer(layer: THREE.Object3D): () => void {
    this.assertAlive()
    this.view.root.add(layer)
    return () => layer.removeFromParent()
  }

  /** Loaded terrain elevation, without requesting cells or creating physics objects. */
  sceneryGroundHeight(position: Vec3Tuple): number | undefined {
    return this.world ? groundAtSeam(this.world, position) : undefined
  }

  /** Remove a group added with `placeEntities` / `spawnEntities`, unlinking its portals. */
  removePlaced(id: string): void {
    this.assertAlive()
    const entry = this.placed.find((item) => item.id === id)
    if (!entry) throw new Error(`Not a placed object: ${id}`)
    const portals = this.document.entities.some((e) => e.portal && entry.ids.includes(e.id))
    this.session.simulation?.removePlaced(entry.ids)
    this.view.removePlaced(entry.ids)
    this.game.removePlaced(entry.ids)
    this.placed = this.placed.filter((item) => item !== entry)
    if (portals) this.monitors.rebuild(this.document)
  }

  /** Add the nearest unloaded Z15, retaining the current cells and live XR session. */
  async loadNearestZ15(
    baseUrl: string,
    onProgress: (message: string) => void = () => {},
  ): Promise<string> {
    this.assertAlive()
    const sim = this.session.simulation
    const geography = this.document.geography
    const world = this.world
    if (!sim || !geography || !world)
      throw new Error(t('game.enter-zaisa-first-to-add-cells-to-its-terrain'))
    if (this.terrainLoad) throw new Error(t('game.a-cell-is-already-loading'))
    normalizeTilesBase(baseUrl)
    const here = localToGeo(geography, sim.player.position)
    const current = mapTileAt(here.latitude, here.longitude, 15)
    const tile = nearestExtraZ15(
      here.latitude,
      here.longitude,
      world.activeTiles.map((t) => t.key),
    )
    if (!tile) throw new Error(t('game.no-nearby-cells-left-to-add'))
    const controller = new AbortController()
    this.terrainLoad = controller
    // Pin the existing cover before asking for more: it must not be evicted by the quality budget.
    world.pinTile(current)
    for (const cell of world.activeTiles) world.pinTile(cell.manifest.tile)
    world.pinTile(tile, baseUrl)
    const point = geoToLocal(geography, mapTileSample(tile, 1, 1, 2))
    try {
      onProgress(`Añadiendo Z15 ${tile.x}/${tile.y}…`)
      await waitForGround(
        {
          update: () => world.update(sim.player.position, [0, 0, 0]),
          flushInstall: (budget) => world.flushInstall(budget),
          // Test residency, not a coarse parent or sea surface beneath this cell.
          groundHeight: () =>
            world.activeTiles.some((t) => t.key === mapTileId(tile)) ? 0 : undefined,
          missingTileAt: (p) => world.missingTileAt(p),
          get status() {
            return world.status
          },
          get loadProgress() {
            return world.loadProgress
          },
        },
        point,
        {
          signal: controller.signal,
          installBudgetMs: 0.5,
          pollMs: 30,
          timeoutMs: 60000,
        },
      )
      return `${world.activeTiles.length} celdas · añadido ${tile.x}/${tile.y}`
    } catch (error) {
      world.unpinTile(tile)
      if (world.missingTileAt(point))
        throw new Error(`Z15 ${tile.x}/${tile.y} no disponible; se conserva el terreno actual`)
      throw error
    } finally {
      if (this.terrainLoad === controller) this.terrainLoad = null
    }
  }

  /** Read-only tile states for menus and maps; the existing streamer remains authoritative. */
  get terrainTiles() {
    return this.world?.diagnostics.tiles.filter((tile) => tile.kind === 'mesh') ?? []
  }

  /** Terrain cells loaded and drawn of the known dataset; null without tiles. */
  get cellStats(): {
    loaded: number
    visible: number
    missing: number
    pending: number
    failed: number
  } | null {
    return this.world?.cellStats ?? null
  }
  /**
   * Change how far terrain is loaded and how many cells stay in memory, live. Unset fields keep their value,
   * except that a new distance without `cells` resets the cells to the quality profile for that distance.
   * The disk cache is separate (`setMapCacheBudget`, `clearMapCache`).
   */
  setStreaming(options: { distance?: number; cells?: number }): void {
    this.assertAlive()
    if (options.distance !== undefined) {
      if (!Number.isFinite(options.distance) || options.distance < 250 || options.distance > 20000)
        throw new Error('Load distance must be 250–20000 m')
      this.quality = { ...this.quality, distance: options.distance }
      this.world?.setDistance(options.distance)
      // A longer radius needs more cells resident, unless the caller sets the number.
      if (options.cells === undefined) this.world?.setMaxTiles(tileBudget(options.distance))
    }
    if (options.cells !== undefined) this.world?.setMaxTiles(options.cells)
  }
  /** Current load radius (metres) and cells kept in memory. */
  get streaming(): { distance: number; cells: number } {
    return { distance: this.quality.distance, cells: this.world?.maxCells ?? 0 }
  }
  /** Quality profile name and the visibility distances in force (metres; `buildings` 0/1; `relief` in cells). */
  get visibility(): VisibilitySettings & { preset: string } {
    const { preset, roads, fog, collisions, relief, buildings } = this.quality
    return { preset, roads, fog, collisions, relief, buildings }
  }
  /**
   * Change the fog distance, road and building visibility, collision radius and far-relief span live.
   * Values must be one of `visibilityChoices`; unset fields keep their value. The terrain load
   * radius is separate (`setStreaming`). Nothing here touches colours or lighting: it only moves
   * the distances the quality profile already chose.
   */
  setVisibility(options: Partial<VisibilitySettings>): void {
    this.assertAlive()
    const next: Partial<VisibilitySettings> = {}
    for (const key of Object.keys(visibilityChoices) as (keyof VisibilitySettings)[]) {
      const value = options[key]
      if (value === undefined) continue
      if (!(visibilityChoices[key] as readonly number[]).includes(value))
        throw new Error(`Unsupported ${key} value: ${value}`)
      next[key] = value
    }
    this.quality = { ...this.quality, ...next }
    if (next.relief !== undefined) this.world?.setRelief(next.relief)
    if (next.collisions !== undefined)
      this.session.simulation?.setCollisionDistance(next.collisions)
  }
  /** What the loading screen needs: requests in flight, failures, holes and the last error. */
  get loadDiagnostics(): LoadDiagnostics | null {
    return this.world?.loadDiagnostics ?? null
  }
  /** Tiles the host does not have (z/x/y, HTTP status, when): holes in the map, kept for the tile producer. */
  get missingTiles(): MissingTile[] {
    return this.world?.missingTiles ?? []
  }
  clearMissingTiles(): void {
    this.world?.clearMissingTiles()
  }
  /** Per-cell load timings (worker phases, install steps, photo), keyed by cell id; empty without tiles. */
  get cellTimings(): [string, TileTiming][] {
    return [...(this.world?.tileTimings ?? [])]
  }
  /** Ids of the terrain layers switched off (see `TILE_LAYERS`). */
  get hiddenLayers(): string[] {
    return hiddenTileLayers()
  }
  /** Show or hide terrain layers live; only drawing changes, never collision. */
  setHiddenLayers(ids: Iterable<string>): void {
    this.assertAlive()
    setHiddenTileLayers(ids)
    this.world?.applyLayers()
  }
  /** Where every vehicle and the player sit against the loaded ground; null when not playing. */
  groundAudit(): GroundAudit | null {
    const sim = this.session.simulation
    if (!sim || !this.world) return null
    const world = this.world
    return auditGround(
      sim,
      this.document.entities.flatMap((entity) =>
        entity.vehicle
          ? [
              {
                id: entity.id,
                name: entity.name,
                wheelRadius: entity.vehicle.wheelRadius,
                rearWheelRadius: entity.vehicle.twoWheeled?.rearWheelRadius,
              },
            ]
          : [],
      ),
      (position) => world.groundHeight(position),
      sim.options.playerMode === 'hover' ? 0.28 : simulationDefaults.playerHalfHeight,
    )
  }
  /** Return per-instance presentation settings without exposing mutable internal state. */
  /** Geographic lamp beam budget; shared by desktop, VR and AR render paths. */
  get fieldLightLimit(): number | undefined {
    return this.fieldLighting?.lights.beamLimit
  }
  setFieldLightLimit(count: number): void {
    this.fieldLighting?.lights.setBeamLimit(count)
  }
  get fieldLightShadows(): boolean {
    return this.fieldLighting?.lights.shadowsEnabled ?? false
  }
  setFieldLightShadows(enabled: boolean): void {
    this.fieldLighting?.lights.setShadows(enabled)
  }
  get displaySettings(): DisplaySettings {
    return { ...this.display }
  }
  /** Whether the post-flip cinematic camera is allowed (default on). */
  get flipCinematicEnabled(): boolean {
    return this.flipCinematic.enabled
  }
  /** Enable or disable the post-flip cinematic camera; aborts an in-flight shot. */
  setFlipCinematicEnabled(enabled: boolean): void {
    this.assertAlive()
    this.flipCinematic.enabled = enabled
  }
  /** World gravity multiplier (1 = 9.81 m/s²). */
  get gravityScale(): number {
    return this.worldGravityScale
  }
  /** Scale world gravity live (clamped to `simulationDefaults.gravityScaleRange`). Returns the value used. */
  setGravityScale(scale: number): number {
    this.assertAlive()
    const { min, max, default: fallback } = simulationDefaults.gravityScaleRange
    this.worldGravityScale = Number.isFinite(scale) ? Math.min(max, Math.max(min, scale)) : fallback
    const simulation = this.session.simulation
    if (simulation) this.worldGravityScale = simulation.setGravityScale(this.worldGravityScale)
    return this.worldGravityScale
  }
  /** Whether R reset snaps to the nearest road/vía (default on). */
  get recoverToRoadEnabled(): boolean {
    return this.game.recover.snapToRoad
  }
  /** Choose between R reset on the nearest road/vía (true) or upright in place (false). */
  setRecoverToRoadEnabled(enabled: boolean): void {
    this.assertAlive()
    this.game.recover.snapToRoad = enabled
  }
  /** Factor on the quality tier's shadow bias (1 = tuned default; see `shadowBiasRange`). */
  get shadowBias(): number {
    return this.shadows.shadowBiasScale
  }
  /** Change the shadow bias factor live (clamped to 0..3): bias is a receiver uniform, no reload or rebuild. */
  setShadowBias(scale: number): void {
    this.assertAlive()
    this.shadows.setBiasScale(scale)
  }
  /** Effective sun shadow-map resolution; zero means the quality profile disables them. */
  get sunShadowResolution(): number {
    return this.quality.shadows
  }
  /** Shadows on/off switch (Ajustes → Sombras); on by default, the quality tier still applies. */
  get shadowsEnabled(): boolean {
    return this.lighting.shadows
  }
  /** Disable shadow attenuation without changing the number of sun lights or shader programs. */
  setShadowsEnabled(on: boolean): void {
    this.assertAlive()
    this.setLightTuning({ shadows: !!on })
  }
  /** Apply the shadow switch on top of the quality tier; returns whether shadows draw this frame. */
  private syncShadowSwitch(): boolean {
    // Cascades represent one sun. Keep their shader/light topology stable when disabling
    // shadow attenuation; removing castShadow would make the addon count them as three suns.
    return this.lighting.shadows && this.quality.shadows > 0
  }
  /** Ground detail distance: cells around the player with the full-resolution photo (1–3). */
  get groundDetailCells(): number {
    return this.world?.nearCells ?? this.groundDetail
  }
  /**
   * Set the ground detail distance live, 1–3 cells (3×3, 5×5, 7×7 full photos; ~1, 2, 3 km). Growing
   * it loads the full photo for the newly near cells; shrinking only stops further upgrades.
   */
  setGroundDetailCells(cells: number): number {
    this.assertAlive()
    this.groundDetail = Math.min(3, Math.max(1, Math.round(cells)))
    this.world?.setNearCells(this.groundDetail)
    return this.groundDetail
  }
  private groundDetail = 1
  /** Anisotropic filtering of the ground photo (asphalt and road markings). */
  get anisotropy(): number {
    return groundPhotoAnisotropy()
  }
  /** Largest anisotropy this GPU supports. */
  get maxAnisotropy(): number {
    return this.renderer.capabilities.getMaxAnisotropy()
  }
  /** Set the ground photo anisotropy live (1–16), clamped to the GPU maximum. Returns the value used. */
  setAnisotropy(value: number): number {
    this.assertAlive()
    return setGroundPhotoAnisotropy(Math.min(Math.max(1, value), this.maxAnisotropy))
  }
  /** Asphalt contrast on the roads photo drape (1 = unchanged). */
  get asphaltContrast(): number {
    return currentAsphaltContrast()
  }
  /**
   * Set the asphalt contrast live, clamped to 0.5–2.5; a uniform change, no shader recompile. On
   * photo-draped terrain without road meshes (`relief=lidar`) it follows each cell's OSM
   * carriageways, whose masks are painted the first time it leaves 1.
   */
  setAsphaltContrast(value: number): void {
    this.assertAlive()
    applyAsphaltContrast(value)
    this.world?.refreshAsphaltMasks()
  }
  /** Change the host's mute preference without replacing the audio graph. */
  setAudioEnabled(enabled: boolean): void {
    this.assertAlive()
    this.effects.audio.setEnabled(enabled)
  }
  /** Player mix: General (master), Motor (engine bus), Música and its mute, each 0..1. */
  get audioMix(): AudioMixLevels {
    return this.effects.audio.mixer.levels
  }
  /** Change and save the mix (`nabla.audioMix`); returns the clamped levels. */
  setAudioMix(patch: Partial<AudioMixLevels>): AudioMixLevels {
    this.assertAlive()
    const levels = this.effects.audio.setMix(patch)
    writeAudioMix(browserStorage(), levels)
    return levels
  }
  /** Live lighting knobs (exposure, sun, ambient, reflections, paint, shadows). */
  get lightTuning(): LightTuning {
    return { ...this.lighting }
  }
  /** Saved eye-level pistol height (metres) and muzzle-up angle (degrees). */
  get sidearmTuning(): SidearmTuning {
    return { ...this.weaponTuning }
  }
  /** World pickups and inventory are session state; previewing settings never grants a weapon. */
  /** Explicit host loadout for a test session, after play() has started. */
  equipTestSidearm(): void {
    this.assertAlive()
    const sim = this.session.simulation
    const preset = weaponPresets()[0]
    if (!sim || !preset) throw new Error('Start a session before equipping its sidearm')
    const position: Vec3Tuple = [...sim.renderPlayerPosition]
    if (!this.inventory.has(preset.id)) {
      this.inventory.add({
        id: 'test-start-sidearm',
        itemId: preset.id,
        name: preset.name,
        position,
      })
      this.inventory.take('test-start-sidearm', position)
    }
    this.ownedWeaponId = preset.id
    this.sidearm ??= this.createSidearm(preset)
    this.weaponDrawn = true
    this.sidearm.visible = true
    this.sidearm.setAiming(false)
    this.fireRequested = false
    this.triggerDown = false
  }
  get weaponOwned(): boolean {
    return this.ownedWeaponId !== null && this.inventory.has(this.ownedWeaponId)
  }
  get worldPickups(): readonly WorldPickup[] {
    return this.inventory.items.map((item) => ({ ...item, position: [...item.position] }))
  }
  /** Add a real, collectible weapon model at an absolute ground point. */
  async addWeaponPickup(
    id: string,
    presetId: string,
    position: Vec3Tuple,
    normal: Vec3Tuple = [0, 1, 0],
  ): Promise<void> {
    this.assertAlive()
    const preset = weaponPresets().find((item) => item.id === presetId)
    if (!preset) throw new Error(`Unknown pickup weapon: ${presetId}`)
    const generation = this.pickupGeneration
    const model = await assets.instantiate(preset.model ?? preset.body!)
    if (this.disposed || generation !== this.pickupGeneration) {
      disposeObject(model)
      return
    }
    const root = new THREE.Group()
    root.name = `Pickup: ${preset.name}`
    model.scale.setScalar(preset.scale ?? 1)
    model.rotation.z = Math.PI / 2
    root.add(model)
    const bounds = new THREE.Box3().setFromObject(root)
    model.position.y -= bounds.min.y - 0.008
    root.position.fromArray(position)
    root.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(...normal).normalize(),
    )
    try {
      this.inventory.add({ id, itemId: preset.id, name: preset.name, position })
    } catch (error) {
      disposeObject(root)
      throw error
    }
    this.pickupModels.set(id, root)
    this.view.root.add(root)
  }
  private clearPickups(): void {
    this.pickupGeneration++
    for (const root of this.pickupModels.values()) {
      root.removeFromParent()
      disposeObject(root)
    }
    this.pickupModels.clear()
    this.inventory.clear()
    this.ownedWeaponId = null
  }
  private pickupVisible(sim: Simulation, item: WorldPickup): boolean {
    const from = new THREE.Vector3(...sim.renderPlayerPosition)
    const direction = new THREE.Vector3(...item.position).sub(from)
    const length = direction.length()
    if (length < 0.1) return true
    const hit = sim.shoot(
      from.toArray(),
      direction.normalize().toArray(),
      Math.max(0.01, length - 0.08),
      0,
    )
    return !hit
  }
  private nearbyPickup(sim: Simulation): WorldPickup | null {
    if (sim.player.vehicleId) return null
    return this.inventory.nearest(sim.renderPlayerPosition, 1.8, (item) =>
      this.pickupVisible(sim, item),
    )
  }
  private async placeInitialWeaponPickup(sim: Simulation): Promise<void> {
    const location = this.options.weaponPickupLocation
    if (location && this.document.geography) {
      const origin = this.document.geography
      const point = new THREE.Vector3(...geoToLocal(origin, location))
      const rotation = localFrame(origin).invert().multiply(localFrame(location))
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation)
      const from = point.clone().addScaledVector(up, 10)
      const hit = sim.shoot(from.toArray(), up.clone().negate().toArray(), 30, 0)
      const groundHeight = this.world?.groundHeight(point.toArray())
      const ground =
        groundHeight === undefined
          ? this.world
            ? point.toArray()
            : (hit?.point ?? point.toArray())
          : ([point.x, groundHeight + 0.01, point.z] as Vec3Tuple)
      await this.addWeaponPickup(
        'initial-hk',
        'hk-compact',
        ground,
        groundHeight === undefined ? (hit?.normal ?? up.toArray()) : up.toArray(),
      )
      return
    }
    const option = this.options.weaponPickupNearVehicle
    if (!option) return
    const cars = this.document.entities.filter(
      (entity) =>
        entity.vehicle &&
        !entity.vehicle.twoWheeled &&
        !entity.vehicle.flight &&
        !entity.vehicle.boat &&
        !entity.vehicle.passive,
    )
    const car =
      typeof option === 'string'
        ? this.document.entities.find((entity) => entity.id === option)
        : cars.sort((a, b) => {
            const eye = new THREE.Vector3(...sim.player.position)
            return (
              eye.distanceTo(new THREE.Vector3(...sim.entityTransform(a.id, true).position)) -
              eye.distanceTo(new THREE.Vector3(...sim.entityTransform(b.id, true).position))
            )
          })[0]
    if (!car) return
    const pose = sim.entityTransform(car.id, true)
    const rotation = new THREE.Quaternion(...pose.rotation)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation)
    const point = new THREE.Vector3(-2.6, 0, 0.6)
      .applyQuaternion(rotation)
      .add(new THREE.Vector3(...pose.position))
    const from = point.clone().addScaledVector(up, 4)
    const hit = sim.shoot(from.toArray(), up.clone().negate().toArray(), 12, 0)
    const ground = hit ? new THREE.Vector3(...hit.point) : point.addScaledVector(up, -0.6)
    await this.addWeaponPickup(
      'initial-hk',
      'hk-compact',
      ground.toArray(),
      hit?.normal ?? up.toArray(),
    )
  }
  /** Live quality preference shared by exhaust and gun smoke. */
  get bodycamEnabled(): boolean {
    return !!this.cameraState.bodycam
  }
  get actionCamEnabled(): boolean {
    return this.actionCamOn
  }
  get actionCamSettings(): ActionCamSettings {
    return this.actionCam.settings
  }
  setActionCamSettings(settings: Partial<ActionCamSettings>): void {
    this.actionCam.setSettings(settings)
    try {
      browserStorage()?.setItem('nabla.actionCamSettings', JSON.stringify(this.actionCam.settings))
    } catch {
      /* Session settings still work. */
    }
  }
  resetActionCamSettings(): void {
    this.actionCam.resetSettings()
    try {
      browserStorage()?.setItem('nabla.actionCamSettings', JSON.stringify(this.actionCam.settings))
    } catch {
      /* Session settings still work. */
    }
  }
  setActionCamEnabled(enabled: boolean): void {
    this.actionCamOn = enabled
    try {
      browserStorage()?.setItem('nabla.actionCam', String(enabled))
    } catch {
      /* Keep the session preference. */
    }
  }
  private tunnelOverride: boolean | null | undefined
  get tunnelEnabled(): boolean {
    if (this.tunnelOverride === undefined) {
      this.tunnelOverride = null
      try {
        const saved = browserStorage()?.getItem('nabla.tunnel')
        if (saved === 'true' || saved === 'false') this.tunnelOverride = saved === 'true'
      } catch {
        /* Use the quality default if storage is unavailable. */
      }
    }
    return (
      this.tunnelOverride ?? (this.quality.preset === 'high' || this.quality.preset === 'ultra')
    )
  }
  setTunnelEnabled(enabled: boolean): void {
    this.tunnelOverride = enabled
    try {
      browserStorage()?.setItem('nabla.tunnel', String(enabled))
    } catch {
      /* Memory preference remains valid. */
    }
  }
  setBodycamEnabled(enabled: boolean): void {
    this.cameraState.bodycam = enabled
    this.bodycam.reset()
    try {
      browserStorage()?.setItem('nabla.bodycam', String(enabled))
    } catch {
      /* Session preference still applies. */
    }
  }
  get smokePercent(): number {
    return smokeDensity.value * 100
  }
  setSmokePercent(percent: number): void {
    const value = setSmokeDensity(percent)
    try {
      browserStorage()?.setItem('nabla.smokePercent', String(value))
    } catch {}
  }
  get smokeEnabled(): boolean {
    return this.smokeOn
  }
  setSmokeEnabled(enabled: boolean): void {
    this.smokeOn = enabled
    this.view.smokeEnabled = enabled
    this.sidearm?.setSmokeEnabled(enabled)
    try {
      browserStorage()?.setItem('nabla.smoke', enabled ? '1' : '0')
    } catch {
      /* Storage may be disabled. */
    }
  }
  setSidearmTuning(patch: Partial<SidearmTuning>): SidearmTuning {
    this.assertAlive()
    this.weaponTuning = normalizeSidearmTuning(patch, this.weaponTuning)
    this.sidearm?.setTuning(this.weaponTuning)
    writeSidearmTuning(browserStorage(), this.weaponTuning)
    return this.sidearmTuning
  }
  /** Keep the aimed model visible while its settings are adjusted with a free mouse. */
  setSidearmAimPreview(enabled: boolean): void {
    if (enabled) this.sidearm ??= this.createSidearm()
    this.sidearmAimPreview = enabled
    if (!enabled) {
      this.weaponPosePreview = null
      this.sidearm?.stopInspect(performance.now())
    }
    if (!enabled) this.sidearm?.setAiming(false)
  }
  private flashSettings = (() => {
    const result = { x: 0, y: 0, z: -72, intensity: 100 }
    try {
      const saved = JSON.parse(browserStorage()?.getItem('nabla.muzzleFlash') ?? '{}')
      for (const key of ['x', 'y', 'z', 'intensity'] as const)
        if (typeof saved?.[key] === 'number' && Number.isFinite(saved[key]))
          result[key] = Math.max(
            key === 'intensity' ? 0 : -200,
            Math.min(key === 'intensity' ? 300 : 200, saved[key]),
          )
    } catch {
      /* Optional preference. */
    }
    return result
  })()
  get muzzleFlashTuning() {
    return { ...this.flashSettings }
  }
  setMuzzleFlashTuning(
    value: Partial<{ x: number; y: number; z: number; intensity: number }>,
  ): void {
    for (const key of ['x', 'y', 'z', 'intensity'] as const) {
      const n = value[key]
      if (typeof n === 'number' && Number.isFinite(n))
        this.flashSettings[key] = Math.max(
          key === 'intensity' ? 0 : -200,
          Math.min(key === 'intensity' ? 300 : 200, n),
        )
    }
    if (this.sidearm) this.sidearm.flashTuning = { ...this.flashSettings }
    try {
      browserStorage()?.setItem('nabla.muzzleFlash', JSON.stringify(this.flashSettings))
    } catch {
      /* Optional preference. */
    }
  }
  previewMuzzleFlash(): void {
    this.setSidearmAimPreview(true)
    if (this.sidearm) {
      this.sidearm.flashTuning = { ...this.flashSettings }
      this.sidearm.previewFlash()
    }
  }
  /** Firearm the pose menu edits: the selected slot weapon, or the default sidearm. */
  get weaponPoseTarget(): { id: string | null; name: string; rig: string | null } {
    const preset = this.sidearm?.preset
    return { id: preset?.id ?? null, name: preset?.name ?? 'Pistola', rig: preset?.rig ?? null }
  }
  get weaponPoseTuning(): WeaponPoseTuning {
    return normalizeWeaponPoses(this.weaponPoses)
  }
  /** Poses of the edited weapon before local edits, for "reset". */
  get weaponPoseDefaults(): WeaponPoseTuning {
    return normalizeWeaponPoses(this.weaponPoseBaseline)
  }
  setWeaponPoseTuning(value: WeaponPoseTuning): void {
    const id = this.sidearm?.preset?.id
    const key = id ? weaponPoseStorageKey(id) : 'nabla.weaponPoses'
    const poses = normalizeWeaponPoses(value, id ? this.weaponPoseBaseline : undefined)
    if (id) this.weaponPoseCache.set(id, poses)
    else Object.assign(this.legacyWeaponPoses, poses)
    if (this.sidearm) this.sidearm.poseTuning = poses
    try {
      browserStorage()?.setItem(key, JSON.stringify(poses))
    } catch {
      /* Optional persistence. */
    }
  }
  previewWeaponPose(pose: WeaponPose | null): void {
    this.setSidearmAimPreview(pose !== null)
    this.weaponPosePreview = pose
    if (!pose || !this.sidearm) return
    if (pose.startsWith('chamber') || pose.startsWith('slideChamber'))
      this.sidearm.inspect(performance.now(), true)
    else if (pose.startsWith('inspect') || pose.startsWith('slideInspect'))
      this.sidearm.inspect(performance.now(), false)
    else this.sidearm.stopInspect(performance.now())
  }
  /** Change and save the lighting knobs (`nabla.lightTuning`); returns the clamped values. */
  setLightTuning(patch: Partial<LightTuning>): LightTuning {
    this.assertAlive()
    this.lighting = normalizeLightTuning(patch, this.lighting)
    writeLightTuning(browserStorage(), this.lighting)
    return { ...this.lighting }
  }
  /** Per frame: exposure, shadow darkness, vehicle reflections and paint from `lighting`. */
  private applyLightTuning(): void {
    const t = this.lighting
    this.renderer.toneMappingExposure = t.exposure
    const shadow = t.shadows ? t.shadowIntensity : 0
    for (const light of [this.sun, ...this.shadows.lights]) light.shadow.intensity = shadow
    this.view.reflectionScale = t.reflections
    this.view.applyPaintBrightness(t.paint)
  }
  /** True while the background track plays (it waits for the first gesture). */
  get musicPlaying(): boolean {
    return this.effects.audio.musicPlaying
  }
  /**
   * Apply a live automatic-clock cap and drawing-buffer scale; physics keeps its fixed timestep.
   * Passing `resolutionScale` without a mode fixes the scale (manual). Passing
   * `resolutionScaleMode: 'auto'` resumes adaptation from the current scale (clamped to 0.5..1).
   */
  setDisplay(settings: Partial<DisplaySettings>): void {
    if (this.disposed) throw new Error('Game runtime is disposed')
    let mode = settings.resolutionScaleMode ?? this.display.resolutionScaleMode
    if (settings.resolutionScale !== undefined && settings.resolutionScaleMode === undefined)
      mode = 'manual'
    let scale = settings.resolutionScale ?? this.display.resolutionScale
    if (mode === 'auto')
      scale = Math.min(autoResolutionScaleRange.max, Math.max(autoResolutionScaleRange.min, scale))
    const next = resolveDisplaySettings({
      maxFps: settings.maxFps ?? this.display.maxFps,
      resolutionScale: scale,
      resolutionScaleMode: mode,
    })
    const resize = next.resolutionScale !== this.display.resolutionScale
    const modeChanged = next.resolutionScaleMode !== this.display.resolutionScaleMode
    if (next.maxFps !== this.display.maxFps) {
      this.loop.setMaxFps(next.maxFps)
      this.adaptive.setTargetFrameMs(next.maxFps ? 1000 / next.maxFps : null)
    }
    this.display = next
    this.adaptive.applyDisplay(next)
    if (resize) {
      this.applyPixelRatio()
      this.resize()
    }
    if (resize || modeChanged) this.options.onResolutionScale?.(this.adaptive.state)
  }
  /** Current spatial upscaling mode and sharpening strength. */
  get fsrSettings(): FsrSettings {
    return this.pipeline.fsr.settings
  }
  setFsr(settings: Partial<FsrSettings>): void {
    this.assertAlive()
    this.pipeline.fsr.setSettings(settings)
  }
  /** Current auto/manual mode and live drawing-buffer scale. */
  get resolutionScaleState(): ResolutionScaleState {
    return this.adaptive.state
  }
  /**
   * Run a short (~3 s by default) machine-speed probe while the host waits (ideally during
   * `startAttract`). In auto mode the suggested initial scale is applied immediately; manual
   * scale is never changed. `qualityTier` is a hint for the host (quality presets need a reload).
   */
  probeMachine(options: { durationMs?: number } = {}): Promise<ResolutionProbeResult> {
    this.assertAlive()
    if (this.session.state === 'playing')
      return Promise.reject(new Error('probeMachine must run before play() starts the simulation'))
    const run = this.runProbe(options)
    this.probing = run
    void run
      .finally(() => {
        if (this.probing === run) this.probing = null
      })
      .catch(() => undefined)
    return run
  }
  private async runProbe(options: { durationMs?: number }): Promise<ResolutionProbeResult> {
    // Probe at the profile's full ratio so slow GPUs show their fill cost.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.resolution))
    this.resize()
    const gl = this.renderer.getContext()
    const pixel = new Uint8Array(4)
    let last: number | null = null
    try {
      const result = await probeResolutionTier({
        durationMs: options.durationMs,
        sample: () =>
          new Promise<number>((resolve) => {
            requestAnimationFrame((time) => {
              if (this.disposed) return resolve(0)
              const start = performance.now()
              for (let pass = 0; pass < 3; pass++) this.renderAttractFrame()
              // One-pixel readback waits for the queued GPU work: a CPU+GPU proxy, not a GPU timer.
              if (gl instanceof WebGL2RenderingContext || gl instanceof WebGLRenderingContext)
                gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
              const work = performance.now() - start
              const interval = last === null ? work : Math.max(work, time - last)
              last = time
              resolve(interval)
            })
          }),
        sleep: async () => {},
      })
      if (this.display.resolutionScaleMode === 'auto') {
        this.display = { ...this.display, resolutionScale: result.resolutionScale }
        this.adaptive.setAuto(result.resolutionScale)
      }
      this.options.canvas.dataset.probeTier = result.qualityTier
      this.options.canvas.dataset.probeMedianMs = result.medianFrameMs.toFixed(1)
      return result
    } finally {
      if (!this.disposed) {
        this.applyPixelRatio()
        this.resize()
        this.options.onResolutionScale?.(this.adaptive.state)
      }
    }
  }
  /** Delay costly GPU preparation until host input, while the attract planet keeps running. */
  holdPreparation(gate: Promise<unknown>): void {
    this.assertAlive()
    this.preparationGates.push(gate.catch(() => undefined))
  }
  /**
   * Hold the reveal of gameplay (the end of the attract view) until `gate` settles, e.g. an intro
   * or credits sequence. Gates added before or during `play()` are awaited; a rejected gate
   * counts as done. `play()` clears them once gameplay is revealed.
   */
  holdReveal(gate: Promise<unknown>): void {
    this.assertAlive()
    this.revealGates.push(gate.catch(() => undefined))
  }
  /**
   * Run `task` inside `play()` once the simulation exists and before the start area is
   * streamed and warmed, e.g. placing host vehicles with `placeVehicle`. What it adds is then
   * loaded, lit and compiled behind the intro instead of during the first gameplay seconds
   * (a new vehicle's lights change every material's program). A failing task is logged and
   * does not stop play.
   */
  beforeReveal(task: () => Promise<unknown>): void {
    this.assertAlive()
    this.revealTasks.push(task)
  }
  /**
   * Start the background music now if the browser allows it; otherwise the next gesture does.
   * A track with `startOn: "host"` never starts before this call.
   */
  startMusic(): void {
    this.assertAlive()
    this.effects.audio.releaseMusic()
    this.effects.audio.unlock()
  }
  /**
   * Fade the background music out over `seconds` (e.g. once the intro descent has landed); it
   * stays off until `playMusic` (vehicle menu «MUSICA»). A track not started yet never starts.
   */
  fadeOutMusic(seconds = 3.5): void {
    this.assertAlive()
    this.effects.audio.fadeOutMusic(seconds)
  }
  /** Play the background music again from the start, on the music bus. False when muted/absent. */
  playMusic(): boolean {
    this.assertAlive()
    return this.effects.audio.playMusic()
  }
  /** Stop the background music with a short fade. */
  stopMusic(): void {
    this.assertAlive()
    this.effects.audio.fadeOutMusic(0.8)
  }
  /** Publish before synchronous GPU work, then give the host one paint opportunity. */
  private async reportLoadStep(detail: string): Promise<void> {
    this.options.canvas.dataset.loadingDetail = detail
    this.options.canvas.dataset.loadingDetailSince = String(performance.now())
    window.dispatchEvent(new CustomEvent('nabla-load-step'))
    await nextPaint()
  }
  private async prepareReveal(signal: AbortSignal): Promise<void> {
    const canvas = this.options.canvas
    // Stages for hosts that pace an intro on loading (`data-reveal-stage`, `data-reveal-progress`).
    const stage = (name: string, done: number) => {
      canvas.dataset.revealStage = name
      canvas.dataset.loadingStage = name
      canvas.dataset.revealProgress = (done / REVEAL_STAGES).toFixed(2)
    }
    canvas.dataset.reveal = 'preparing'
    if (this.preparationGates.length) {
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(signal.reason)
        signal.addEventListener('abort', abort, { once: true })
        Promise.all(this.preparationGates.splice(0)).then(() => {
          signal.removeEventListener('abort', abort)
          resolve()
        })
        if (signal.aborted) abort()
      })
    }
    signal.throwIfAborted()
    await this.reportLoadStep(t('load.loading-audio'))
    this.effects.audio.prepare()
    // 1. Vehicle GLBs (the bike included) and 2. the sidearm models land in the asset cache.
    stage('vehicles', 0)
    await this.reportLoadStep(t('load.loading-vehicles'))
    await this.view.ready
    signal.throwIfAborted()
    stage('weapons', 1)
    await this.reportLoadStep(t('load.loading-weapons'))
    const preset = weaponPresets()[0]
    const weaponUrls = [preset?.model, preset?.body, preset?.slide].filter(
      (url): url is string => typeof url === 'string',
    )
    await Promise.all(
      weaponUrls.map((url) => assets.instantiate(url).then((model) => disposeObject(model))),
    )
    signal.throwIfAborted()
    // The viewmodel itself (HK model, magazine, flash, laser): built and compiled now, so the
    // first draw shows the pistol instead of the placeholder block while it loads.
    this.sidearm ??= this.createSidearm()
    await this.reportLoadStep(t('load.preparing-magazines'))
    await this.sidearm.warm(this.renderer)
    signal.throwIfAborted()
    // Casing meshes join the scene before the shader stage, so the first shot compiles nothing.
    this.ensureCasingMeshes()
    // Allocate the other ejection pools before their first use, without ejecting anything.
    if (!this.cartridgeMeshes) {
      const clone = this.sidearm.cartridgeClone()
      if (clone) {
        this.cartridgeMeshes = new DroppedMagazines(clone, 24, false)
        this.view.root.add(this.cartridgeMeshes.root)
      }
    }
    if (!this.magazineMeshes) {
      const clone = this.sidearm.magazineClone()
      if (clone) {
        this.magazineMeshes = new DroppedMagazines(clone, 8)
        this.view.root.add(this.magazineMeshes.root)
      }
    }
    this.sidearm.syncMuzzleLight(performance.now(), this.scene, this.camera, true)
    // 3. Terrain, photos, buildings and map meshes around the start: everything the descent
    // from high above shows, at the LODs the stream plans there.
    stage('terrain', 2)
    await this.reportLoadStep(t('load.preparing-scene'))
    for (const task of this.revealTasks.splice(0)) {
      signal.throwIfAborted()
      await task().catch((error) => console.warn('beforeReveal task failed', error))
    }
    signal.throwIfAborted()
    const sim = this.session.simulation
    if (this.world && sim) {
      const spawn = [...sim.player.position] as Vec3Tuple
      await this.reportLoadStep(t('load.preloading-digital-twin'))
      if (this.options.startupTerrain === 'area') {
        const spawnEye = new THREE.Vector3(...spawn)
        let plannedCells: (() => { loaded: number; total: number }) | undefined
        await waitForArea(this.world, spawn, {
          signal,
          onProgress: () => {
            if (!plannedCells) {
              const candidate = this.world!.trackPlannedCells()
              if (candidate().total) plannedCells = candidate
            }
            const stats = plannedCells?.() ?? { loaded: 0, total: 0 }
            const progress = stats.total ? stats.loaded / stats.total : 0
            if (this.attract)
              this.attract.orbitTarget = Math.min(this.attract.orbitTarget, 1 - progress)
            const detail = `Cargando celdas ${stats.loaded} / ${stats.total}`
            if (canvas.dataset.loadingDetail !== detail) {
              canvas.dataset.loadingDetail = detail
              window.dispatchEvent(new CustomEvent('nabla-load-step'))
            }
          },
          pending: () => this.view.pendingMapInstalls + Number(this.view.pendingBuildingBatches),
          flush: () => {
            this.view.flushMapInstall(
              streamingDefaults.mapInstallBudgetMs * 3,
              streamingDefaults.mapInstallCount * 4,
            )
            this.cull(spawnEye)
          },
        })
      } else {
        await waitForGround(this.world, spawn, { signal })
        this.view.flushMapInstall(
          streamingDefaults.mapInstallBudgetMs,
          streamingDefaults.mapInstallCount,
        )
      }
      this.world.renderUpdate(this.origin, !!this.quality.buildings, sim)
    }
    signal.throwIfAborted()
    // 4. Shader programs (chase, cockpit, mirrors, the new tiles) and texture uploads, on a copy
    if (sim) await this.placeInitialWeaponPickup(sim)
    signal.throwIfAborted()
    // of the camera so the attract frames keep their own projection.
    // Heavy GPU preparation keeps the already-visible planet still, without delaying startup.
    if (this.attract) this.attract.orbitSpeed = this.attract.orbitTarget = 0
    stage('shaders', 3)
    await this.reportLoadStep(t('load.preparing-poses-lights-and-materials'))
    // Gameplay visibility (avatar shown, spawn markers hidden) and one pose sync first, so the
    // lights compileAsync sees are the ones gameplay draws with (the light count is part of
    // every lit program; a mismatch means slow synchronous compiles later).
    this.view.setPlaying(true)
    try {
      if (sim)
        this.view.sync(
          sim,
          0,
          isFirstPersonView(this.cameraState, !!sim.player.vehicleId),
          this.cameraState.headYaw,
          this.cameraState.headPitch,
        )
      const camera = this.camera.clone()
      await this.reportLoadStep(t('load.preparing-special-effects'))
      await warmEffectPresentation(
        this.renderer,
        camera,
        [
          this.effects.smoke.root,
          this.effects.marks.root,
          this.view.impacts.warmupObject(),
          ...[this.casingMeshes, this.cartridgeMeshes, this.magazineMeshes].flatMap((pool) =>
            pool ? [pool.root] : [],
          ),
        ],
        this.scene,
      )
      await warmGamePresentation({
        renderer: this.renderer,
        scene: this.scene,
        camera,
        view: this.view,
        settings: this.cameraState.settings,
        signal,
        onProgress: (detail) => this.reportLoadStep(detail),
      })
      await this.reportLoadStep(t('load.uploading-gpu-textures'))
      await uploadSceneTextures(this.renderer, this.scene, signal)
      signal.throwIfAborted()
      // Then the start views themselves, as the first gameplay frames will draw them. Awaited
      // in full (a handful of frames): a timed-out warmup must not keep moving the camera.
      await this.reportLoadStep(t('load.mounting-cameras'))
      await this.warmStartViews(signal)
      await this.reportLoadStep(t('load.preparing-destruction'))
      await this.view.destruction.warm(this.renderer, this.scene, this.camera, [this.view.root])
      stage('preload', 4)
      // Replacement candidates are availability metadata, not an instruction to preload
      // every vehicle. placeVehicle prepares a replacement when it is actually needed.
      const preloadVehicles = this.options.preloadVehicles ?? []
      for (const [index, templates] of preloadVehicles.entries()) {
        signal.throwIfAborted()
        await this.reportLoadStep(`Precargando vehículo: ${index + 1}/${preloadVehicles.length}`)
        let lastPhase = '',
          phaseStarted = performance.now()
        await this.prewarmVehicle(templates, async (phase) => {
          if (lastPhase && this.options.performanceLog) {
            this.stallLog.push(
              JSON.stringify({
                type: 'vehicle-preload',
                vehicle: index + 1,
                phase: lastPhase,
                elapsedMs: Math.round(performance.now() - phaseStarted),
              }),
            )
            if (this.stallLog.length > 100) this.stallLog.shift()
            canvas.dataset.stallLog = this.stallLog.join('\n')
          }
          await this.reportLoadStep(
            t('load.vehicle', { n: index + 1, total: preloadVehicles.length, phase }),
          )
          lastPhase = phase
          phaseStarted = performance.now()
        })
      }
    } finally {
      this.view.setPlaying(false)
    }
    signal.throwIfAborted()
    if (this.options.performanceLog) {
      this.stallLog.push(
        JSON.stringify({
          type: 'preload-complete',
          programs: this.renderer.info.programs?.length ?? 0,
          shaders: describePrograms(this.renderer.info.programs ?? []),
        }),
      )
      canvas.dataset.stallLog = this.stallLog.join('\n')
    }
    stage('ready', REVEAL_STAGES)
    canvas.dataset.reveal = 'holding'
    await this.reportLoadStep(t('load.simulation-ready'))
    while (this.revealGates.length) await Promise.all(this.revealGates.splice(0))
  }
  /**
   * Hold the start camera sequence on its first view until `gate` settles: the overhead descent
   * (`fromHeight`) stays at its start height and nothing advances, e.g. while the host fades in
   * from black. It lasts until the gate settles, also across a `play()` started after the call.
   */
  holdStartCameras(gate: Promise<unknown>): void {
    this.assertAlive()
    const hold = gate.catch(() => undefined)
    this.startHold = hold
    void hold.then(() => {
      if (this.startHold === hold) this.startHold = null
    })
  }
  /**
   * Boot/attract mode: render only sky and planet from orbit while `play()` streams terrain and
   * vehicles. `play()` stops it automatically once the simulation starts. Idempotent.
   */
  startAttract(options: AttractOptions = {}): void {
    this.assertAlive()
    if (!this.document.geography) return
    if (this.attract) {
      Object.assign(this.attract.options, options)
      return
    }
    const resolved: Required<AttractOptions> = {
      altitude: options.altitude ?? 18_000_000,
      orbitSeconds: options.orbitSeconds ?? 120,
      tilt: options.tilt ?? 0.45,
      clock: options.clock ?? { mode: 'live' },
    }
    const loop = new FrameLoop((time) => {
      try {
        const attract = this.attract
        if (!attract || this.disposed) return
        const frameMs = attract.last === null ? 0 : time - attract.last
        attract.last = time
        // Loading, tab suspension or a busy GPU must not fast-forward the orbit on resume.
        const dt = Math.min(50, Math.max(0, frameMs))
        attract.orbitSpeed += (attract.orbitTarget - attract.orbitSpeed) * (1 - Math.exp(-dt / 450))
        if (attract.orbitSpeed < 0.001) attract.orbitSpeed = 0
        attract.elapsed += dt * attract.orbitSpeed
        this.renderAttractFrame()
        this.observeResolution(frameMs, time)
      } catch (error) {
        this.stopAttract()
        this.options.onError?.(error)
      }
    })
    loop.setMaxFps(this.display.maxFps)
    this.attract = {
      loop,
      elapsed: 0,
      orbitSpeed: 1,
      orbitTarget: 1,
      camera: this.camera.clone(),
      last: null,
      options: resolved,
    }
    this.options.canvas.dataset.bootMode = 'attract'
    loop.start()
  }
  /** Stop the attract view (also called by `play()` and `dispose()`). */
  stopAttract(): void {
    if (!this.attract) return
    this.attract.loop.stop()
    this.attract = null
    if (this.options.canvas.dataset.bootMode === 'attract')
      this.options.canvas.dataset.bootMode = 'play'
  }
  /** Whether the pre-play attract view is running. */
  get attracting(): boolean {
    return !!this.attract
  }
  private renderAttractFrame(): void {
    if (!this.document.geography) return
    const options = this.attract?.options ?? { altitude: 18_000_000, orbitSeconds: 120, tilt: 0.45 }
    // Warmup changes the gameplay camera's FOV/pose across async waits. The intro owns its
    // projection so those preparations cannot zoom the globe in and out between frames.
    const camera = this.attract?.camera ?? this.camera.clone()
    camera.aspect = this.camera.aspect
    camera.updateProjectionMatrix()
    const centre = new THREE.Vector3(0, -(EARTH_RADIUS + this.document.geography.altitude), 0)
    const angle = options.orbitSeconds
      ? (((this.attract?.elapsed ?? 0) / 1000) * Math.PI * 2) / options.orbitSeconds
      : 0
    const distance = EARTH_RADIUS + options.altitude
    const eye = new THREE.Vector3(
      Math.sin(options.tilt) * Math.cos(angle),
      Math.cos(options.tilt),
      Math.sin(options.tilt) * Math.sin(angle),
    )
      .multiplyScalar(distance)
      .add(centre)
    camera.up.set(0, 1, 0)
    camera.position.copy(eye)
    camera.lookAt(centre)
    camera.updateMatrixWorld()
    this.environment.updateSky(
      this.sky,
      eye,
      this.origin,
      this.attract?.options.clock ?? { mode: 'live' },
      this.quality.fog,
    )
    this.sky.setViewAspect(camera.aspect)
    const autoClear = this.renderer.autoClear
    this.renderer.autoClear = true
    try {
      this.sky.render(this.renderer, camera, eye)
    } finally {
      this.renderer.autoClear = autoClear
    }
  }
  private observeResolution(frameMs: number, time: number): void {
    const changed = this.adaptive.observeFrame(frameMs, time)
    if (changed === null) return
    this.display = { ...this.display, resolutionScale: changed }
    this.applyPixelRatio()
    this.resize()
    this.options.onResolutionScale?.(this.adaptive.state)
  }
  private applyPixelRatio(): void {
    this.renderer.setPixelRatio(
      Math.min(
        maxPixelRatio,
        Math.min(window.devicePixelRatio || 1, this.quality.resolution) *
          this.display.resolutionScale,
      ),
    )
    this.options.canvas.dataset.resolutionScale = String(this.display.resolutionScale)
    this.options.canvas.dataset.resolutionScaleMode = this.display.resolutionScaleMode
  }

  private cull(position: THREE.Vector3): void {
    this.view.limitDrawDistance(
      position,
      this.quality.distance,
      true,
      !!this.quality.buildings,
      this.quality.preset === 'ultra' ? 20000 : Math.min(this.quality.distance, this.quality.roads),
    )
  }
  /**
   * Resolve the seated vehicle's control profile from its live definition (host-placed
   * vehicles included). All touch-rig and HUD choices read this; never branch on vehicle kind here.
   */
  private controlSurfaces(sim: Simulation): ControlSurfaces {
    const id = sim.player.vehicleId
    if (!id) return controlSurfaces(resolveControlProfile(null))
    return controlSurfaces(
      resolveControlProfile(sim.vehicleSpec(id), { flightMode: sim.vehicleInfo(id).flightMode }),
    )
  }
  private hasInput(): boolean {
    return (
      !document.hidden &&
      (this.options.acceptsInput?.() ?? true) &&
      (this.touchDriving?.busy() ||
        this.touchFlight?.busy() ||
        this.touchWalk?.busy() ||
        (document.activeElement === this.options.canvas && document.hasFocus()))
    )
  }
  /** Expose input health on the canvas so a stuck-control report can be checked in devtools. */
  private canvasDiagnostics(frameMs: number): void {
    const data = this.options.canvas.dataset
    data.stance = this.session.simulation?.stance ?? 'standing'
    data.heldKeys = [...this.keys.values].join(' ')
    data.keyExpirations = String(this.keys.expirations)
    if (frameMs > 100) data.longFrames = String(Number(data.longFrames ?? 0) + 1)
    data.lastFrameMs = frameMs.toFixed(1)
    if (frameMs > 0 && Number.isFinite(frameMs)) {
      this.fpsElapsed += frameMs
      this.fpsFrames++
      if (this.fpsElapsed >= 1000) {
        data.fps = String(Math.round((this.fpsFrames * 1000) / this.fpsElapsed))
        this.fpsElapsed = 0
        this.fpsFrames = 0
      }
    }
  }
  /** Release held controls when host UI takes focus, without stopping simulation. */
  private beamFlash?: { vehicle: string; key: string }
  private releaseBeamFlash(): void {
    if (this.beamFlash) this.view.endVehicleBeamFlash(this.beamFlash.vehicle)
    this.beamFlash = undefined
  }
  releaseInput(): void {
    this.releaseBeamFlash()
    this.usbControllers.reset()
    this.usbFrame = idleUsbFrame()
    this.usbFeedback.stop()
    if (this.sidearm) this.sidearm.state.manualRackHeld = false
    this.safetyClickHeld = false
    if (!this.sidearmAimPreview) this.sidearm?.stopInspect(performance.now())
    this.fireRequested = false
    this.triggerReleased = true
    this.triggerDown = false
    this.touchDriving?.clear()
    this.touchFlight?.clear()
    this.touchWalk?.clear()
    this.monitors.releaseInput()
    this.game.releaseInput()
    this.previousButtons = []
    this.previousPad = null
    this.releasePointer()
  }
  /**
   * Sidearm frame: trigger press / reset, reload, slide, the muzzle rise added to the aim (the
   * player pulls it back down), the shot, the ejected brass and the mechanical sounds.
   */
  private updateSidearm(
    sim: Simulation,
    time: number,
    dt: number,
    eyes: boolean,
    tracked = false,
    reload = false,
    grabEvents: FirearmEvent[] = [],
    sidearm: Sidearm = this.sidearm!,
    advancePools = true,
  ): void {
    sidearm.setSteadyHeld(
      (['move.forward', 'move.left', 'move.back', 'move.right'] as const).every((action) =>
        actionHeld(this.keys.values, action, this.controlContext),
      ),
    )
    const weaponPosition = (
      eyes
        ? this.camera.position
            .clone()
            .add(sidearm.muzzleViewOffset(time).applyQuaternion(this.camera.quaternion))
        : (sidearm.worldMuzzle()?.sub(this.view.root.position) ??
          new THREE.Vector3(...sim.renderPlayerPosition))
    ).toArray()
    const canvas = this.options.canvas
    const events: FirearmEvent[] = [...grabEvents, sidearm.update(time)]
    if (reload && sidearm.visible) events.push(sidearm.reload(time))
    if (this.magazineAction && sidearm.visible) {
      const reload = sidearm.handleMagazine(this.magazineAction, time)
      events.push(reload)
    }
    if (this.triggerReleased) sidearm.release()
    const rise = sidearm.aimRise(time)
    if (rise && !tracked) {
      const pitchKey = sim.player.vehicleId ? 'headPitch' : 'pitch'
      this.cameraState[pitchKey] = THREE.MathUtils.clamp(
        this.cameraState[pitchKey] - rise,
        -controlDefaults.pitchLimit,
        controlDefaults.pitchLimit,
      )
    }
    const automatic = sidearm.fireMode === 'burst30'
    if (
      this.firearmSamples.looping &&
      (!this.triggerDown || !sidearm.visible || sidearm.state.chamber === 0)
    )
      this.firearmSamples.release(weaponPosition)
    const yaw = sidearm.recoilYaw.step(dt, automatic && this.triggerDown)
    if (yaw && !tracked) {
      if (sim.player.vehicleId) this.cameraState.headYaw += yaw
      else this.cameraState.yaw += yaw
    }
    if (
      this.weaponOwned &&
      (this.fireRequested || (automatic && this.triggerDown)) &&
      (tracked || this.hasInput())
    ) {
      const shot = fireSidearm(sidearm, this.gallery, sim, this.view, this.camera, time, eyes)
      if (shot?.fired && this.gallery.lastGlassImpact)
        this.effects.audio.destruction(this.gallery.lastGlassImpact, true)
      if (shot?.fired && this.gallery.lastBurst)
        this.effects.audio.destruction(
          this.gallery.lastBurst.point,
          false,
          this.gallery.lastBurst.scale,
        )
      if (shot) events.push(shot)
      if (shot?.fired && this.shotListeners.size) {
        const hit = this.gallery.lastHit
        const report: ShotReport = {
          origin: [...weaponPosition] as Vec3Tuple,
          end: hit?.point ?? ((shot.end ? [...shot.end] : [...weaponPosition]) as Vec3Tuple),
          hit: hit ? { ...hit } : null,
        }
        for (const listener of [...this.shotListeners]) listener(report)
      }
      if (shot?.fired) {
        this.firearmSamples.shot(sidearm.preset, weaponPosition, automatic, !!shot.locked)
        if (this.gallery.lastImpact)
          this.effects.audio.metalImpact(
            this.gallery.lastImpact.point,
            this.gallery.lastImpact.surface,
          )
        canvas.dataset.gunshots = String(this.effects.audio.gunshotCount)
        if (shot.impactJoules !== undefined)
          canvas.dataset.lastImpactJoules = shot.impactJoules.toFixed(0)
        this.ejectCasing(sim, eyes, sidearm)
        if (sidearm.temperature.ruptured && !sidearm.broken) {
          const parts = sidearm.ruptureParts(this.camera, this.view.root, eyes)
          if (parts) {
            this.view.destruction.breakWeapon(parts)
            this.effects.audio.destruction(weaponPosition, false)
            this.view.sparks.add(weaponPosition as [number, number, number], time)
            this.options.onMessage?.('Arma destruida por sobrecalentamiento')
          }
        }
      }
      canvas.dataset.impacts = String(this.view.impacts.count)
    }
    for (const event of events) {
      if (event.cartridgeEjected) this.ejectCartridge(sim, eyes, sidearm)
      if (event.dry) this.firearmSamples.cue(sidearm.preset, 'dry', weaponPosition)
      if (event.magazineDropped) {
        this.firearmSamples.cue(sidearm.preset, 'magazine-out', weaponPosition)
        if (event.droppedMagazine) this.dropMagazine(sim, eyes, event.droppedMagazine)
      }
      if (event.magazineSeated)
        this.firearmSamples.cue(sidearm.preset, 'magazine-in', weaponPosition)
      if (event.slideReleased)
        this.firearmSamples.cue(sidearm.preset, 'slide-forward', weaponPosition)
      if (event.manualSlideLocked) {
        this.effects.audio.weaponSound('slide-lock', weaponPosition)
        this.options.onMessage?.('Corredera bloqueada · F para desbloquear')
      }
      if (event.locked)
        this.options.onMessage?.('R: sacar / meter cargador · M: cargador largo · F: corredera')
    }
    if (advancePools && this.casingMotion && this.casingMeshes) {
      this.casingMotion.update(dt, (from, direction, length) =>
        sim.shoot(from, direction, length, 0),
      )
      for (const impact of this.casingMotion.impacts.slice(0, 3))
        this.effects.audio.casing(impact.speed, impact.position)
      this.casingMeshes.sync(this.casingMotion.poses())
      canvas.dataset.casings = String(this.casingMotion.count)
    }
    if (advancePools && this.cartridgeMotion && this.cartridgeMeshes) {
      this.cartridgeMotion.update(dt, (from, direction, length) =>
        sim.shoot(from, direction, length, 0),
      )
      for (const impact of this.cartridgeMotion.impacts.slice(0, 3))
        this.effects.audio.casing(impact.speed, impact.position)
      this.cartridgeMeshes.sync(this.cartridgeMotion.poses())
      canvas.dataset.cartridges = String(this.cartridgeMotion.count)
    }
    if (advancePools && this.magazineMotion && this.magazineMeshes) {
      this.magazineMotion.update(dt, (from, direction, length) =>
        sim.shoot(from, direction, length, 0),
      )
      const poses = this.magazineMotion.poses()
      this.magazineMeshes.sync(poses, this.droppedMagazines)
      const live = new Set(poses.map((pose) => pose.entityId))
      for (const id of this.droppedMagazines.keys())
        if (!live.has(id)) this.droppedMagazines.delete(id)
      canvas.dataset.magazines = String(this.magazineMotion.count)
    }
    const ammo = sidearm.ammo
    canvas.dataset.ammo = `${ammo.seated ? ammo.magazine : '-'}+${ammo.chamber}`
    canvas.dataset.slide = sidearm.state.slideLocked ? 'locked' : 'forward'
    canvas.dataset.reload = sidearm.state.reload
  }

  /** One spent case out of the ejection port, to the shooter's right. */
  /** The casing pool in the scene (created once, empty until shots eject casings). */
  private ensureCasingMeshes(): void {
    const casing = (this.sidearm?.preset ?? weaponPresets()[0])?.casing
    if (!casing || this.casingMeshes) return
    this.casingMeshes = new Casings(casing.lengthM, casing.rimDiameterM)
    this.view.root.add(this.casingMeshes.root)
  }
  /**
   * Number-key loadout from preset data (`weaponSlots()`). The same key again holsters.
   * Firearms reuse the sidearm path; melee and bow use `HeldWeapon`; placeholders only report.
   */
  selectWeaponSlot(slot: number): void {
    this.assertAlive()
    const entry = weaponSlots().find((item) => item.slot === slot)
    if (!entry) return
    if (entry.kind === 'placeholder') {
      this.options.onMessage?.(`${entry.name}: próximamente`)
      return
    }
    const sim = this.session.simulation
    if (!sim) return
    this.fireRequested = false
    this.triggerDown = false
    if (entry.kind === 'firearm') {
      this.heldDrawn = false
      if (this.weaponDrawn && this.sidearm?.preset?.id === entry.id) {
        this.weaponDrawn = false
        this.sidearm.setAiming(false)
        this.options.onMessage?.(this.text('Weapon holstered'))
        return
      }
      if (!this.inventory.has(entry.id)) {
        const position: Vec3Tuple = [...sim.renderPlayerPosition]
        const id = `slot-${entry.slot}-${entry.id}`
        this.inventory.add({ id, itemId: entry.id, name: entry.name, position })
        this.inventory.take(id, position)
      }
      this.ownedWeaponId = entry.id
      if (this.sidearm?.preset?.id !== entry.id) {
        this.sidearm?.dispose()
        this.sidearm = this.createSidearm(entry.preset)
      }
      this.weaponDrawn = true
      this.sidearm.visible = true
      this.sidearm.setAiming(false)
      this.options.onMessage?.(entry.name)
      return
    }
    if (this.heldDrawn && this.heldWeapon?.preset.id === entry.id) {
      this.heldDrawn = false
      this.options.onMessage?.(this.text('Weapon holstered'))
      return
    }
    if (this.weaponDrawn) {
      this.weaponDrawn = false
      this.sidearm?.setAiming(false)
      this.view.laser.enabled = false
      if (this.weaponLight) this.weaponLight.intensity = 0
    }
    if (this.heldWeapon?.preset.id !== entry.id) {
      this.heldWeapon?.dispose()
      this.heldWeapon = new HeldWeapon(entry.preset)
      void this.heldWeapon.ready.catch((error) => this.options.onError?.(error))
    }
    this.heldDrawn = true
    this.options.onMessage?.(
      entry.kind === 'melee' ? `${entry.name} · clic izquierdo: golpe` : entry.name,
    )
  }
  /** Active numbered slot, or null with empty hands. */
  get activeWeaponSlot(): number | null {
    const id = this.heldDrawn
      ? this.heldWeapon?.preset.id
      : this.weaponDrawn
        ? this.sidearm?.preset?.id
        : undefined
    return id === undefined ? null : (weaponSlots().find((item) => item.id === id)?.slot ?? null)
  }
  private swingHeldWeapon(): void {
    const sim = this.session.simulation
    const weapon = this.heldWeapon
    const melee = weapon?.preset.melee
    if (!sim || !weapon || !melee || sim.player.vehicleId) return
    if (!weapon.swing(performance.now())) return
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
    const origin = new THREE.Vector3(...sim.renderPlayerPosition)
    origin.y += 1.4
    const hit = sim.shoot(origin.toArray(), forward.toArray(), melee.reachM, melee.impulse)
    this.options.canvas.dataset.meleeHit = hit ? (hit.entityId ?? 'static') : ''
  }
  private createSidearm(preset?: ConstructorParameters<typeof Sidearm>[1]): Sidearm {
    return new Sidearm(
      this.options.canvas.parentElement!,
      preset,
      this.options.assetQuality ?? assetQualityForDevice(this.quality.preset, navigator.userAgent),
    )
  }
  private ejectionPose(eyes: boolean, sidearm = this.sidearm) {
    const pose = sidearm?.ejectionPose(eyes, this.camera.fov)
    if (pose && eyes) {
      pose.position.applyQuaternion(this.camera.quaternion).add(this.camera.position)
      pose.right.applyQuaternion(this.camera.quaternion)
      pose.up.applyQuaternion(this.camera.quaternion)
    }
    if (pose && sidearm?.tracked) pose.position.add(this.origin)
    return pose
  }

  private ejectCartridge(_sim: Simulation, eyes: boolean, sidearm = this.sidearm): void {
    const casing = sidearm?.preset?.casing
    if (!sidearm || !casing) return
    if (this.xrActive && this.xrLoadout) {
      const pose = this.ejectionPose(eyes, sidearm)
      if (!pose) return
      const item = this.xrLoadout.addCartridge(sidearm, pose.position)
      const launch = new CasingMotion(casing).eject(
        pose.position.toArray(),
        pose.right.toArray(),
        pose.up.toArray(),
      )
      if (item && launch) {
        item.velocity.fromArray(launch.velocity)
        item.angularVelocity.fromArray(launch.spin)
      }
      return
    }
    if (!this.cartridgeMeshes) {
      const clone = sidearm.cartridgeClone()
      if (!clone) return
      this.cartridgeMeshes = new DroppedMagazines(clone, 24, false)
      this.view.root.add(this.cartridgeMeshes.root)
    }
    this.cartridgeMotion ??= new CasingMotion(casing)
    const pose = this.ejectionPose(eyes, sidearm)
    if (!pose) return
    this.cartridgeMotion.eject(
      pose.position.toArray() as Vec3Tuple,
      pose.right.toArray() as Vec3Tuple,
      pose.up.toArray() as Vec3Tuple,
    )
  }

  private ejectCasing(_sim: Simulation, eyes: boolean, sidearm = this.sidearm): void {
    const casing = sidearm?.preset?.casing
    if (!casing) return
    if (!this.casingMotion) this.casingMotion = new CasingMotion(casing)
    this.ensureCasingMeshes()
    const pose = this.ejectionPose(eyes, sidearm)
    if (!pose) return
    this.casingMotion.setLimit(this.xrQuality.casingLimit)
    this.casingMotion.eject(
      pose.position.toArray() as Vec3Tuple,
      pose.right.toArray() as Vec3Tuple,
      pose.up.toArray() as Vec3Tuple,
    )
  }

  /**
   * Spent magazine out of the grip. Same bounce, rest and lifetime as a casing, with a small
   * pool of its own. The mesh is the pistol's `Magazine` node.
   */
  private dropMagazine(_sim: Simulation, eyes: boolean, entity: MagazineEntity): void {
    const sidearm = this.sidearm
    const casing = sidearm?.preset?.casing
    if (!sidearm || !casing) return
    const view = eyes ? sidearm.magazineDropView() : sidearm.worldMagazineDropView()
    if (!view) return
    if (!this.magazineMotion)
      this.magazineMotion = new CasingMotion(
        { ejectSpeedMs: 1.5, restitution: 0.2, friction: 0.65, lifetimeS: casing.lifetimeS },
        simulationDefaults.gravity,
        8,
        0.015,
      )
    if (!this.magazineMeshes) {
      const clone = sidearm.magazineClone()
      if (!clone) return
      this.magazineMeshes = new DroppedMagazines(clone, 8)
      this.view.root.add(this.magazineMeshes.root)
    }
    const camQ = this.camera.quaternion
    const origin = eyes
      ? this.camera.position.clone().add(view.position.clone().applyQuaternion(camQ))
      : view.position.clone().add(this.origin)
    const orientation = eyes ? camQ.clone().multiply(view.quaternion) : view.quaternion
    const velocity = view.direction.clone()
    if (eyes) velocity.applyQuaternion(camQ)
    velocity.normalize().multiplyScalar(1.5)
    this.droppedMagazines.set(entity.id, entity)
    this.magazineMotion.release(
      origin.toArray() as Vec3Tuple,
      velocity.toArray() as Vec3Tuple,
      [0.3, 0.5, 0.2],
      [orientation.x, orientation.y, orientation.z, orientation.w],
      entity.id,
    )
  }

  /** World laser beam from the sidearm muzzle along the look ray (when H-toggled on). */
  private updateSidearmLaser(sim: Simulation, time: number, tracked = false): void {
    const eyes = !tracked && isFirstPersonView(this.cameraState, !!sim.player.vehicleId)
    if (this.weaponLight) {
      const torch =
        this.weaponLightOn && this.weaponDrawn && this.sidearm?.visible && !this.sidearm?.broken
          ? this.sidearm?.accessoryRay(time, eyes, this.camera.fov, 'TorchSocket')
          : null
      this.weaponLight.intensity = torch ? 35 : 0
      if (torch) {
        if (eyes) {
          for (const point of [torch.origin, torch.target])
            point
              .applyQuaternion(this.camera.quaternion)
              .add(this.camera.position)
              .add(this.view.root.position)
        }
        this.weaponLight.position.copy(torch.origin)
        this.weaponLight.target.position.copy(torch.target)
      }
    }
    if (tracked || !this.sidearm?.laserEnabled || !this.weaponDrawn || !this.sidearm.visible) {
      this.view.laser.enabled = false
      return
    }
    this.view.laser.enabled = true
    const ray = this.sidearm.accessoryRay(time, eyes, this.camera.fov, 'RedLaserSocket')
    if (!ray) {
      this.view.laser.enabled = false
      return
    }
    for (const point of [ray.origin, ray.target]) {
      if (eyes) point.applyQuaternion(this.camera.quaternion).add(this.camera.position)
      else point.sub(this.view.root.position)
    }
    const origin = ray.origin
    const direction = ray.target.sub(origin).normalize()
    const target = origin.clone().addScaledVector(direction, this.sidearm.range)
    const aimed = sim.shoot(
      origin.toArray() as Vec3Tuple,
      direction.toArray() as Vec3Tuple,
      origin.distanceTo(target) + 0.01,
      0,
    )
    const end = (aimed ? aimed.point : target.toArray()) as Vec3Tuple
    this.view.laser.set(origin.toArray() as Vec3Tuple, end, !!aimed)
  }

  /** Fire or aim from one mouse button edge. Safe to call from both pointer and mouse events. */
  private applySidearmButton(button: number, down: boolean): void {
    if (this.inspector) return
    if (this.session.state !== 'playing') return
    if (down && !this.pointerLocked() && !this.pointerLockUnsupported()) return
    if (this.heldDrawn && !this.weaponDrawn) {
      if (down && button === 0) this.swingHeldWeapon()
      return
    }
    if (!this.weaponDrawn) return
    const action = sidearmButtonAction(button, down)
    if (
      action === 'fire' &&
      (actionHeld(this.keys.values, 'weapon.inspect', this.controlContext) ||
        this.safetyClickHeld) &&
      this.sidearm
    ) {
      if (!this.safetyClickHeld) {
        this.sidearm.setSafety(!this.sidearm.safe)
        this.effects.audio.weaponSound('safety', this.camera.position.toArray())
        this.options.onMessage?.(this.sidearm.safe ? 'Seguro activado' : 'Seguro desactivado')
      }
      this.safetyClickHeld = true
      this.fireRequested = false
      this.triggerDown = false
      this.sidearm.release()
      return
    }
    if (action === 'fire') {
      this.fireRequested = true
      this.triggerDown = true
    }
    if (action === 'release') {
      this.safetyClickHeld = false
      this.triggerReleased = true
      this.triggerDown = false
    }
    if (action === 'aim') this.sidearm?.setAiming(true)
    if (action === 'unaim') this.sidearm?.setAiming(false)
  }

  private pointerLocked(): boolean {
    return document.pointerLockElement === this.options.canvas
  }
  /** Pointer lock is unavailable (old or embedded browsers): fall back to drag-to-look. */
  private pointerLockUnsupported(): boolean {
    return typeof this.options.canvas.requestPointerLock !== 'function'
  }
  /**
   * The single pointer rule: while playing, the game owns the mouse. Browsers grant pointer
   * lock only from a user gesture handler (click or key), never from the frame loop, so this
   * is called from input handlers only. A refused request is harmless; the next click retries.
   */
  private capturePointer(): void {
    const canvas = this.options.canvas
    if (this.session.state !== 'playing' || this.pointerLocked() || this.pointerLockUnsupported())
      return
    this.pointerFree = false
    try {
      // Promise in current browsers, undefined in older ones; a refusal must not throw.
      const request = canvas.requestPointerLock() as unknown as Promise<void> | undefined
      if (request && typeof request.catch === 'function') request.catch(() => undefined)
    } catch {
      // Ignored: the player stays in free-mouse mode until the next click.
    }
  }
  /** Give the mouse back (free-mouse mode); the next click on the game recaptures it. */
  private releasePointer(): void {
    if (this.pointerLocked()) document.exitPointerLock()
  }
  /** True while a start camera sequence (`startCameras`) is running. */
  get startCamerasActive(): boolean {
    return !!this.startSequence
  }
  /** End a running start camera sequence: a held engine starts and the camera blends to the last view. */
  skipStartCameras(): void {
    const sim = this.session.simulation
    if (this.startSequence && sim) this.applyStartCamera(this.startSequence.skip(), sim)
  }
  private advanceStartCameras(sim: Simulation, now: number): void {
    const sequence = this.startSequence
    if (!sequence) return
    const id = sim.player.vehicleId
    if (!id) {
      this.applyStartCamera(sequence.skip(false), sim)
      return
    }
    const info = sim.vehicleInfo(id)
    const first = sequence.steps[0]
    const descending = first.view === 'map' && first.fromHeight !== undefined
    if (this.startHold) {
      // Held (host fading in): the descent waits at its start height.
      if (descending && sequence.step === 0) {
        this.cameraState.mapHeight = first.fromHeight!
        this.cameraState.mapDescentDamping = START_DESCENT_DAMPING
      }
      return
    }
    // The descent is never cut short by slow frames: the first view counts as arrived only
    // once the camera is close to its normal overhead height.
    const settling = descending && sequence.step === 0 && this.cameraState.mapDescentDamping != null
    this.applyStartCamera(
      sequence.update({
        now,
        arrived: !settling && !this.cameraState.transition && !this.cameraState.entrance,
        engineRunning: info.ignition === 'running' && info.helm !== 'off',
      }),
      sim,
    )
  }
  private applyStartCamera(action: StartCameraAction, sim: Simulation): void {
    if (action.startEngine) sim.startEngine()
    if (action.view && sim.player.vehicleId) {
      const current = gameCameraView(this.cameraState, true)
      // Normal first person is reported as bodycam, but it occupies the same driver seat.
      if (action.view !== (current === 'bodycam' ? 'cockpit' : current)) {
        this.cameraState.nextTransitionMs = action.transitionMs ?? null
        setGameCameraView(this.cameraState, action.view, true)
      }
    }
    if (action.done) {
      this.startSequence = null
      this.options.canvas.dataset.startCameras = 'complete'
    }
  }
  private cycleCamera(): void {
    // The headset owns the view in XR: the camera action (key, USB or gamepad) does nothing there.
    if (this.xrActive) return
    // The camera action during the start sequence hands the view to the player (a held engine starts).
    const sim = this.session.simulation
    if (this.startSequence && sim) this.applyStartCamera(this.startSequence.skip(false), sim)
    const message = this.game.dispatch('camera')
    if (message) this.options.onMessage?.(message)
  }
  private pollGamepad(): Gamepad | null {
    const pads = availableGamepads()
    this.usbFrame = this.usbControllers.read(pads, this.controlContext, this.hasInput())
    for (const action of this.usbFrame.pressed) {
      if (action === 'camera') this.cycleCamera()
      else this.action(action)
    }
    if (!this.hasInput() || this.usbControllers.configuring) {
      this.previousButtons = []
      return null
    }
    const mapped = this.usbControllers.mappedDevices(
      this.controlContext.mode === 'flight' ? 'flight' : 'road',
    )
    const pad =
      pads.find((p) => p?.connected && p.mapping === 'standard' && !mapped.has(usbDeviceKey(p))) ??
      null
    if (pad?.index !== this.previousPad) this.previousButtons = []
    this.previousPad = pad?.index ?? null
    if (!pad) return null
    const pressed = (index: number) => !!pad.buttons[index]?.pressed && !this.previousButtons[index]
    for (const [button, action] of gamepadActionButtons) {
      if (!pressed(button)) continue
      if (action === 'camera') this.cycleCamera()
      else this.action(action)
    }
    this.previousButtons = pad.buttons.map((button) => button.pressed)
    return pad
  }
  get controlContext(): InputContext {
    const sim = this.session.simulation
    const id = sim?.player.vehicleId
    const vehicle = id
      ? this.document.entities.find((entity) => entity.id === id)?.vehicle
      : undefined
    return {
      mode: inputMode(!!id, !!(id && sim?.vehicleInfo(id).flightMode), vehicle),
      weapon: this.weaponDrawn,
      aiming: !!this.sidearm?.isAiming,
      menu: !!(id && this.view.vehicleMenu(id)?.open),
    }
  }
  private updateHeadlamp(eyes?: THREE.Object3D, eyeOrigin = true): void {
    const occupied = !!this.session.simulation?.player.vehicleId
    if (occupied && this.headlamp.enabled) this.setHeadlamp(false)
    this.headlamp.update(this.view.headLightMount, eyes, occupied, eyeOrigin)
  }
  /** Actual beam of the occupied vehicle, for HUD indicators. */
  get vehicleActiveBeam(): 'low' | 'high' | null {
    const id = this.session.simulation?.player.vehicleId
    return id ? this.view.vehicleActiveBeam(id) : null
  }
  get headlampEnabled(): boolean {
    return this.headlamp.enabled
  }
  private bodyRig: PlayerBodyRig | null = null
  /**
   * Give the on-foot player a skinned body (see player-body.ts for the asset contract); null
   * removes it. Resolves with the rig so remote players can share it ({@link PlayerBodyRig.create}).
   */
  async setPlayerBody(assets: PlayerBodyAssets | null): Promise<PlayerBodyRig | null> {
    this.playerBodyChosen = true
    return this.loadPlayerBody(assets)
  }
  /** Host chose a body (or none, `null`): the engine default is then never loaded. */
  private playerBodyChosen = false
  private async loadPlayerBody(assets: PlayerBodyAssets | null, fallback = false) {
    const rig = assets ? await PlayerBodyRig.load(assets) : null
    // The default arrives late; a host choice made meanwhile wins.
    if (fallback && this.playerBodyChosen) return null
    this.bodyRig = rig
    this.view.setPlayerBody(this.bodyRig?.create() ?? null)
    return this.bodyRig
  }
  /** The local player's body state to send to other clients (null without a body). */
  get avatarState(): AvatarNetState | null {
    return this.view.avatarNetState
  }
  /**
   * The loaded body rig (null until {@link setPlayerBody} resolves): remote players' bodies are
   * `rig.create()`, added with {@link attachSceneryLayer} so they share `avatarState` positions.
   */
  get playerBodyRig(): PlayerBodyRig | null {
    return this.bodyRig
  }
  setHeadlamp(enabled: boolean): void {
    this.headlamp.enabled = enabled && !this.session.simulation?.player.vehicleId
    this.view.setHeadLight(this.headlamp.enabled)
  }
  getVehicleBeamCutoff(kind: 'low' | 'high'): number {
    return getVehicleBeamCutoff(kind)
  }
  setVehicleBeamCutoff(kind: 'low' | 'high', degrees: number): void {
    setVehicleBeamCutoff(kind, degrees)
  }

  get headlampShadows(): boolean {
    return this.headlamp.shadows
  }
  private collisionDebugTimer: ReturnType<typeof setInterval> | null = null
  /** Development › Show collision: every collider as lines (polled at 2 Hz, nothing when off). */
  get collisionDebug(): boolean {
    return this.collisionDebugTimer !== null
  }
  setCollisionDebug(enabled: boolean): void {
    if (this.collisionDebugTimer) clearInterval(this.collisionDebugTimer)
    this.collisionDebugTimer = null
    if (!enabled) {
      this.view.setCollisionLines(null)
      return
    }
    let busy = false
    const poll = async () => {
      const sim = this.session.simulation
      if (busy || !sim) return
      busy = true
      try {
        const threaded = threadedSimulation(sim)
        const lines = threaded ? await threaded.collisionDebug() : await sim.collisionDebug()
        if (this.collisionDebugTimer) this.view.setCollisionLines(lines)
      } catch (error) {
        console.warn('collision debug', error)
      } finally {
        busy = false
      }
    }
    this.collisionDebugTimer = setInterval(poll, 500)
    void poll()
  }
  setHeadlampShadows(enabled: boolean): void {
    this.headlamp.shadows = enabled
    // Explicit local shadows work even when the quality tier disables sun shadows.
    // Retain the renderer layout after first enable to avoid recompiling on every toggle.
    if (enabled) this.renderer.shadowMap.enabled = true
  }
  /** Host controls use the same action dispatch as keyboard, VR and gamepads. */
  performControl(value: string): void {
    this.assertAlive()
    this.options.canvas.focus()
    this.effects.audio.unlock()
    if (value === 'camera') this.cycleCamera()
    else this.action(value)
  }
  /** Whether an Enter action can currently reach a vehicle. */
  get canEnterVehicle(): boolean {
    const sim = this.session.simulation
    return !!sim && !sim.player.vehicleId && sim.nearestVehicle() !== null
  }
  private action(value: string): void {
    if (this.inspector) return
    const sim = this.session.simulation
    if (!sim) return
    const context = this.controlContext
    const raw = legacyInputAction(value) ?? bindingForKey(value, context)
    if (!raw || (context.menu && !raw.startsWith('menu.'))) return
    const action = contextualAction(raw, context)
    if (
      (action === 'lean.left' || action === 'lean.right' || action === 'interact') &&
      !sim.player.vehicleId &&
      this.weaponDrawn &&
      this.sidearm?.isAiming
    )
      return
    if (!sim.player.vehicleId && actionCompletesChord(this.keys.values, 'prone', action, context)) {
      sim.setStance('prone')
      this.options.onMessage?.('Cuerpo a tierra · ' + controlsHint({ mode: 'walk' }, ['stance']))
      return
    }
    if (action === 'interact') {
      const nearby = this.nearbyPickup(sim)
      const item =
        nearby &&
        this.inventory.take(nearby.id, sim.renderPlayerPosition, (pickup) =>
          this.pickupVisible(sim, pickup),
        )
      if (item) {
        const root = this.pickupModels.get(item.id)
        if (root) {
          root.removeFromParent()
          disposeObject(root)
          this.pickupModels.delete(item.id)
        }
        this.ownedWeaponId = item.itemId
        if (this.sidearm?.preset?.id !== item.itemId) {
          this.sidearm?.dispose()
          this.sidearm = this.createSidearm(
            weaponPresets().find((preset) => preset.id === item.itemId),
          )
        }
        this.weaponDrawn = true
        this.sidearm.visible = true
        this.options.onMessage?.(
          this.text('Picked up {0}', item.name) + ' · ' + controlsHint(context, ['holster']),
        )
        return
      }
    }
    if (action === 'debug.wheels') {
      this.wheelDebug.toggle()
      return
    }
    const slotAction = /^weapon\.slot(\d)$/.exec(action)
    if (slotAction) {
      if (!sim.player.vehicleId) this.selectWeaponSlot(Number(slotAction[1]))
      return
    }
    if (action === 'holster' && this.heldDrawn) {
      this.heldDrawn = false
      this.options.onMessage?.(this.text('Weapon holstered'))
      return
    }
    if (action === 'holster') {
      if (!this.weaponOwned) return
      this.weaponDrawn = !this.weaponDrawn
      this.fireRequested = false
      this.triggerDown = false
      if (this.weaponDrawn && !this.sidearm) this.sidearm = this.createSidearm()
      this.sidearm?.setAiming(false)
      this.view.laser.enabled = this.weaponDrawn && !!this.sidearm?.laserEnabled
      if (this.weaponLight)
        this.weaponLight.intensity = this.weaponDrawn && this.weaponLightOn ? 35 : 0
      this.options.onMessage?.(
        this.weaponDrawn ? this.text('Weapon drawn') : this.text('Weapon holstered'),
      )
      return
    }
    if (
      this.xrActive &&
      this.weaponDrawn &&
      [
        'weapon.magazine',
        'weapon.slide',
        'weapon.auto',
        'weapon.chamber',
        'weapon.inspect',
      ].includes(action)
    )
      return
    if ((action === 'weapon.magazine' || action === 'weapon.slide') && this.weaponDrawn) {
      if (this.sidearm?.state.reload !== 'none') return
      this.magazineAction =
        action === 'weapon.slide'
          ? 'release'
          : this.sidearm?.state.magazineSeated
            ? 'drop'
            : 'insert'
      return
    }
    if (
      (action === 'weapon.inspect' || action === 'weapon.chamber') &&
      this.weaponDrawn &&
      this.sidearm
    ) {
      this.sidearm.inspect(performance.now(), action === 'weapon.chamber')
      if (action === 'weapon.chamber')
        this.firearmSamples.cue(this.sidearm?.preset, 'slide-back', this.camera.position.toArray())
      return
    }
    if (
      (action === 'weapon.laser' || action === 'weapon.light') &&
      this.weaponDrawn &&
      this.sidearm
    ) {
      if (action === 'weapon.laser') {
        const on = this.sidearm.toggleLaser()
        this.view.laser.enabled = on
        this.options.onMessage?.(on ? this.text('Laser on') : this.text('Laser off'))
      } else {
        this.weaponLightOn = !this.weaponLightOn
        this.sidearm.setLightEnabled(this.weaponLightOn)
        this.options.onMessage?.(this.weaponLightOn ? 'Linterna encendida' : 'Linterna apagada')
      }
      return
    }
    // Experimental full-auto: M on foot with the pistol drawn. At a ship helm (or on foot without
    // the pistol) M keeps its game meaning (helm mode / its notice).
    if (
      action === 'weapon.auto' &&
      this.weaponDrawn &&
      !sim.player.vehicleId &&
      this.sidearm?.selectFire
    ) {
      this.sidearm.setFireMode(nextFireMode(this.sidearm.fireMode))
      this.triggerDown = false
      this.effects.audio.weaponSound('safety', this.camera.position.toArray())
      this.options.onMessage?.(this.sidearm.fireMode === 'semi' ? 'SEMI' : 'AUTO')
      return
    }
    if (action === 'weapon.auto' && this.weaponDrawn && !sim.player.vehicleId && this.sidearm) {
      this.magazineAction = 'automatic'
      this.triggerDown = false
      return
    }
    if (action === 'headlamp' && !sim.player.vehicleId) {
      this.setHeadlamp(!this.headlampEnabled)
      return
    }
    if (action === 'horn' && sim.player.vehicleId) {
      this.effects.audio.horn()
      return
    }
    if (action === 'gallery.reset') this.gallery.reset()
    if (action === 'interact' && !sim.player.vehicleId) {
      const id = sim.nearestVehicle()
      if (id && !this.drivingPrepared.has(id)) {
        if (this.enteringVehicle) return
        const entity = this.document.entities.find((e) => e.id === id)
        if (!entity) return
        this.enteringVehicle = true
        const assembly = [entity, ...this.document.entities.filter((e) => e.parentId === id)]
        void this.prewarmVehicle(assembly)
          .then(() => {
            if (this.disposed || this.session.simulation !== sim) return
            this.drivingPrepared.add(id)
            if (
              this.session.state === 'playing' &&
              !sim.player.vehicleId &&
              sim.nearestVehicle() === id
            )
              this.action('interact')
          })
          .catch((error) => {
            this.options.onMessage?.(t('game.could-not-prepare-the-vehicle-you-can-try-again'))
            console.error('Vehicle preparation failed', error)
          })
          .finally(() => {
            this.enteringVehicle = false
          })
        return
      }
    }
    let message = this.game.dispatch(action)
    if ((action === 'signal.left' || action === 'signal.right') && sim.player.vehicleId) {
      this.view.signal(sim.player.vehicleId, action === 'signal.left' ? -1 : 1)
      message = controlsHint(context, ['signal.left', 'signal.right'])
    }
    if (action === 'lights') {
      if (sim.player.vehicleId) {
        const mode = this.view.cycleVehicleLights(sim.player.vehicleId)
        if (mode !== null) message = this.text(lightModeNotice[mode])
      }
    }
    if (action === 'gps' && sim.player.vehicleId) {
      const open = this.view.toggleVehicleGps(sim.player.vehicleId)
      if (open !== null) message = open ? this.text('GPS on') : this.text('GPS off')
    }
    if (action === 'highBeam' && sim.player.vehicleId) {
      const high = this.view.toggleVehicleHighBeam(sim.player.vehicleId)
      if (high !== null)
        message = high ? this.text('High beams selected') : this.text('Low beams selected')
    }
    if (message) this.options.onMessage?.(message)
  }
  private bindInput(): void {
    const options = { signal: this.lifetime.signal }
    const canvas = this.options.canvas
    for (const event of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'pointermove', 'wheel'])
      window.addEventListener(event, () => this.cameraActivity(), { ...options, capture: true })
    // Mouse look, aim and fire carry the live Shift state: resync sprint from them so a Shift
    // that was held through an input release (pointer re-capture, blur) runs again at once.
    for (const event of [
      'pointerdown',
      'pointerup',
      'pointermove',
      'mousedown',
      'mouseup',
    ] as const)
      canvas.addEventListener(
        event,
        (e) => {
          if (this.hasInput() && this.session.state === 'playing')
            this.keys.syncShift(e.shiftKey, performance.now())
        },
        options,
      )
    canvas.addEventListener(
      'wheel',
      (event) => {
        // Wheel zoom for the detached views, seated or on foot: overhead height and
        // cinematic orbit distance. Other views leave the wheel to the page.
        const state = this.cameraState
        if (!this.hasInput() || !this.session.simulation) return
        const sim = this.session.simulation
        if (
          !sim.player.vehicleId &&
          this.weaponDrawn &&
          this.sidearm?.visible &&
          !this.sidearmAimPreview &&
          isFirstPersonView(state, false)
        ) {
          this.weaponWheel = stepWeaponWheel(this.weaponWheel, this.sidearm.isAiming, event.deltaY)
          this.sidearm.playerWheel = this.weaponWheel
          try {
            browserStorage()?.setItem('nabla.weaponWheel', JSON.stringify(this.weaponWheel))
          } catch {
            /* Storage is optional. */
          }
          canvas.dataset.weaponHandStep = String(this.weaponWheel.hand + 1)
          canvas.dataset.weaponAimDistance = this.weaponWheel.distance.toFixed(2)
          event.preventDefault()
          return
        }
        const scale = Math.exp(event.deltaY * controlDefaults.mapZoomSensitivity)
        if (state.mode === 'map') {
          state.mapZoom = THREE.MathUtils.clamp(
            state.mapZoom * scale,
            controlDefaults.mapZoomMin,
            controlDefaults.mapZoomMax,
          )
        } else if (state.mode === 'cinematic') {
          state.cinematicZoom = THREE.MathUtils.clamp(
            state.cinematicZoom * scale,
            controlDefaults.cinematicZoomMin,
            controlDefaults.cinematicZoomMax,
          )
        } else if (
          state.mode === 'chase' &&
          !isFirstPersonView(state, !!this.session.simulation.player.vehicleId)
        ) {
          state.chaseZoom = THREE.MathUtils.clamp(
            (state.chaseZoom ?? 1) * scale,
            controlDefaults.chaseZoomMin,
            controlDefaults.chaseZoomMax,
          )
        } else return
        event.preventDefault()
      },
      { ...options, passive: false },
    )
    canvas.parentElement!.addEventListener(
      'pointerdown',
      (event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('.portal-tablet-layer button')
        ) {
          event.preventDefault()
          canvas.focus()
          this.effects.audio.unlock()
        }
        if (event.target === canvas.parentElement) {
          event.preventDefault()
          canvas.focus()
          this.effects.audio.unlock()
          // Free mouse over interactive monitors: the canvas lets clicks through, so a click
          // outside every monitor lands here and hands the mouse back to the game.
          if (event.pointerType === 'mouse') this.capturePointer()
        }
      },
      options,
    )
    canvas.addEventListener(
      'pointerdown',
      (event) => {
        canvas.focus()
        this.effects.audio.unlock()
        const mouse = event.pointerType === 'mouse'
        if (mouse && this.session.state === 'playing') {
          if (this.pointerLocked()) {
            // Clicking an in-world monitor under the crosshair frees the mouse for that UI.
            if (event.button === 0 && this.monitors.panelAt(innerWidth / 2, innerHeight / 2)) {
              event.preventDefault()
              this.releasePointer()
              return
            }
          } else if (!this.pointerLockUnsupported()) {
            // Free-mouse mode: this click only recaptures the pointer; it does not shoot.
            event.preventDefault()
            this.capturePointer()
            return
          }
        }
        this.applySidearmButton(event.button, true)
      },
      options,
    )
    canvas.addEventListener(
      'pointerup',
      (event) => {
        this.applySidearmButton(event.button, false)
      },
      options,
    )
    // Pointer lock does not emit pointerdown/pointerup for a second button. Aim is right click;
    // left click while it is held must still arrive, so the mouse events are listened to as well.
    canvas.addEventListener(
      'mousedown',
      (event) => this.applySidearmButton(event.button, true),
      options,
    )
    canvas.addEventListener(
      'mouseup',
      (event) => this.applySidearmButton(event.button, false),
      options,
    )
    canvas.addEventListener(
      'pointercancel',
      () => {
        this.triggerReleased = true
        this.triggerDown = false
        this.sidearm?.setAiming(false)
      },
      options,
    )
    canvas.addEventListener(
      'contextmenu',
      (event) => {
        if (this.session.state === 'playing') event.preventDefault()
      },
      options,
    )
    canvas.addEventListener(
      'keydown',
      (event) => {
        if (!this.hasInput() || this.session.state !== 'playing') return
        // A Shift keydown is a modifier change, not a repeat of the newest key.
        if (!inputBindings.sprint.keys.includes(event.code))
          this.keys.syncShift(event.shiftKey, performance.now())
        if (event.ctrlKey || event.metaKey || event.altKey) return
        if (event.code === 'Home') {
          event.preventDefault()
          if (!event.repeat) this.toggleInspection()
          return
        }
        if (this.inspector) {
          event.preventDefault()
          if (inputBindings['pointer.release'].keys.includes(event.code)) this.releasePointer()
          else {
            this.keys.press(event.code, event.repeat, performance.now())
            if (!this.pointerFree) this.capturePointer()
          }
          return
        }
        // Escape while unlocked asks for the free mouse; any other key while the game should
        // own the pointer (first keypress after loading, or a refused lock) captures it.
        if (bindingForKey(event.code, this.controlContext) === 'pointer.release')
          this.pointerFree = true
        else if (!this.pointerFree && !event.repeat) this.capturePointer()
        if (bindingForKey(event.code, this.controlContext) !== undefined) event.preventDefault()
        const id = this.session.simulation?.player.vehicleId
        if (id && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const result = vehicleMenuKey(
            this.view,
            this.document,
            id,
            event.code,
            event.repeat,
            (message) => this.options.onMessage?.(message),
            (entityId, patch) => {
              const entity = this.document.entities.find((e) => e.id === entityId)
              if (entity) Object.assign(entity, patch)
            },
            this.text,
            (entityId, mode) =>
              this.session.simulation?.setEngineMode(entityId, mode) ??
              t('game.this-vehicle-has-a-single-engine-mode'),
            (step) => {
              this.applyCameraFov(nextCameraFovOffset(this.fovOffset, step))
              writeCameraFovOffset(browserStorage(), this.fovOffset)
              const { firstPersonFov, chaseFov } = this.cameraState.settings
              return this.text('FOV cockpit {0}° · driving {1}°', firstPersonFov, chaseFov)
            },
            (action) => {
              const track = this.effects.audio.musicTrack
              if (!track) return t('game.no-music')
              if (action === 'stop') {
                this.effects.audio.fadeOutMusic(0.8)
                return t('game.music-stopped')
              }
              return this.effects.audio.playMusic()
                ? t('game.music-track', { title: track.title ?? t('game.track') })
                : t('game.music-muted-in-settings-to-audio')
            },
            (action) => {
              const sim = this.session.simulation!
              if (action === 'cargo') {
                void this.loadTrailerCars(id).catch((error) =>
                  this.options.onMessage?.(String(error)),
                )
                return 'Preparando carga del portacoches'
              }
              if (['extend', 'retract', 'angle-up', 'angle-down'].includes(action))
                return sim.adjustTrailerRamp(id, action)
              return sim.setTrailerPlatform(id, action === 'flat')
            },
          )
          if (result.handled) {
            event.preventDefault()
            this.game.releaseInput()
            if (result.opened) this.cameraState.mode = 'cockpit'
            return
          }
        }
        this.keys.press(event.code, event.repeat, performance.now())
        this.effects.audio.unlock()
        if (!event.repeat) {
          const action = bindingForKey(event.code, this.controlContext)
          if (action === 'weapon.slide' && this.weaponDrawn && this.sidearm)
            this.sidearm.state.manualRackHeld =
              this.sidearm.state.reload === 'none' && !this.sidearm.state.slideLocked
          if (action === 'highBeam' && id && this.view.beginVehicleBeamFlash(id)) {
            this.releaseBeamFlash()
            this.view.beginVehicleBeamFlash(id)
            this.beamFlash = { vehicle: id, key: event.code }
          } else if (action) this.action(action)
        }
      },
      options,
    )
    window.addEventListener(
      'keyup',
      (event) => {
        this.keys.release(event.code)
        if (this.beamFlash?.key === event.code) this.releaseBeamFlash()
        if (inputBindings['weapon.slide'].keys.includes(event.code) && this.sidearm)
          this.sidearm.state.manualRackHeld = false
        if (
          inputBindings['weapon.inspect'].keys.includes(event.code) ||
          inputBindings['weapon.chamber'].keys.includes(event.code)
        ) {
          this.sidearm?.stopInspect(performance.now())
          if (inputBindings['weapon.chamber'].keys.includes(event.code) && this.weaponDrawn)
            this.effects.audio.weaponSound('slide-forward', this.camera.position.toArray())
        }
      },
      {
        ...options,
        capture: true,
      },
    )
    window.addEventListener('pagehide', () => this.releaseInput(), options)
    // Losing pointer lock (Escape, menus, monitors, browser UI) enters free-mouse mode until the
    // next click, and can swallow the keyups of held controls.
    document.addEventListener(
      'pointerlockchange',
      () => {
        if (document.pointerLockElement === canvas) {
          this.pointerFree = false
          return
        }
        if (this.session.state === 'playing') this.pointerFree = true
        this.releaseInput()
      },
      options,
    )
    canvas.addEventListener('blur', () => this.releaseInput(), options)
    window.addEventListener('blur', () => this.releaseInput(), options)
    document.addEventListener(
      'visibilitychange',
      () => {
        this.releaseInput()
        this.effects.audio.setSuspended(document.hidden || this.session.state !== 'playing')
        this.effects.audio.setPageHidden(document.hidden)
        this.lastTime = null
      },
      options,
    )
    // Mouse look runs only while the game owns the pointer. In free-mouse mode the cursor is for
    // UI; touch, pen and browsers without pointer lock look by dragging instead.
    canvas.addEventListener(
      'pointermove',
      (event) => {
        if (!this.hasInput()) return
        if (this.inspector) {
          if (this.pointerLocked() || event.buttons & 1)
            this.inspector.look(event.movementX, event.movementY)
          return
        }
        const state = this.cameraState
        const seated = !!this.session.simulation?.player.vehicleId
        if (!mouseLooksWithoutButton(state, seated)) return
        if (!this.pointerLocked()) {
          const dragging = !!(event.buttons & 1)
          if (!dragging || (event.pointerType === 'mouse' && !this.pointerLockUnsupported())) return
        }
        state.lastLookTime = performance.now()
        if (state.mode === 'cockpit' && seated) {
          state.headYaw -= event.movementX * controlDefaults.mouseSensitivity
          state.headPitch = THREE.MathUtils.clamp(
            state.headPitch + event.movementY * controlDefaults.mouseSensitivity,
            -controlDefaults.pitchLimit,
            controlDefaults.pitchLimit,
          )
        } else {
          let yaw = -event.movementX * controlDefaults.mouseSensitivity,
            pitch = event.movementY * controlDefaults.mouseSensitivity
          if (
            !!this.cameraState.bodycam &&
            this.weaponDrawn &&
            !seated &&
            isFirstPersonView(state, false)
          ) {
            const motion = this.bodycam.move(yaw, pitch)
            yaw = motion.yaw
            pitch = motion.pitch
          }
          state.yaw += yaw
          state.pitch = THREE.MathUtils.clamp(
            state.pitch + pitch,
            -controlDefaults.pitchLimit,
            controlDefaults.pitchLimit,
          )
        }
      },
      options,
    )
  }
  private assertAlive(): void {
    if (this.disposed) throw new Error('Game runtime disposed')
  }
}
