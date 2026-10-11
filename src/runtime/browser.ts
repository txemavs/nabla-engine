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
import type { VehicleLightMode } from '../render/vehicle-presentation/light-controller.js'
import { worldWater } from './water.js'
import { liveSkyClock, skyRate, type SkyClock } from '../planet/sky.js'
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
  type PerformanceSettings,
} from './performance.js'
import { readSavedPlanetVisual, writeSavedPlanetVisual } from './planet-visual.js'
import type { MissingTile } from '../planet/missing-tiles.js'
import { GameRenderPipeline } from './render-pipeline.js'
import { Sidearm } from './sidearm.js'
import { PickupInventory, type WorldPickup } from '../simulation/items/pickups.js'
import { magazineInsertClick, magazineReleaseClick } from '../audio/gear-click.js'
import { fireModeLabel, nextFireMode } from '../simulation/weapons/machine-pistol.js'
import { FireModeBadge } from './fire-mode-badge.js'
import { Gallery } from './gallery.js'
import { fireSidearm, sidearmButtonAction } from './shooting.js'
import { CasingMotion } from '../simulation/weapons/casings.js'
import { Casings } from '../render/entity/casings.js'
import { DroppedMagazines } from '../render/entity/magazines.js'
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
import { vehicleMenuKey } from './vehicle-menu.js'
import { VehicleWarmup } from './vehicle-warmup.js'
import { createEntity } from '../entity/schema.js'
import { showLoadingBadge } from './loading-badge.js'
import { readAudioMix, writeAudioMix, type AudioMixLevels } from '../audio/mixer.js'
import type { MusicTrack } from '../audio/music.js'
import {
  cameraFovFor,
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
import { localToGeo, geoToLocal, EARTH_RADIUS } from '../math/geo/sphere.js'
import { mapTileSample } from '../scene/mercator.js'
import type { PlayOptions } from './session.js'
import {
  createGameCameraState,
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
import { VehicleEffects } from './vehicle-effects.js'
import { gearLabel } from '../entity/vehicle/gear-label.js'

import { groundAtSeam, waitForArea, waitForGround } from './ground.js'
import { uploadSceneTextures, warmGamePresentation } from './presentation-warmup.js'
import { GameHud } from './hud.js'
import { FlipCinematic } from './flip-cinematic.js'
import {
  navigationRoads,
  nearestLocality,
  nearestStreet,
} from '../render/entity/navigation-places.js'
import { WheelDebugOverlay } from '../diagnostics/wheel-debug.js'
import { createRuntimeText, type RuntimeLocale } from './messages.js'

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

export interface GameRuntimeOptions {
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
  preloadVehicles?: readonly (readonly Entity[])[]
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

export class GameRuntime {
  readonly game = new SharedGameRuntime()
  readonly session = this.game.session
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
  private readonly remoteViews: RemotePortalViews
  private readonly worldContent: WorldContent | undefined
  private readonly fieldLighting: FieldLighting | null
  private display: DisplaySettings
  private readonly adaptive: AdaptiveResolutionScale
  private probing: Promise<unknown> | null = null
  private attract: {
    loop: FrameLoop
    started: number
    last: number | null
    options: Required<AttractOptions>
  } | null = null
  private quality: PerformanceSettings
  private readonly pipeline = new GameRenderPipeline()
  private readonly gallery: Gallery
  private sidearm: Sidearm | null = null
  private readonly inventory = new PickupInventory()
  private ownedWeaponId: string | null = null
  private readonly pickupModels = new Map<string, THREE.Group>()
  private pickupGeneration = 0
  private spawned: string[] = []
  private spawnSequence = 0
  private vehicleWarmup: VehicleWarmup | null = null
  private placed: { id: string; name: string; ids: string[] }[] = []
  private placeSequence = 0
  private weaponDrawn = false
  private fireRequested = false
  private triggerReleased = false
  /**
   * Left button held (on foot, pistol drawn). `fireRequested` is a one-frame edge cleared every
   * frame; RÁFAGA keeps firing while this stays true.
   */
  private triggerDown = false
  private fireModeBadge: FireModeBadge | null = null
  private reloadRequested = false
  private casingMotion: CasingMotion | null = null
  private casingMeshes: Casings | null = null
  private magazineMotion: CasingMotion | null = null
  private magazineMeshes: DroppedMagazines | null = null
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
  private loading: AbortController | null = null
  private readonly revealGates: Promise<unknown>[] = []
  private readonly revealTasks: (() => Promise<unknown>)[] = []
  private startHold: Promise<unknown> | null = null
  private lastTime: number | null = null
  private previousButtons: boolean[] = []
  private previousPad: number | null = null
  private readonly originalTabIndex: string | null
  private disposed = false
  private readonly hud: GameHud | null
  private readonly wheelDebug = new WheelDebugOverlay()
  private readonly text: ReturnType<typeof createRuntimeText>
  private fovBase: CameraFovBase = { firstPersonFov: 70, chaseFov: 48 }
  private fovOffset = 0
  private weaponTuning = readSidearmTuning(browserStorage())
  private sidearmAimPreview = false
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
    try {
      this.smokeOn = browserStorage()?.getItem('nabla.smoke') !== '0'
    } catch {
      /* Keep the default if storage is disabled. */
    }
    this.startCameras = resolveStartCameras(options.startCameras)
    this.flipCinematic.enabled = options.flipCinematic !== false
    applyAsphaltContrast(options.asphaltContrast ?? 1)
    // Reject malformed JavaScript callers before allocating browser resources.
    if (options.tiles) normalizeTilesBase(options.tiles.baseUrl)
    this.text = createRuntimeText(options.locale, options.messages)
    this.game.text = this.text
    this.game.recover.snapToRoad = options.recoverToRoad !== false
    this.game.recover.roads = () => navigationRoads().filter((road) => road.carriageway)
    this.game.recover.pavedAreas = () => this.world?.pavedAreas ?? []
    this.hud = options.hud ? new GameHud(options.canvas.parentElement!, this.text) : null
    this.scene.add(this.wheelDebug.root)
    this.display = resolveDisplaySettings(options.display, options.performance?.preset)
    this.adaptive = new AdaptiveResolutionScale({
      mode: this.display.resolutionScaleMode,
      scale: this.display.resolutionScale,
    })
    this.adaptive.setTargetFrameMs(this.display.maxFps ? 1000 / this.display.maxFps : null)
    Object.assign(this.cameraState, createGameCameraState(options.camera))
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
    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true,
    })
    configureWorldRenderer(this.renderer)
    if (options.onDiagnostics) this.renderer.info.autoReset = false
    this.applyPixelRatio()
    this.renderer.shadowMap.enabled = this.quality.shadows > 0
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.shadowMap.autoUpdate = false
    this.scene.add(this.sun, this.ambient, this.catchFloor.mesh)
    this.fieldLighting = options.fieldLights ? new FieldLighting(options.fieldLights) : null
    if (this.fieldLighting) this.scene.add(this.fieldLighting.lights.root)
    this.view = new SceneView(this.document, false, false, {
      mirrorPolicy: mirrorPolicyForQuality(this.quality.preset),
      steeringWheelOffset: (model) => initialSteeringWheelOffset(options.steeringWheel, model),
      mirrorAdjustment: (model) => initialMirrorAdjustment(options.mirrors, model),
      startLights: options.startLights,
    })
    this.scene.add(this.view.root)
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
    this.gallery = new Gallery(options.canvas.parentElement!, this.text)
    this.sky = new GeographicView(this.document, () => {})
    // Reattach after Play extraction: viewer still parents the flare; game must too.
    this.scene.add(this.sky.lensFlare)
    this.environment = new WorldEnvironment(this.scene, this.sun, this.ambient)
    this.planet.sea = this.options.sea !== false
    this.syncPlanet()
    this.effects = new VehicleEffects(this.scene)
    this.effects.audio.mixer.set(readAudioMix(browserStorage()) ?? {})
    this.effects.audio.setEnabled(options.audio !== false)
    this.effects.audio.setMusic(options.music)
    if (options.music?.menuLabel) setCarMenuMusicLabel(options.music.menuLabel)
    const touchActions = {
      engage: () => {
        options.canvas.focus()
        this.effects.audio.unlock()
      },
      interact: () => this.action('KeyE'),
      camera: () => this.cycleCamera(),
      respawn: () => this.action('KeyR'),
    }
    this.touchDriving =
      options.touchControls === false
        ? null
        : new TouchDriving(
            options.canvas.parentElement!,
            touchActions,
            options.touchControls ?? 'auto',
            this.text,
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
    this.shadows.setBiasScale(options.shadowBias ?? shadowBiasRange.default)
    if (this.quality.shadows > 0)
      this.shadows.init({
        camera: this.camera,
        scene: this.scene,
        lightDirection: new THREE.Vector3(25, -45, -25).normalize(),
        tier: shadowTiers[this.quality.shadows]!,
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
            options.tiles,
          )
        : null
    if (this.world) {
      const budget = streamBudget(this.quality)
      this.world.setQuality(budget.concurrent, budget.ahead, budget.retain, budget.tiles)
      this.world.setDistance(this.quality.distance)
      this.world.setRelief(this.quality.relief)
      this.scene.add(this.world.root)
      setPlanetCharts(() => this.world!.chartTiles)
      setNavigationPlaces(() => this.world!.navigationPlaces)
      setNavigationRoads(() => this.world!.navigationRoads)
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

  /** Prepare usable terrain and presentation before starting physics; reject cancelled/failed loads. */
  async play(options: PlayOptions = {}): Promise<void> {
    this.assertAlive()
    this.stop()
    const controller = new AbortController()
    this.loading = controller
    const document = structuredClone(this.document)
    try {
      if (this.world) {
        const progress = (status: string) =>
          this.options.onProgress?.(
            status,
            this.world!.activeTiles.map((tile) => tile.key),
          )
        // A finite example loads its declared coverage before the player can cross a seam.
        for (const tile of this.options.tiles?.tiles ?? []) {
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
        spawn.transform.position[1] = ground + playGroundClearance(spawn)
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
      const simulation = await this.game.play(document, {
        playerMode: 'walk',
        ...options,
        planetaryTerrain: !!document.geography?.planetary,
      })
      simulation.setCollisionDistance(this.quality.collisions)
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
      controller.signal.throwIfAborted()
      const first = this.startSequence?.steps[0]
      if (first?.view === 'map' && first.fromHeight !== undefined) {
        this.cameraState.mapHeight = first.fromHeight
        this.cameraState.mapDescentDamping = START_DESCENT_DAMPING
      }
      // The scene clock starts at its authored time (e.g. 10:00) at reveal, not at construction.
      const clock = this.document.sky
      if (clock?.mode === 'live' && clock.origin) this.setSkyClock({ ...clock, since: Date.now() })
      this.options.canvas.dataset.reveal = 'play'
      this.stopAttract()
      this.view.setPlaying(true)
      this.effects.audio.setSuspended(globalThis.document.hidden)
      this.world?.renderUpdate(this.origin, !!this.quality.buildings, this.session.simulation)
      this.lastTime = null
      if (this.options.clock !== 'manual') this.loop.start()
    } catch (error) {
      if (this.loading === controller) this.stop()
      throw error
    } finally {
      if (this.loading === controller) this.loading = null
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
    if (this.session.state === 'playing' && this.options.clock !== 'manual') this.loop.start()
  }
  /** Cancel loading and reset gameplay/presentation for replay while retaining reusable renderer resources. */
  stop(): void {
    if (this.disposed) return
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
    this.clearPickups()
    this.sidearmAimPreview = false
    if (this.sidearm) {
      this.sidearm.visible = false
      this.sidearm.reset()
    }
    this.casingMotion?.reset()
    this.casingMeshes?.sync([])
    this.magazineMotion?.reset()
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
    this.frame(time)
  }
  /** Fit renderer and projection to canvas CSS dimensions; ignore notifications after disposal. */
  resize(): void {
    if (this.disposed) return
    const width = Math.max(1, this.options.canvas.clientWidth)
    const height = Math.max(1, this.options.canvas.clientHeight)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }
  /** Release GPU/audio/DOM listeners and restore canvas tab index. Idempotent and terminal. */
  dispose(): void {
    if (this.disposed) return
    this.stopAttract()
    this.stop()
    this.disposed = true
    this.lifetime.abort()
    this.observer.disconnect()
    this.game.dispose()
    this.world?.dispose()
    setPlanetCharts(() => [])
    setNavigationPlaces(() => [])
    setNavigationRoads(() => [])
    this.sidearm?.dispose()
    this.clearPickups()
    this.casingMeshes?.dispose()
    this.magazineMeshes?.dispose()
    this.gallery.dispose()
    this.touchDriving?.dispose()
    this.fireModeBadge?.dispose()
    this.fireModeBadge = null
    this.touchFlight?.dispose()
    this.touchWalk?.dispose()
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
    this.hud?.dispose()
    this.wheelDebug.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    if (this.originalTabIndex === null) this.options.canvas.removeAttribute('tabindex')
    else this.options.canvas.setAttribute('tabindex', this.originalTabIndex)
  }

  private frame(time: number): void {
    const sim = this.session.simulation
    if (this.disposed || !sim || this.session.state !== 'playing') return
    if (!Number.isFinite(time)) throw new Error('Invalid frame time')
    const measuring = !!this.options.onDiagnostics
    const cpuStart = measuring ? performance.now() : 0
    const frameMs = this.lastTime === null ? 0 : Math.max(0, time - this.lastTime)
    if (measuring) this.renderer.info.reset()
    const dt =
      this.lastTime === null
        ? 0
        : Math.min(simulationDefaults.maxFrameSeconds, Math.max(0, (time - this.lastTime) / 1000))
    this.lastTime = time
    const playing = this.session.state === 'playing' && !document.hidden
    const controls = this.controlSurfaces(sim)
    const rigs = touchRigState(controls.touch, playing)
    this.touchDriving?.setActive(rigs.driving.active)
    if (this.touchDriving) this.touchDriving.root.hidden = rigs.driving.hidden
    this.touchFlight?.setActive(rigs.flight.active)
    // On-foot sticks: only while walking (no vehicle) and playing.
    this.touchWalk?.setActive(playing && !sim.player.vehicleId)
    if (document.hidden) return
    if (!this.hasInput()) this.releaseInput()
    this.keys.expire(performance.now())
    this.canvasDiagnostics(frameMs)
    this.observeResolution(frameMs, time)
    const pad = this.pollGamepad()
    const installStart = measuring ? performance.now() : 0
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
    const installMs = measuring ? performance.now() - installStart : 0
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
    if (this.startSequence && (input.forward || input.right || input.brake))
      this.applyStartCamera(this.startSequence.skip(), sim)
    const vehicleId = sim.player.vehicleId
    this.touchDriving?.setDriving(rigs.driving.seatedRoad)
    this.touchDriving?.setPilot(!!vehicleId && this.cameraState.mode === 'cockpit')
    this.touchDriving?.reflect(input)
    const water = worldWater(this.document.water, this.document.sky)
    this.environment.ocean.setLevel(water.level)
    const physicsStart = measuring ? performance.now() : 0
    const crossing = this.game.step(dt, input, water.level, time)
    const physicsMs = measuring ? performance.now() - physicsStart : 0
    if (crossing)
      this.options.onMessage?.(
        crossing.blocked ? this.text('Passage blocked') : this.text('Stargate crossed'),
      )
    if (this.world) this.game.streaming.update(this.world, sim, this.document, time)
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
    this.advanceStartCameras(sim, time)
    const { player, info } = this.game.updateCamera(this.view, this.camera, time, dt)
    const canvas = this.options.canvas
    canvas.dataset.vehicle = player.vehicleId ?? ''
    canvas.dataset.interior = player.interiorId ?? ''
    canvas.dataset.cameraMode = gameCameraView(this.cameraState, !!player.vehicleId)
    const eyes = isFirstPersonView(this.cameraState, !!player.vehicleId)
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
    this.view.sparks.update(time)
    if (this.sidearm) {
      this.sidearm.setTuning(this.weaponTuning)
      this.sidearm.setSmokeEnabled(this.smokeOn)
      this.sidearm.visible = this.weaponDrawn || this.sidearmAimPreview
      this.updateSidearm(sim, time, dt, eyes)
      if (this.sidearmAimPreview) this.sidearm.setAiming(true)
      let aim: THREE.Vector3 | undefined
      if (this.sidearm.visible && !eyes && !this.sidearmAimPreview) {
        const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
        const hit = sim.shoot(
          this.camera.position.toArray(),
          direction.toArray(),
          this.sidearm.range,
          0,
        )
        aim = hit
          ? new THREE.Vector3(...hit.point)
          : this.camera.position.clone().addScaledVector(direction, this.sidearm.range)
        aim.add(this.view.root.position)
      }
      this.sidearm.syncWorld(
        this.view.avatar,
        time,
        eyes || this.sidearmAimPreview,
        aim,
        this.camera.up,
      )
      if (!this.fireModeBadge && this.options.canvas.parentElement)
        this.fireModeBadge = new FireModeBadge(this.options.canvas.parentElement)
      this.fireModeBadge?.show(this.sidearm.visible ? fireModeLabel(this.sidearm.fireMode) : null)
      this.options.canvas.dataset.fireMode = this.sidearm.fireMode
      this.updateSidearmLaser(sim, time)
    } else {
      this.view.laser.enabled = false
    }
    this.fireRequested = false
    this.triggerReleased = false
    this.reloadRequested = false
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
      const city = nearestLocality(player.position).replace(/^Cerca de /, '')
      const street = nearestStreet(player.position) ?? ''
      this.touchDriving?.setPlace(city, street)
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
        ? 'E exit · C camera · H lights · G GPS · K high/low · Z/X indicators · F9 wheel diagnostics'
        : nearbyPickup
          ? this.text('E pick up {0}', nearbyPickup.name)
          : 'WASD move · Space jump · E enter · C camera',
      wheelDebug: this.wheelDebug.formatHud(),
    })
    this.effects.updateAudio(sim, this.document, eye)
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
      )
    } else {
      this.scene.background = new THREE.Color('#a6bbd5')
      this.scene.fog = new THREE.Fog('#a6bbd5', this.quality.fog * 0.75, this.quality.fog)
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
    this.fieldLighting?.update({
      origin: this.document.geography,
      eye,
      renderOrigin: this.origin,
      night: this.view.night,
      time,
      heightAt: (p) => this.world?.groundHeight(p),
      tiles: this.world?.activeTiles.map((tile) => tile.manifest.tile) ?? [],
      simulation: sim,
    })
    this.camera.position.sub(this.origin)
    for (const [id, hud] of this.view.shipHuds) {
      const inside =
        (player.interiorId === id && eyes) ||
        (player.vehicleId === id && this.cameraState.mode === 'cockpit')
      hud.update(this.camera, this.origin, time, inside ? sim.vehicleInfo(id) : null)
    }
    this.applyLightTuning()
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
        depthOfField: this.options.depthOfField ?? !!this.quality.dof,
        cull: (position) => this.cull(position),
      })
    } finally {
      this.camera.position.copy(eye)
    }
    this.options.canvas.dataset.portalViews = String(this.pipeline.renderedPortals)
    this.sidearm?.render(this.renderer, time, this.camera.aspect, eyes || this.sidearmAimPreview)
    if (this.options.onDiagnostics)
      this.options.onDiagnostics({
        frameMs,
        cpuMs: performance.now() - cpuStart,
        physicsMs,
        installMs,
        calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        width: this.renderer.domElement.width,
        height: this.renderer.domElement.height,
        droppedSeconds: sim.stats.droppedSeconds,
      })
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
  private warmFrame(sim: Simulation, state: GameCameraState, time: number): void {
    this.view.flushMapInstall(
      streamingDefaults.mapInstallBudgetMs * 3,
      streamingDefaults.mapInstallCount * 4,
      this.camera.position,
    )
    this.world?.renderUpdate(this.origin, !!this.quality.buildings, sim)
    this.view.sync(
      sim,
      0,
      isFirstPersonView(state, !!sim.player.vehicleId),
      state.headYaw,
      state.headPitch,
    )
    const { player } = updateGameCamera(sim, this.view, this.camera, state, time, 0)
    const eye = this.camera.position.clone()
    this.origin.set(0, 0, 0)
    if (new THREE.Vector3(...player.position).length() > streamingDefaults.floatingOriginDistance)
      this.origin.fromArray(player.position)
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
      )
      this.camera.updateProjectionMatrix()
    }
    this.view.night = this.sky.enabled && this.sky.atmosphere.day < lightingDefaults.nightThreshold
    this.view.daylight = this.sky.enabled ? this.sky.atmosphere.day : 1
    this.view.root.position.copy(this.origin).negate()
    this.world?.renderUpdate(this.origin, !!this.quality.buildings, sim)
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
      tiles: this.world?.activeTiles.map((tile) => tile.manifest.tile) ?? [],
      simulation: sim,
    })
    this.camera.position.sub(this.origin)
    const scissor = this.renderer.getScissor(new THREE.Vector4()),
      scissorTest = this.renderer.getScissorTest()
    this.applyLightTuning()
    try {
      this.renderer.setScissor(0, 0, 1, 1)
      this.renderer.setScissorTest(true)
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
        depthOfField: this.options.depthOfField ?? !!this.quality.dof,
        cull: (position) => this.cull(position),
      })
    } finally {
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
    if (!sim || !sim.player.vehicleId) return
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
    const views: { mode: GameCameraView; height?: number }[] = []
    if (first?.view === 'map' && first.fromHeight !== undefined)
      for (const height of descentWarmHeights(first.fromHeight, settings.mapHeight))
        views.push({ mode: 'map', height })
    views.push({ mode: 'cockpit' }, { mode: 'chase' })
    // Light the views as the reveal will: a live clock starts at its authored time then (e.g.
    // 10:00), and day or night changes lights and therefore shader programs.
    const clock = this.document.sky
    if (clock?.mode === 'live' && clock.origin) this.setSkyClock({ ...clock, since: Date.now() })
    try {
      for (const view of views) {
        signal.throwIfAborted()
        setGameCameraView(state, view.mode, true)
        state.transition = null
        state.lastPose = null
        state.lastView = null
        if (view.height !== undefined) {
          state.mapHeight = view.height
          state.mapDescentDamping = START_DESCENT_DAMPING
        }
        this.warmFrame(sim, state, performance.now())
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    } catch {
      /* Warmup is optional; the first visible frames build what remains. */
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
    if (!sim || !this.world) throw new Error('A running game on loaded terrain is required')
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
    if (!sim || !this.world) throw new Error('A running game on loaded terrain is required')
    const [x, , z] = position
    // Parse, texture upload and shader compile happen before the vehicle exists, spread over
    // frames, so adding it below is a cheap clone instead of a frozen frame.
    // Behind an intro (`beforeReveal`) the host's cards cover loading; no badge over them.
    const hide =
      this.options.canvas.dataset.reveal === 'preparing'
        ? () => {}
        : showLoadingBadge(this.options.canvas.parentElement, this.text('Loading vehicle…'))
    let ground: number
    try {
      ;[ground] = await Promise.all([
        waitForGround(this.world, [x, 0, z], { timeoutMs: timeoutMs ?? 120_000 }),
        this.prewarmVehicle([vehicle, ...hostedTemplates]).catch(() => undefined),
      ])
    } finally {
      hide()
    }
    this.assertAlive()
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
    this.view.addVehicles(added)
    sim.addVehicles(added)
    this.game.addVehicles(added)
    // Ships with an interior (carrier) get their helm/telemetry/map/systems/portal monitor
    // panels from the document; a carrier placed after start needs them rebuilt or its screens
    // stay dark.
    if (entity.vehicle?.interior || hosted.some((e) => e.portal))
      this.monitors.rebuild(this.document)
    this.spawned.push(id)
    const group = this.view.objects.get(id)
    if (group)
      void this.renderer.compileAsync(group, this.camera, this.scene).catch(() => undefined)
    return id
  }
  /**
   * Prepare the mounted vehicle materials, instruments, textures, shaders and mirror views
   * without adding it to the simulation. `placeVehicle` and `spawnVehicle`
   * call this first; a host may call it early (for example when a vehicle is picked in a menu).
   */
  async prewarmVehicle(template: Entity | readonly Entity[]): Promise<void> {
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
            mirrorPolicy: mirrorPolicyForQuality(this.quality.preset),
            steeringWheelOffset: (model) =>
              initialSteeringWheelOffset(this.options.steeringWheel, model),
            mirrorAdjustment: (model) => initialMirrorAdjustment(this.options.mirrors, model),
            startLights: this.options.startLights,
          },
        )
        view.setVehicleShadowReceiving(!!this.quality.vehicleShadows)
        view.setupMaterials((material) => this.shadows.setupMaterial(material))
        return view
      },
    })
    await this.vehicleWarmup.warm(entities)
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
  /**
   * The mirrors of the vehicle the player is in, or null on foot and in vehicles without cockpit
   * mirrors. Every vehicle of the same mirror model shares one adjustment.
   */
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
    if (!sim) throw new Error('A running game on loaded terrain is required')
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
    if (!sim || !this.world) throw new Error('A running game on loaded terrain is required')
    if (!entities.length) throw new Error('Nothing to place')
    const world = this.world
    const [x, , z] = position
    const ground = await waitForGround(world, [x, 0, z], { timeoutMs: timeoutMs ?? 120_000 })
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
      const below = offset.lengthSq() < 0.01 ? ground : (groundAtSeam(world, at) ?? ground)
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
      if (!Number.isFinite(options.distance) || options.distance < 500 || options.distance > 20000)
        throw new Error('Load distance must be 500–20000 m')
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
    if (enabled) this.sidearm ??= new Sidearm(this.options.canvas.parentElement!)
    this.sidearmAimPreview = enabled
    if (!enabled) this.sidearm?.setAiming(false)
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
              for (let pass = 0; pass < 3; pass++) this.renderAttractFrame(time)
              // One-pixel readback waits for the queued GPU work: a CPU+GPU proxy, not a GPU timer.
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
  /** Start the background music now if the browser allows it; otherwise the next gesture does. */
  startMusic(): void {
    this.assertAlive()
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
  private async prepareReveal(signal: AbortSignal): Promise<void> {
    const within = <T>(promise: Promise<T>, ms: number) =>
      Promise.race([promise.catch(() => undefined), new Promise((r) => setTimeout(r, ms))])
    const canvas = this.options.canvas
    // Stages for hosts that pace an intro on loading (`data-reveal-stage`, `data-reveal-progress`).
    const stage = (name: string, done: number) => {
      canvas.dataset.revealStage = name
      canvas.dataset.revealProgress = (done / REVEAL_STAGES).toFixed(2)
    }
    canvas.dataset.reveal = 'preparing'
    // 1. Vehicle GLBs (the bike included) and 2. the sidearm models land in the asset cache.
    stage('vehicles', 0)
    await within(this.view.ready, 30_000)
    signal.throwIfAborted()
    stage('weapons', 1)
    const preset = weaponPresets()[0]
    const weaponUrls = [preset?.model, preset?.body, preset?.slide].filter(
      (url): url is string => typeof url === 'string',
    )
    await within(
      Promise.all(
        weaponUrls.map((url) => assets.instantiate(url).then((model) => disposeObject(model))),
      ),
      20_000,
    )
    signal.throwIfAborted()
    // The viewmodel itself (HK model, magazine, flash, laser): built and compiled now, so the
    // first draw shows the pistol instead of the placeholder block while it loads.
    this.sidearm ??= new Sidearm(this.options.canvas.parentElement!)
    await within(this.sidearm.warm(this.renderer), 20_000)
    signal.throwIfAborted()
    // Casing meshes join the scene before the shader stage, so the first shot compiles nothing.
    this.ensureCasingMeshes()
    // 3. Terrain, photos, buildings and map meshes around the start: everything the descent
    // from high above shows, at the LODs the stream plans there.
    stage('terrain', 2)
    for (const task of this.revealTasks.splice(0)) {
      signal.throwIfAborted()
      await task().catch((error) => console.warn('beforeReveal task failed', error))
    }
    signal.throwIfAborted()
    const sim = this.session.simulation
    if (this.world && sim) {
      const spawn = [...sim.player.position] as Vec3Tuple
      await waitForArea(this.world, spawn, {
        signal,
        pending: () => this.view.pendingMapInstalls,
        flush: () =>
          this.view.flushMapInstall(
            streamingDefaults.mapInstallBudgetMs * 3,
            streamingDefaults.mapInstallCount * 4,
          ),
      })
      this.world.renderUpdate(this.origin, !!this.quality.buildings, sim)
    }
    signal.throwIfAborted()
    // 4. Shader programs (chase, cockpit, mirrors, the new tiles) and texture uploads, on a copy
    if (sim) await this.placeInitialWeaponPickup(sim)
    signal.throwIfAborted()
    // of the camera so the attract frames keep their own projection.
    stage('shaders', 3)
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
      await within(
        warmGamePresentation({
          renderer: this.renderer,
          scene: this.scene,
          camera,
          view: this.view,
          settings: this.cameraState.settings,
          signal,
        }),
        20_000,
      )
      await within(uploadSceneTextures(this.renderer, this.scene, signal), 20_000)
      signal.throwIfAborted()
      // Then the start views themselves, as the first gameplay frames will draw them. Awaited
      // in full (a handful of frames): a timed-out warmup must not keep moving the camera.
      await this.warmStartViews(signal)
      stage('preload', 4)
      for (const templates of this.options.preloadVehicles ?? []) {
        signal.throwIfAborted()
        await this.prewarmVehicle(templates)
      }
    } finally {
      this.view.setPlaying(false)
    }
    signal.throwIfAborted()
    stage('ready', REVEAL_STAGES)
    canvas.dataset.reveal = 'holding'
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
        this.renderAttractFrame(time)
        this.observeResolution(frameMs, time)
      } catch (error) {
        this.stopAttract()
        this.options.onError?.(error)
      }
    })
    loop.setMaxFps(this.display.maxFps)
    this.attract = { loop, started: performance.now(), last: null, options: resolved }
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
  private renderAttractFrame(time: number): void {
    if (!this.document.geography) return
    const options = this.attract?.options ?? { altitude: 18_000_000, orbitSeconds: 120, tilt: 0.45 }
    const started = this.attract?.started ?? 0
    const centre = new THREE.Vector3(0, -(EARTH_RADIUS + this.document.geography.altitude), 0)
    const angle = options.orbitSeconds
      ? (((time - started) / 1000) * Math.PI * 2) / options.orbitSeconds
      : 0
    const distance = EARTH_RADIUS + options.altitude
    const eye = new THREE.Vector3(
      Math.sin(options.tilt) * Math.cos(angle),
      Math.cos(options.tilt),
      Math.sin(options.tilt) * Math.sin(angle),
    )
      .multiplyScalar(distance)
      .add(centre)
    this.camera.up.set(0, 1, 0)
    this.camera.position.copy(eye)
    this.camera.lookAt(centre)
    this.camera.updateMatrixWorld()
    this.environment.updateSky(
      this.sky,
      eye,
      this.origin,
      this.attract?.options.clock ?? { mode: 'live' },
      this.quality.fog,
    )
    this.sky.setViewAspect(this.camera.aspect)
    const autoClear = this.renderer.autoClear
    this.renderer.autoClear = true
    try {
      this.sky.render(this.renderer, this.camera, eye)
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
    data.heldKeys = [...this.keys.values].join(' ')
    data.keyExpirations = String(this.keys.expirations)
    if (frameMs > 100) data.longFrames = String(Number(data.longFrames ?? 0) + 1)
    data.lastFrameMs = frameMs.toFixed(1)
  }
  /** Release held controls when host UI takes focus, without stopping simulation. */
  releaseInput(): void {
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
  private updateSidearm(sim: Simulation, time: number, dt: number, eyes: boolean): void {
    const sidearm = this.sidearm!
    const weaponPosition = (
      eyes
        ? this.camera.position
            .clone()
            .add(sidearm.muzzleViewOffset(time).applyQuaternion(this.camera.quaternion))
        : (sidearm.worldMuzzle()?.sub(this.view.root.position) ??
          new THREE.Vector3(...sim.renderPlayerPosition))
    ).toArray()
    const canvas = this.options.canvas
    const events: FirearmEvent[] = [sidearm.update(time)]
    if (this.reloadRequested && sidearm.visible) {
      const reload = sidearm.reload(time)
      events.push(reload)
      if (reload.reloadStarted) this.options.onMessage?.(this.text('Reloading'))
    }
    if (this.triggerReleased) sidearm.release()
    const rise = sidearm.aimRise(time)
    if (rise) {
      const pitchKey = sim.player.vehicleId ? 'headPitch' : 'pitch'
      this.cameraState[pitchKey] = THREE.MathUtils.clamp(
        this.cameraState[pitchKey] - rise,
        -controlDefaults.pitchLimit,
        controlDefaults.pitchLimit,
      )
    }
    const automatic = sidearm.fireMode === 'burst30'
    const yaw = sidearm.recoilYaw.step(dt, automatic && this.triggerDown)
    if (yaw) {
      if (sim.player.vehicleId) this.cameraState.headYaw += yaw
      else this.cameraState.yaw += yaw
    }
    if (
      this.weaponOwned &&
      (this.fireRequested || (automatic && this.triggerDown)) &&
      this.hasInput()
    ) {
      const shot = fireSidearm(sidearm, this.gallery, sim, this.view, this.camera, time, eyes)
      if (shot) events.push(shot)
      if (shot?.fired) {
        this.effects.audio.gunshot(weaponPosition)
        canvas.dataset.gunshots = String(this.effects.audio.gunshotCount)
        if (shot.impactJoules !== undefined)
          canvas.dataset.lastImpactJoules = shot.impactJoules.toFixed(0)
        this.ejectCasing(sim, eyes)
      }
      canvas.dataset.impacts = String(this.view.impacts.count)
    }
    for (const event of events) {
      if (event.dry) this.effects.audio.gearClick({ volume: 0.6 }, weaponPosition)
      if (event.magazineDropped) {
        this.effects.audio.gearClick(magazineReleaseClick, weaponPosition)
        this.dropMagazine(sim, eyes)
      }
      if (event.magazineSeated) this.effects.audio.gearClick(magazineInsertClick, weaponPosition)
      if (event.slideReleased) this.effects.audio.gearClick({ volume: 1.6 }, weaponPosition)
      if (event.locked) this.options.onMessage?.(this.text('Slide locked back · R reload'))
    }
    if (this.casingMotion && this.casingMeshes) {
      this.casingMotion.update(dt, (from, direction, length) =>
        sim.shoot(from, direction, length, 0),
      )
      for (const impact of this.casingMotion.impacts.slice(0, 3))
        this.effects.audio.casing(impact.speed, impact.position)
      this.casingMeshes.sync(this.casingMotion.poses())
      canvas.dataset.casings = String(this.casingMotion.count)
    }
    if (this.magazineMotion && this.magazineMeshes) {
      this.magazineMotion.update(dt, (from, direction, length) =>
        sim.shoot(from, direction, length, 0),
      )
      this.magazineMeshes.sync(this.magazineMotion.poses())
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
  private ejectCasing(sim: Simulation, eyes: boolean): void {
    const casing = this.sidearm?.preset?.casing
    if (!casing) return
    if (!this.casingMotion) this.casingMotion = new CasingMotion(casing)
    this.ensureCasingMeshes()
    const q = this.camera.quaternion
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
    const port = eyes
      ? this.camera.position.clone().add(this.sidearm!.ejectionViewOffset().applyQuaternion(q))
      : new THREE.Vector3(...sim.renderPlayerPosition)
          .addScaledVector(right, 0.2)
          .addScaledVector(up, 0.3)
    this.casingMotion.eject(
      port.toArray() as Vec3Tuple,
      right.toArray() as Vec3Tuple,
      up.toArray() as Vec3Tuple,
    )
  }

  /**
   * Spent magazine out of the grip. Same bounce, rest and lifetime as a casing, with a small
   * pool of its own. The mesh is the pistol's `Magazine` node.
   */
  private dropMagazine(_sim: Simulation, eyes: boolean): void {
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
    this.magazineMotion.release(
      origin.toArray() as Vec3Tuple,
      velocity.toArray() as Vec3Tuple,
      [0.3, 0.5, 0.2],
      [orientation.x, orientation.y, orientation.z, orientation.w],
    )
  }

  /** World laser beam from the sidearm muzzle along the look ray (when H-toggled on). */
  private updateSidearmLaser(sim: Simulation, time: number): void {
    if (!this.sidearm?.laserEnabled || !this.weaponDrawn) {
      this.view.laser.enabled = false
      return
    }
    this.view.laser.enabled = true
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
    const origin = this.camera.position.clone()
    if (isFirstPersonView(this.cameraState, !!sim.player.vehicleId)) {
      origin.add(this.sidearm.muzzleViewOffset(time).applyQuaternion(this.camera.quaternion))
    } else {
      const muzzle = this.sidearm.worldMuzzle()
      if (muzzle) origin.copy(muzzle).add(this.origin)
      else origin.fromArray(sim.renderPlayerPosition)
    }
    const aimed = sim.shoot(
      origin.toArray() as Vec3Tuple,
      direction.toArray() as Vec3Tuple,
      this.sidearm.range,
      0,
    )
    const end = (
      aimed ? aimed.point : origin.clone().addScaledVector(direction, this.sidearm.range).toArray()
    ) as Vec3Tuple
    this.view.laser.set(origin.toArray() as Vec3Tuple, end, !!aimed)
  }

  /** Fire or aim from one mouse button edge. Safe to call from both pointer and mouse events. */
  private applySidearmButton(button: number, down: boolean): void {
    if (this.session.state !== 'playing') return
    if (down && !this.pointerLocked() && !this.pointerLockUnsupported()) return
    if (!this.weaponDrawn) return
    const action = sidearmButtonAction(button, down)
    if (action === 'fire') {
      this.fireRequested = true
      this.triggerDown = true
    }
    if (action === 'release') {
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
      if (action.view !== gameCameraView(this.cameraState, true)) {
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
    // C during the start sequence hands the camera to the player (a held engine starts).
    const sim = this.session.simulation
    if (this.startSequence && sim) this.applyStartCamera(this.startSequence.skip(false), sim)
    const message = this.game.action('KeyC')
    if (message) this.options.onMessage?.(message)
  }
  private pollGamepad(): Gamepad | null {
    if (!this.hasInput()) {
      this.previousButtons = []
      return null
    }
    const pad = availableGamepads().find((p) => p?.connected && p.mapping === 'standard') ?? null
    if (pad?.index !== this.previousPad) this.previousButtons = []
    this.previousPad = pad?.index ?? null
    if (!pad) return null
    const pressed = (index: number) => !!pad.buttons[index]?.pressed && !this.previousButtons[index]
    if (pressed(0)) this.action('KeyE')
    if (pressed(1)) this.cycleCamera()
    if (pressed(2)) this.action('KeyF')
    if (pressed(3)) this.action('KeyV')
    if (pressed(4)) this.action('KeyT')
    this.previousButtons = pad.buttons.map((button) => button.pressed)
    return pad
  }
  private action(code: string): void {
    const sim = this.session.simulation
    if (!sim) return
    if (code === 'KeyE') {
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
          this.sidearm = new Sidearm(
            this.options.canvas.parentElement!,
            weaponPresets().find((preset) => preset.id === item.itemId),
          )
        }
        this.weaponDrawn = true
        this.sidearm.visible = true
        this.options.onMessage?.(this.text('Picked up {0} · Tab holster', item.name))
        return
      }
    }
    if (code === 'F9') {
      this.wheelDebug.toggle()
      return
    }
    if (code === 'Tab') {
      if (!this.weaponOwned) {
        this.options.onMessage?.(this.text('Find and pick up a pistol first'))
        return
      }
      this.weaponDrawn = !this.weaponDrawn
      this.fireRequested = false
      this.triggerDown = false
      if (this.weaponDrawn && !this.sidearm)
        this.sidearm = new Sidearm(this.options.canvas.parentElement!)
      this.sidearm?.setAiming(false)
      this.view.laser.enabled = this.weaponDrawn && !!this.sidearm?.laserEnabled
      this.options.onMessage?.(
        this.weaponDrawn ? this.text('Weapon drawn') : this.text('Weapon holstered'),
      )
      return
    }
    if (code === 'KeyR' && this.weaponDrawn) {
      this.reloadRequested = true
      return
    }
    // Experimental full-auto: M on foot with the pistol drawn. At a ship helm (or on foot without
    // the pistol) M keeps its game meaning (helm mode / its notice).
    if (code === 'KeyM' && this.weaponDrawn && !sim.player.vehicleId && this.sidearm) {
      const mode = nextFireMode(this.sidearm.fireMode)
      this.sidearm.setFireMode(mode)
      this.triggerDown = false
      this.options.onMessage?.(fireModeLabel(mode))
      return
    }
    if (code === 'KeyN') this.gallery.reset()
    let message = this.game.action(code)
    if ((code === 'KeyZ' || code === 'KeyX') && sim.player.vehicleId) {
      this.view.signal(sim.player.vehicleId, code === 'KeyZ' ? -1 : 1)
      message = this.text('Indicators: Z left · X right · press again to cancel')
    }
    if (code === 'KeyH') {
      if (sim.player.vehicleId) {
        const mode = this.view.cycleVehicleLights(sim.player.vehicleId)
        if (mode !== null) message = this.text(lightModeNotice[mode])
      } else if (this.weaponDrawn) {
        if (!this.sidearm) this.sidearm = new Sidearm(this.options.canvas.parentElement!)
        const on = this.sidearm.toggleLaser()
        this.view.laser.enabled = on
        message = on ? this.text('Laser on') : this.text('Laser off')
      }
    }
    if (code === 'KeyG' && sim.player.vehicleId) {
      const open = this.view.toggleVehicleGps(sim.player.vehicleId)
      if (open !== null) message = open ? this.text('GPS on') : this.text('GPS off')
    }
    if (code === 'KeyK' && sim.player.vehicleId) {
      const high = this.view.toggleVehicleHighBeam(sim.player.vehicleId)
      if (high !== null)
        message = high ? this.text('High beams selected') : this.text('Low beams selected')
    }
    if (message) this.options.onMessage?.(message)
  }
  private bindInput(): void {
    const options = { signal: this.lifetime.signal }
    const canvas = this.options.canvas
    canvas.addEventListener(
      'wheel',
      (event) => {
        // Wheel zoom for the detached views, seated or on foot: overhead height and
        // cinematic orbit distance. Other views leave the wheel to the page.
        const state = this.cameraState
        if (!this.hasInput() || !this.session.simulation) return
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
        } else if (state.mode === 'chase' && !state.firstPerson) {
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
        // Escape while unlocked asks for the free mouse; any other key while the game should
        // own the pointer (first keypress after loading, or a refused lock) captures it.
        if (event.code === 'Escape') this.pointerFree = true
        else if (!this.pointerFree && !event.repeat) this.capturePointer()
        if (
          ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)
        )
          event.preventDefault()
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
              'Este vehículo tiene un solo modo de motor',
            (step) => {
              this.applyCameraFov(nextCameraFovOffset(this.fovOffset, step))
              writeCameraFovOffset(browserStorage(), this.fovOffset)
              const { firstPersonFov, chaseFov } = this.cameraState.settings
              return this.text('FOV cockpit {0}° · driving {1}°', firstPersonFov, chaseFov)
            },
            (action) => {
              const track = this.effects.audio.musicTrack
              if (!track) return 'Sin música'
              if (action === 'stop') {
                this.effects.audio.fadeOutMusic(0.8)
                return 'Música parada'
              }
              return this.effects.audio.playMusic()
                ? 'Música: ' + (track.title ?? 'pista')
                : 'Música silenciada en Ajustes → Audio'
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
          this.action(event.code)
        }
      },
      options,
    )
    window.addEventListener('keyup', (event) => this.keys.release(event.code), {
      ...options,
      capture: true,
    })
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
          state.yaw -= event.movementX * controlDefaults.mouseSensitivity
          state.pitch = THREE.MathUtils.clamp(
            state.pitch + event.movementY * controlDefaults.mouseSensitivity,
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
