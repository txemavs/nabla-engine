import { mountVREntry } from './vr-entry.js'
import { readFsrSettings } from './fsr-settings.js'
import { restoreStartupLightSettings } from './startup-light-settings.js'
import { controlsHint } from '@nabla/engine/config/controls'
import palletSpec from '../assets/library/cars/forklift-rc/pallet.specs.json'
import { bindVR, preloadVR } from './vr-ui.js'
import { createGallery, portalRegistry, type WorldContent } from '@nabla/engine/runtime/core'
import { GameRuntime } from '@nabla/engine/runtime/browser'
import { createRenderBackend, parseRendererPreference } from '@nabla/engine/render'
import {
  createFlatTestScene,
  createFlatTestGround,
  FLAT_TEST_BASE,
  FLAT_TEST_TILES,
} from '@nabla/engine/examples/flat-tile'
import { createEntity, mapTileAt, type SceneDocument } from '@nabla/engine/scene'
import { presetVehicle, presetEntities, hasVehiclePreset } from '@nabla/engine/vehicles'
import { parseGameConfig, requireGeographicTileBase } from './config.js'
import { assignVehicleColor, sceneHasPresetModel } from './vehicle-colors.js'
import { headingRotation, installHostVehicles } from './host-vehicles.js'
import { installHostPortals } from './host-portals.js'
import { showTelemetry } from './telemetry.js'
import { LoadingScreen, showError } from './loading.js'
import { MissingTiles } from '@nabla/engine/planet/missing-tiles'
import { browserStorage } from './entry.js'
import { showLocation } from './position.js'
import { describeLoading } from './loading-text.js'
import { fpsReadout } from './fps-readout.js'
import { bindTerrainSelector } from './terrain-selector.js'
import { bindSceneControls, menuPreloadVehicles } from './scene-controls.js'
import { bindTerrainCache } from './terrain-cache.js'
import { readDisplaySettings, bindDisplaySettings } from './display-settings.js'
import { bootHiddenLayers, readBootConfig, runBootPhase } from './boot.js'
import {
  parseLayerSpec,
  setHiddenTileLayers,
  setTileClusterCulling,
  parseClusterCulling,
} from '@nabla/engine/render'
import { mountSettingsHud } from './settings-hud.js'
import { osmRoadsRequested } from './layers-ui.js'
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
import { bindDistances } from './distances-ui.js'

