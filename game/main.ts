import { GameRuntime } from '@nabla/engine/runtime/browser'
import {
  createFlatTestScene,
  FLAT_TEST_BASE,
  FLAT_TEST_TILES,
} from '@nabla/engine/examples/flat-tile'
import { createEntity, mapTileAt, type SceneDocument } from '@nabla/engine/scene'
import { presetVehicle, hasVehiclePreset } from '@nabla/engine/vehicles'
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
  const loading = new LoadingScreen()
  loading.setTiles(
    flat ? [...FLAT_TEST_TILES] : [mapTileAt(config.spawn.latitude, config.spawn.longitude, 15)],
  )
  runtime = new GameRuntime({
    canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
    scene,
    sea: !flat,
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
