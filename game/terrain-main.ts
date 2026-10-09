import { GameRuntime } from '@nabla/engine/runtime/browser'
import { projectGroundPhoto, setHiddenTileLayers } from '@nabla/engine/render'
import { createTerrainDriveScene } from '@nabla/engine/examples/terrain-drive'
import { assignVehicleColor } from './vehicle-colors.js'
import { hasVehiclePreset } from '@nabla/engine/vehicles'
import { mapTileId } from '@nabla/engine/scene'
import { MissingTiles } from '@nabla/engine/planet/missing-tiles'
import { browserStorage } from './entry.js'
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
import { bindFlipCinematicToggle, resolveFlipCinematicEnabled } from './flip-cinematic-ui.js'
import { bindRecoverToRoadToggle, resolveRecoverToRoadEnabled } from './recover-road-ui.js'
import {
  hostSteeringWheelsFromSearch,
  steeringWheelStorage,
  viteHostSteeringWheels,
} from './host-steering-wheel.js'
import { bindShadowBiasControl, resolveShadowBias } from './shadow-bias-ui.js'
import { hostMirrorsFromSearch, mirrorStorage, viteHostMirrors } from './host-mirrors.js'
import { bindAsphaltContrastSlider, resolveAsphaltContrast } from './asphalt-contrast-ui.js'
import { bindAnisotropySelect, bindGroundDetailSelect } from './anisotropy-ui.js'
import { formatCells, parseTerrainConfig, startFromIndex } from './terrain.js'
import { installHostVehicles } from './host-vehicles.js'
import { installHostPortals } from './host-portals.js'
import { describeLoading } from './loading-text.js'

/** Spanish controls for the terrain example (the original hint is shared with the flat demo). */
const CONTROLS =
  '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Conducir · <kbd>Espacio</kbd> Freno · ' +
  '<kbd>C</kbd> Cámara · <kbd>J</kbd> Menú · <kbd>H</kbd> Luces · <kbd>G</kbd> GPS · <kbd>E</kbd> Entrar/salir · ' +
  '<kbd>V</kbd> Vuelo · <kbd>F</kbd> Acoplar · <kbd>T</kbd> Transferir · <kbd>R</kbd> Recuperar · ' +
  '<kbd>Tab</kbd> Arma · <kbd>U</kbd><kbd>O</kbd><kbd>I</kbd><kbd>L</kbd> Peso del piloto (moto)'

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
  const config = await startFromIndex(parseTerrainConfig())
  bootLog(`config ready (${config.vehicles.length} host vehicles)`)
  startBase = config.base
  const vehicle = config.scene.vehicle ?? 'car'
  if (!hasVehiclePreset(vehicle)) throw new Error(`Vehículo desconocido: ${vehicle}`)
  const scene = createTerrainDriveScene({
    ...config.scene,
    latitude: config.start!.latitude,
    longitude: config.start!.longitude,
    includeDemoFleet: config.vehicles.length === 0,
  })
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
  document.getElementById('controls-hint')!.innerHTML = CONTROLS
  if (config.atlas.photo !== 'none') projectGroundPhoto()
  const layerDefaults = bootHiddenLayers(boot)
  setHiddenTileLayers(initialHiddenLayers(location.search, undefined, layerDefaults))
  bootLog('GameRuntime construct start')
  runtime = new GameRuntime({
    locale: 'es',
    flipCinematic: resolveFlipCinematicEnabled(boot.flipCinematic),
    recoverToRoad: resolveRecoverToRoadEnabled(boot.recoverToRoad),
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
    touchControls: 'always',
    display: readDisplaySettings(),
    onResolutionScale: (state) =>
      document
        .getElementById('game-canvas')!
        .dispatchEvent(new CustomEvent('nabla:resolution-scale', { detail: state })),
    canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
    scene,
    preloadVehicles: menuPreloadVehicles(boot.preloadVehicles),
    sea: true,
    restParkedOnGround: true,
    // Same streaming as Studio's ground mode: the cells around the player first, the rest by distance.
    performance: { preset: params.get('quality') ?? 'custom' },
    tiles: {
      baseUrl: config.base,
      mode: 'static',
      horizon: false,
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
    onDiagnostics: params.has('diagnostics')
      ? (sample) =>
          document
            .getElementById('game-canvas')!
            .dispatchEvent(new CustomEvent('nabla:frame', { detail: sample }))
      : undefined,
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
  window.addEventListener('pagehide', () => runtime?.dispose(), { once: true })
  loading.setStatus(
    config.tile ? `Cargando el terreno ${mapTileId(config.tile)}…` : 'Cargando el terreno…',
  )
  void runBootPhase(runtime, loading, boot)
  // Host vehicles are placed inside play(), before the reveal: their models, lights and
  // programs load behind the intro instead of during the start descent.
  const geography = scene.geography
  if (geography && config.vehicles.length)
    runtime.beforeReveal(async () => {
      bootLog(`installHostVehicles start (${config.vehicles.length})`)
      await installHostVehicles(runtime!, geography, config.vehicles)
      bootLog('installHostVehicles done')
    })
  bootLog('play() start')
  await runtime.play({ vehicleId: 'player-vehicle', playerMode: config.playerMode })
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
  bindShadowBiasControl(runtime, boot.shadowBias)
  const roadStyle = bindAsphaltContrastSlider(runtime, boot.asphaltContrast)
  bindAnisotropySelect(runtime, roadStyle)
  bindGroundDetailSelect(runtime, roadStyle)
  bindSoundControls(runtime)
  bindLightControls(runtime)
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