// Bound first, so a terrain that fails to load can still be swapped from the menu.
bindTerrainSelector()
// This page does not read &time= / &sea=, so the menu keeps the URL as it is.
const attachSceneControls = bindSceneControls({ rememberInUrl: false })
let runtime: GameRuntime | undefined
try {
  const solo = new URLSearchParams(location.search).get('solo') === '1'
  const config = parseGameConfig()
  const flat = new URLSearchParams(location.search).get('example') === 'flat'
  const tilesBase = flat ? FLAT_TEST_BASE : requireGeographicTileBase(config)
  if (!hasVehiclePreset(config.vehicle))
    throw new Error(`Unknown vehicle preset: ${config.vehicle}`)
  const vehicle = presetVehicle(config.vehicle, 'player-vehicle', [0, 2, 0])
  if (config.color) vehicle.color = config.color
  else assignVehicleColor(vehicle)
  const scene: SceneDocument = flat
    ? createFlatTestScene(vehicle)
    : {
        version: 1,
        name: 'Drive',
        sky: { mode: 'live' },
        geography: {
          latitude: config.spawn.latitude,
          longitude: config.spawn.longitude,
          altitude: config.spawn.altitude,
          imagery: 'offline',
          planetary: true,
        },
        entities: [createEntity('spawn', 'spawn', [-4, 2, 0]), vehicle],
      }
  if (flat && !solo) {
    const fleet = ['car', 'white-truck', 'carrier']
    scene.entities = [
      createFlatTestGround(),
      createEntity('spawn', 'spawn', [-4, 2, 0]),
      ...fleet.flatMap((preset, index) =>
        presetEntities(preset, preset === config.vehicle ? vehicle.id : `demo-${preset}`, [
          index * 10,
          2,
          0,
        ]),
      ),
      ...(fleet.includes(config.vehicle) ? [] : [vehicle]),
    ]
    const tractor = scene.entities.find(
      (e) => e.id === (config.vehicle === 'white-truck' ? vehicle.id : 'demo-white-truck'),
    )!
    tractor.groundOffset = 1.45
    const trailer = presetVehicle('white-trailer', 'demo-trailer', [10, 2, 7.33])
    trailer.vehicle!.tow = {
      vehicleId: tractor.id,
      hitch: tractor.vehicle!.hitch!,
      anchor: trailer.vehicle!.towAnchor!,
    }
    scene.entities.push(trailer)
  }
  if (
    flat &&
    (new URLSearchParams(location.search).has('gallery') ||
      new URLSearchParams(location.search).has('remote'))
  )
    scene.entities.push(...createGallery('demo-gallery'))
  let world: WorldContent | undefined
  if (flat && new URLSearchParams(location.search).has('remote')) {
    const remote = structuredClone(scene)
    remote.name = 'Galería remota'
    remote.geography!.longitude = 0.001
    remote.entities = remote.entities.filter(
      (e) => e.id.startsWith('demo-gallery-') && e.id !== 'demo-gallery-window',
    )
    remote.entities.push(createEntity('remote-spawn', 'spawn', [0, 2, 0]))
    scene.entities = scene.entities.filter(
      (e) => !e.id.startsWith('demo-gallery-') || e.id === 'demo-gallery-window',
    )
    for (const doc of [scene, remote])
      for (const e of doc.entities)
        if (e.portal) {
          e.portal.pairId = null
          e.portal.mode = 'closed'
        }
    world = {
      activeLocation: 'drive',
      locations: [
        { id: 'drive', scene },
        { id: 'gallery', scene: remote },
      ],
      objects: [],
    }
    const registry = portalRegistry(world)
    world.connections = [
      {
        source: registry.find(
          (p) => p.locationId === 'drive' && p.entityId === 'demo-gallery-window',
        )!.id,
        destination: registry.find((p) => p.locationId === 'gallery')!.id,
        mode: 'window',
      },
    ]
  }
  if (solo)
    scene.entities = [
      ...(flat ? [createFlatTestGround()] : []),
      createEntity('spawn', 'spawn', [-4, 2, -4]),
      ...presetEntities(config.vehicle, vehicle.id, [0, 2, 0]),
    ]
  // Explicit flat-track load test: one simulation and shared asset cache for every copy.
  if (flat && solo) {
    const raw = Number(new URLSearchParams(location.search).get('copies') ?? 1)
    const copies = Number.isFinite(raw) ? Math.min(20, Math.max(1, Math.floor(raw))) : 1
    for (let i = 1; i < copies; i++) {
      const column = (i - 1) % 5
      const row = Math.floor((i - 1) / 5)
      scene.entities.push(
        presetVehicle(config.vehicle, `trial-copy-${i}`, [(column - 2) * 5, 2, -8 - row * 7]),
      )
    }
  }
  if (flat && (config.vehicle === 'forklift' || config.vehicle === 'forklift-rc')) {
    for (let i = 0; i < 6; i++) {
      const pallet = createEntity('pallet-' + i, 'box', [
        ((i % 3) - 1) * 2,
        0.04,
        -4 - Math.floor(i / 3) * 2,
      ])
      pallet.name = 'Palet'
      pallet.motion = 'dynamic'
      pallet.mass = 25
      pallet.size = [1.16, 0.145, 1.2]
      pallet.colliders = palletSpec.colliders as NonNullable<typeof pallet.colliders>
      pallet.visual = {
        body: {
          url: '/library/cars/forklift-rc/pallet.glb',
          transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
        },
      }
      scene.entities.push(pallet)
    }
  }
  const noTerrainTest = ['/test.html', '/xr.html'].includes(location.pathname)

  if (noTerrainTest) {
    if (!solo && !sceneHasPresetModel(scene.entities, 'vfr800'))
      scene.entities.push(...presetEntities('vfr800', 'demo-vfr800', [-4, 2, 0]))
    // Space the test fleet explicitly; attached parts retain local transforms.
    const testPositions: Record<string, [number, number, number]> = {
      'player-vehicle': [0, 2, 0],
      'demo-car': [8, 2, 0],
      'demo-white-truck': [24, 2, 8],
      'demo-trailer': [24, 2, 15.33],
      'demo-carrier': [90, 2, 60],
      spawn: [-4, 2, -4],
    }
    for (const entity of scene.entities) {
      const position = testPositions[entity.id]
      if (position) entity.transform.position = [...position]
    }
    // Keep the planetary frame; the test floor is a local box.
    const ground = createEntity('test-ground', 'box', [0, -0.25, 0])
    ground.size = [1000, 0.5, 1000]
    ground.color = '#73787a'
    scene.entities.push(ground)
  }
  const player = scene.entities.find((entity) => entity.id === vehicle.id)
  if (player) player.transform.rotation = headingRotation(config.spawn.heading)
  const lights = flat && new URLSearchParams(location.search).has('lights')
  if (lights) scene.sky = { mode: 'fixed', at: '2026-03-20T00:00:00.000Z' }
  const boot = readBootConfig()
  // Host defaults (e.g. `cityLabels: false`) and `&layers=`; this page keeps no stored layer choice.
  setHiddenTileLayers(
    parseLayerSpec(new URLSearchParams(location.search).get('layers'), bootHiddenLayers(boot)),
  )
  // `?clusterCulling=1`: opt-in 8×8 sub-tile culling of planet tile meshes.
  setTileClusterCulling(parseClusterCulling(location.search))
  const loading = new LoadingScreen(boot.splash)
  loading.setTiles(
    flat ? [...FLAT_TEST_TILES] : [mapTileAt(config.spawn.latitude, config.spawn.longitude, 15)],
  )
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
    scene,
    preloadVehicles: solo ? [] : menuPreloadVehicles(boot.preloadVehicles),
    world,
    sea: !flat,
    fieldLights: lights
      ? {
          look: { level: 20 },
          source: async (tile) =>
            [
              { lat: 0.0001, lon: -0.00007, tags: { highway: 'street_lamp' } },
              { lat: 0.0001, lon: 0.00007, tags: { highway: 'street_lamp' } },
            ].filter((mark) => {
              const at = mapTileAt(mark.lat, mark.lon, 15)
              return at.x === tile.x && at.y === tile.y && tile.z === 15
            }),
        }
      : undefined,
    depthOfField: new URLSearchParams(location.search).has('dof') ? true : undefined,
    performance: { preset: new URLSearchParams(location.search).get('quality') ?? 'custom' },
    tiles: noTerrainTest
      ? undefined
      : flat
        ? { baseUrl: FLAT_TEST_BASE, mode: 'static', tiles: FLAT_TEST_TILES, horizon: false }
        : {
            baseUrl: tilesBase,
            apiUrl: '/prepare',
            mode: config.staticTiles ? 'static' : 'dynamic',
            // Opt-in inspection of the v2+ OSM road asphalt (drawn, never collides). Default hidden.
            osmRoads: osmRoadsRequested(location.search),
            // Atlas packages (terrain, photo) are read when a manifest names one; plain tiles ignore this.
            ...(config.staticTiles && {
              atlas: { relief: 'engine' as const, photo: 'full' as const },
              imagery: 'package' as const,
              missing: new MissingTiles({
                key: `nabla.terrain.missing:${tilesBase}`,
                storage: browserStorage(),
              }),
            }),
          },
    // The bottom line shows renderer, fps and frame times; `?diagnostics` also forwards each sample.
    onDiagnostics: fpsReadout(
      () => document.getElementById('controls-hint'),
      new URLSearchParams(location.search).has('diagnostics')
        ? (sample) =>
            document
              .getElementById('game-canvas')!
              .dispatchEvent(new CustomEvent('nabla:frame', { detail: sample }))
        : undefined,
    ),
    onProgress(status, tiles) {
      const text = describeLoading(runtime?.cellStats ?? null, runtime?.loadDiagnostics ?? null)
      loading.setStatus(runtime?.cellStats ? text.status : status)
      loading.setDetail(text.detail)
      for (const tile of tiles ?? []) loading.markTileLoaded(tile)
    },
    onFrame(frame) {
      showTelemetry(frame)
      showLocation(frame.location)
    },
    onError(error) {
      showError(error instanceof Error ? error.message : String(error))
    },
    onMessage(message) {
      document.getElementById('game-message')!.textContent = message
    },
  })
  mountVREntry(runtime)
  preloadVR(runtime)
  window.addEventListener('pagehide', () => runtime?.dispose(), { once: true })
  bindTerrainCache(runtime)
  if (new URLSearchParams(location.search).has('diagnostics'))
    Object.assign(window, { nablaRuntime: runtime })
  void runBootPhase(runtime, loading, boot)
  restoreStartupLightSettings(runtime)
  await runtime.play(!solo && noTerrainTest ? { playerMode: 'walk' } : { vehicleId: vehicle.id })
  bindVR(runtime)
  if (config.vehicle === 'forklift' || config.vehicle === 'forklift-rc') {
    const help = document.createElement('p')
    help.textContent =
      controlsHint({ mode: 'forklift' }, [
        'forklift.liftUp',
        'forklift.liftDown',
        'forklift.tiltUp',
        'forklift.tiltDown',
        'forklift.sideLeft',
        'forklift.sideRight',
        'forklift.menu',
      ]) + '. En VR: mantener agarre y tirar/empujar la palanca.'
    help.style.cssText =
      'position:fixed;bottom:70px;left:12px;max-width:420px;background:#102632e8;color:white;padding:10px;pointer-events:none'
    document.body.append(help)
  }
  if (noTerrainTest && (!solo || new URLSearchParams(location.search).has('xr')))
    runtime.equipTestSidearm()
  if (!solo && scene.geography && config.vehicles.length)
    await installHostVehicles(runtime, scene.geography, config.vehicles)
  if (scene.geography && config.portals?.length)
    await installHostPortals(runtime, scene.geography, config.portals)
  loading.hide()
  attachSceneControls(runtime)
  bindDisplaySettings(runtime)
  bindFlipCinematicToggle(runtime)
  bindRecoverToRoadToggle(runtime)
  bindShadowBiasControl(runtime, boot.shadowBias)
  const roadStyle = bindAsphaltContrastSlider(runtime, boot.asphaltContrast)
  bindAnisotropySelect(runtime, roadStyle)
  bindGroundDetailSelect(runtime, roadStyle)
  bindDistances(runtime)
  mountSettingsHud(runtime)
  document.getElementById('game-hud')!.classList.remove('hidden')
  document.getElementById('game-canvas')!.focus()
} catch (error) {
  runtime?.dispose()
  showError(error instanceof Error ? error.message : String(error))
}
