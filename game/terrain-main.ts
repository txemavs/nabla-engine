import { mountVREntry, pcVRRequested } from './vr-entry.js'
import { readFsrSettings } from './fsr-settings.js'
import { restoreStartupLightSettings } from './startup-light-settings.js'
import { bindVR, preloadVR } from './vr-ui.js'
import { GameRuntime } from '@nabla/engine/runtime/browser'
import { createRenderBackend, parseRendererPreference } from '@nabla/engine/render'
import {
  projectGroundPhoto,
  setHiddenTileLayers,
  setTileClusterCulling,
  parseClusterCulling,
} from '@nabla/engine/render'
import { createTerrainDriveScene } from '@nabla/engine/examples/terrain-drive'
import { assignVehicleColor, sceneHasPresetModel } from './vehicle-colors.js'
import { hasVehiclePreset, presetEntities } from '@nabla/engine/vehicles'
import { mapTileId } from '@nabla/engine/scene'
import { MissingTiles } from '@nabla/engine/planet/missing-tiles'
import { browserStorage } from './entry.js'
import { readQualityPreset } from '@nabla/engine/runtime/quality-preset'
import { LoadingScreen, showError } from './loading.js'
import { startError } from './start-error.js'
import { bindPosition, showLocation } from './position.js'
import { showTelemetry } from './telemetry.js'
import { bindSceneControls, menuPreloadVehicles } from './scene-controls.js'
import { skyClockAtMinutes, skyClockAtRate } from '@nabla/engine/planet/sky'
import { bindTerrainSelector } from './terrain-selector.js'
import { bindTerrainCache } from './terrain-cache.js'
import { bindLayerSelector, initialHiddenLayers } from './layers-ui.js'
import { readDisplaySettings, bindDisplaySettings } from './display-settings.js'
import { bootHiddenLayers, readBootConfig, runBootPhase } from './boot.js'
import { mountSettingsHud } from './settings-hud.js'
import { bindSoundControls } from './sound-ui.js'
import { bindLightControls } from './light-ui.js'
import { bindExhaustControls } from './exhaust-ui.js'
import { bindFlipCinematicToggle, resolveFlipCinematicEnabled } from './flip-cinematic-ui.js'
import { bindRecoverToRoadToggle, resolveRecoverToRoadEnabled } from './recover-road-ui.js'
import { bindGravityScaleSlider, resolveGravityScale } from './gravity-ui.js'
import {
  hostSteeringWheelsFromSearch,
  steeringWheelStorage,
  viteHostSteeringWheels,
} from './host-steering-wheel.js'
import { bindShadowBiasControl, resolveShadowBias } from './shadow-bias-ui.js'
import { hostMirrorsFromSearch, mirrorStorage, viteHostMirrors } from './host-mirrors.js'
import { bindAsphaltContrastSlider, resolveAsphaltContrast } from './asphalt-contrast-ui.js'
import { bindAnisotropySelect, bindGroundDetailSelect } from './anisotropy-ui.js'
import { bindDistances } from './distances-ui.js'
import { formatCells, parseTerrainConfig, startFromIndex } from './terrain.js'
import { installHostVehicles } from './host-vehicles.js'
import { installHostPortals } from './host-portals.js'
import { describeLoading } from './loading-text.js'
import { fpsReadout } from './fps-readout.js'

// Bound first, so a terrain that fails to load can still be swapped from the menu.
const bootMark = performance.now()
const bootLog = (label: string) =>
  console.info(`[nabla-boot] ${label} +${(performance.now() - bootMark).toFixed(0)}ms`)
