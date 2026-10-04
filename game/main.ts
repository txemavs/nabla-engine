import { createGallery } from '@nabla/engine/runtime'
import { GameRuntime } from '@nabla/engine/runtime/browser'
import {
  createFlatTestScene,
  FLAT_TEST_BASE,
  FLAT_TEST_TILES,
} from '@nabla/engine/examples/flat-tile'
import { createEntity, mapTileAt, type SceneDocument } from '@nabla/engine/scene'
import { presetVehicle, presetEntities, hasVehiclePreset } from '@nabla/engine/vehicles'
import { parseGameConfig } from './config.js'
import { LoadingScreen, showError } from './loading.js'

let runtime: GameRuntime | undefined
try {
  const config = parseGameConfig()
  const flat = new URLSearchParams(location.search).get('example') === 'flat'
  if (!hasVehiclePreset(config.vehicle))
    throw new Error(`Unknown vehicle preset: ${config.vehicle}`)
  const vehicle = presetVehicle(config.vehicle, 'player-vehicle', [0, 2, 0])
  const scene: SceneDocument = flat
    ? createFlatTestScene(vehicle)
    : {
        version: 1,
        name: 'Drive',
        sky: { mode: 'live' },
        geography: { ...config.spawn, imagery: 'offline', planetary: true },
        entities: [createEntity('spawn', 'spawn', [-4, 2, 0]), vehicle],
      }
  if (flat) {
    const fleet = ['car', 'white-truck', 'carrier']
    scene.entities = [
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
    tractor.vehicle!.cameraDistance = 24
    const trailer = presetVehicle('white-trailer', 'demo-trailer', [10, 2, 7.33])
    trailer.vehicle!.tow = {
      vehicleId: tractor.id,
      hitch: [0, 0, 1.766745487],
      anchor: [0, 0, -5.565219856],
    }
    scene.entities.push(trailer)
  }
  if (flat && new URLSearchParams(location.search).has('gallery'))
    scene.entities.push(...createGallery('demo-gallery'))
  const lights = flat && new URLSearchParams(location.search).has('lights')
  if (lights) scene.sky = { mode: 'fixed', at: '2026-03-20T00:00:00.000Z' }
  const loading = new LoadingScreen()
  loading.setTiles(
    flat ? [...FLAT_TEST_TILES] : [mapTileAt(config.spawn.latitude, config.spawn.longitude, 15)],
  )
  runtime = new GameRuntime({
    canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
    scene,
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
    tiles: flat
      ? { baseUrl: FLAT_TEST_BASE, mode: 'static', tiles: FLAT_TEST_TILES, horizon: false }
      : {
          baseUrl: config.staticTiles ? config.tilesBaseUrl : '/prepared',
          apiUrl: '/prepare',
          mode: config.staticTiles ? 'static' : 'dynamic',
        },
    onProgress(status, tiles) {
      loading.setStatus(status)
      for (const tile of tiles ?? []) loading.markTileLoaded(tile)
    },
    onFrame(frame) {
      document.getElementById('speed-display')!.textContent = Math.round(frame.speedKmh) + ' km/h'
      document.getElementById('gear-display')!.textContent =
        frame.gear === null ? '' : frame.gear < 0 ? 'R' : 'D' + frame.gear
      document.getElementById('location-display')!.textContent = frame.location
        ? frame.location.latitude.toFixed(5) + '°, ' + frame.location.longitude.toFixed(5) + '°'
        : ''
    },
    onError(error) {
      showError(error instanceof Error ? error.message : String(error))
    },
    onMessage(message) {
      document.getElementById('game-message')!.textContent = message
    },
  })
  window.addEventListener('pagehide', () => runtime?.dispose(), { once: true })
  await runtime.play({ vehicleId: vehicle.id })
  loading.hide()
  document.getElementById('game-hud')!.classList.remove('hidden')
  document.getElementById('game-canvas')!.focus()
} catch (error) {
  runtime?.dispose()
  showError(error instanceof Error ? error.message : String(error))
}