bindTerrainSelector()
bindPosition()
const attachSceneControls = bindSceneControls()
let runtime: GameRuntime | undefined
let cellsLabel = ''
/** The tile host of this page, known even when the configuration fails to load. */
let startBase = (new URLSearchParams(location.search).get('terrain') ?? '').replace(/\/+$/, '')
/** HUD line with the cells loaded and the ones the host lacks, e.g. "Celdas: 12 cargadas · 5 faltan". */
function showCells(): void {
  const stats = runtime?.cellStats
  if (!stats) return
  const text = formatCells(stats)
  if (text === cellsLabel) return
  cellsLabel = text
  let el = document.getElementById('cells-display')
  if (!el) {
    el = document.createElement('div')
    el.id = 'cells-display'
    document.getElementById('location-display')!.after(el)
  }
  el.textContent = text
  el.title =
    'Celdas cargadas y celdas que el servidor no tiene (huecos en el mapa). Lista: nablaRuntime.missingTiles con ?diagnostics=1'
}
try {
  const params = new URLSearchParams(location.search)
  const solo = params.get('solo') === '1'
  const config = await startFromIndex(parseTerrainConfig())
  bootLog(`config ready (${config.vehicles.length} host vehicles)`)
  startBase = config.base
  const vehicle = config.scene.vehicle ?? 'car'
  if (!hasVehiclePreset(vehicle)) throw new Error(`Vehículo desconocido: ${vehicle}`)
  const scene = createTerrainDriveScene({
    ...config.scene,
    latitude: config.start!.latitude,
    longitude: config.start!.longitude,
    includeDemoFleet: !solo && config.vehicles.length === 0,
  })
  if (!solo && config.vehicles.length === 0 && !sceneHasPresetModel(scene.entities, 'vfr800')) {
    const motorcycle = presetEntities('vfr800', 'demo-vfr800', [4, 0, 0])
    motorcycle[0].transform.rotation = [
      ...scene.entities.find((entity) => entity.id === 'player-vehicle')!.transform.rotation,
    ]
    scene.entities.push(...motorcycle)
  }
  if (solo)
    scene.entities = scene.entities.filter((entity) => entity.id !== 'player-vehicle-trailer')
  for (const entity of scene.entities)
    if (entity.id !== 'player-vehicle' || !(config.scene as { color?: string }).color)
      assignVehicleColor(entity)
  // &time=, &timeSpeed= and &sea= start the scene at that hour / rate / sea level; the menu changes them live.
  if (config.timeOfDay !== undefined)
    scene.sky =
      config.timeOfDay === 'live'
        ? { mode: 'live' }
        : skyClockAtMinutes(scene.sky, config.timeOfDay)
  if (config.timeSpeed !== undefined && config.timeSpeed !== 1)
    scene.sky = skyClockAtRate(scene.sky, config.timeSpeed)
  if (config.seaLevel !== undefined)
    scene.water = { mode: 'manual', level: config.seaLevel, amplitude: 0 }
  const boot = readBootConfig()
  const loading = new LoadingScreen(boot.splash)
  loading.setTiles(config.tile ? [config.tile] : [])
  if (config.atlas.photo !== 'none') projectGroundPhoto()
  const layerDefaults = bootHiddenLayers(boot)
  setHiddenTileLayers(initialHiddenLayers(location.search, undefined, layerDefaults))
  // `?clusterCulling=1`: opt-in 8×8 sub-tile culling of planet tile meshes.
  setTileClusterCulling(parseClusterCulling(location.search))
  bootLog('GameRuntime construct start')
  // `?renderer=webgpu|auto` opts into WebGPU (WebGL fallback); no parameter keeps the WebGL default.
  const rendererPreference = parseRendererPreference(location.search)
  const backend =
    rendererPreference === 'webgl'
      ? undefined
      : await createRenderBackend(rendererPreference, {
          canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
          antialias: true,
          alpha: true,
          logarithmicDepthBuffer: true,
        })
  runtime = new GameRuntime({
    backend,
    fsr: readFsrSettings(),
    performanceLog: new URLSearchParams(location.search).get('perfLog') === '1',
    locale: 'es',
    // Until the game is shown only the spawn cell and its three neighbours stream; reveal then lifts
    // the startup restriction and the full streaming radius follows (one ~40 MB cell at a time
    // instead of the whole area at once).
    startupTerrain: 'nearby',
    fieldLights: {},
    flipCinematic: resolveFlipCinematicEnabled(boot.flipCinematic),
    recoverToRoad: resolveRecoverToRoadEnabled(boot.recoverToRoad),
    gravityScale: resolveGravityScale(),
    // «Volante»: host defaults from &wheel= / VITE_NABLA_STEERING_WHEEL; the player's choice is saved.
    steeringWheel: {
      defaults: hostSteeringWheelsFromSearch(location.search, viteHostSteeringWheels()),
      storage: steeringWheelStorage(),
    },
    shadowBias: resolveShadowBias(boot.shadowBias),
    // «Espejos»: host defaults from &mirrors= / VITE_NABLA_MIRRORS; the player's choice is saved.
    mirrors: {
      defaults: hostMirrorsFromSearch(location.search, viteHostMirrors()),
      storage: mirrorStorage(),
    },
    asphaltContrast: resolveAsphaltContrast(boot.asphaltContrast),
    startCameras: boot.startCameras,
    music: boot.music,
    hud: true,
    touchControls:
      new URLSearchParams(location.search).has('xr') || location.pathname === '/xr.html'
        ? false
        : 'always',
    display: readDisplaySettings(),
    onResolutionScale: (state) =>
      document
        .getElementById('game-canvas')!
        .dispatchEvent(new CustomEvent('nabla:resolution-scale', { detail: state })),
    canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
    weaponPickupLocation: { longitude: -1.76129, latitude: 43.34336, altitude: 41 },
    scene,
    // VR modes: boarding must never load on demand in the headset, so the bike and car join.
    preloadVehicles: solo
      ? []
      : menuPreloadVehicles([
          ...(boot.preloadVehicles ?? []),
          ...(pcVRRequested() ? ['vfr800', 'car'] : []),
        ]),
    accidentReplacementVehicles: solo ? [] : menuPreloadVehicles(['vfr800', 'car', 'white-truck']),
    sea: true,
    restParkedOnGround: true,
    // Same streaming as Studio's ground mode: the cells around the player first, the rest by distance.
    performance: {
      preset: readQualityPreset(),
      ...(params.has('xr') ? { buildings: 1 } : {}),
    },
    tiles: {
      baseUrl: config.base,
      mode: 'static',
      meshMaxZoom: params.get('meshMaxZoom') === '16' ? 16 : 15,
      developmentRefresh: params.get('tileRefresh') === '1',
      horizon: false,
      meshMinZoom:
        params.get('meshMinZoom') === '12'
          ? 12
          : params.get('meshMinZoom') === '13'
            ? 13
            : params.get('meshMinZoom') === '14'
              ? 14
              : 15,
      // No index file: the engine asks for the tiles it needs; a tile the host lacks is a hole, recorded here.
      missing: new MissingTiles({
        key: `nabla.terrain.missing:${config.base}`,
        storage: browserStorage(),
      }),
      atlas: config.atlas,
      imagery: config.atlas.photo === 'none' ? 'none' : 'package',
      inspectRoadCollision: config.inspectRoadCollision,
      // OSM road asphalt: hidden + non-colliding unless &osmRoads=1 (bridges always drawn).
      osmRoads: config.osmRoads,
    },
    // The bottom line shows renderer, fps and frame times; `?diagnostics` also forwards each sample.
    onDiagnostics: fpsReadout(
      () => document.getElementById('controls-hint'),
      params.has('diagnostics')
        ? (sample) =>
            document
              .getElementById('game-canvas')!
              .dispatchEvent(new CustomEvent('nabla:frame', { detail: sample }))
        : undefined,
    ),
    onProgress(_status, tiles) {
      // Always a Spanish loading state with what is in flight and the last error, never silent.
      const text = describeLoading(runtime?.cellStats ?? null, runtime?.loadDiagnostics ?? null)
      loading.setStatus(text.status)
      loading.setDetail(text.detail)
      for (const tile of tiles ?? []) loading.markTileLoaded(tile)
    },
    onFrame(frame) {
      showTelemetry(frame)
      showCells()
      showLocation(frame.location)
    },
    onError(error) {
      showError(error instanceof Error ? error.message : String(error))
    },
    onMessage(message) {
      document.getElementById('game-message')!.textContent = message
    },
  })
  bootLog('GameRuntime construct done')
  bindTerrainCache(runtime)
  // Headless checks read where vehicles and the player sit against the ground.
  if (params.has('diagnostics'))
    Object.assign(window, { nablaGroundAudit: () => runtime?.groundAudit(), nablaRuntime: runtime })
  mountVREntry(runtime)
  window.addEventListener('pagehide', () => runtime?.dispose(), { once: true })
  preloadVR(runtime)
  loading.setStatus(
    config.tile ? `Cargando el terreno ${mapTileId(config.tile)}…` : 'Cargando el terreno…',
  )
  void runBootPhase(runtime, loading, boot)
  // Host vehicles are placed inside play(), before the reveal: their models, lights and
  // programs load behind the intro instead of during the start descent.
  const geography = scene.geography
  if (!solo && geography && config.vehicles.length)
    runtime.beforeReveal(async () => {
      bootLog(`installHostVehicles start (${config.vehicles.length})`)
      await installHostVehicles(runtime!, geography, config.vehicles)
      bootLog('installHostVehicles done')
    })
  bootLog('play() start')
  restoreStartupLightSettings(runtime)
  await runtime.play({ vehicleId: 'player-vehicle', playerMode: config.playerMode })
  if (params.has('xr')) runtime.equipTestSidearm()
  bindVR(runtime)
  bootLog('play() done (ground + physics)')
  if (scene.geography && config.portals?.length) {
    bootLog(`installHostPortals start (${config.portals?.length})`)
    await installHostPortals(runtime, scene.geography, config.portals)
    bootLog('installHostPortals done')
  }
  bootLog('loading screen hide')
  loading.hide()
  attachSceneControls(runtime)
  bindDisplaySettings(runtime)
  bindFlipCinematicToggle(runtime)
  bindRecoverToRoadToggle(runtime)
  bindGravityScaleSlider(runtime)
  bindShadowBiasControl(runtime, boot.shadowBias)
  const roadStyle = bindAsphaltContrastSlider(runtime, boot.asphaltContrast)
  bindAnisotropySelect(runtime, roadStyle)
  bindGroundDetailSelect(runtime, roadStyle)
  bindDistances(runtime)
  bindSoundControls(runtime)
  bindLightControls(runtime)
  bindExhaustControls(runtime)
  mountSettingsHud(runtime)
  bindLayerSelector(runtime, undefined, layerDefaults)
  document.getElementById('game-hud')!.classList.remove('hidden')
  document.getElementById('game-canvas')!.focus()
} catch (error) {
  runtime?.dispose()
  // A start over a hole offers the nearest available cell. Nothing is remembered: the position is the URL's.
  const failure = await startError(error, startBase)
  showError(
    failure.message,
    failure.actions.map((action) => ({
      label: action.label,
      onClick: () => location.assign(location.pathname + action.search),
    })),
  )
}
