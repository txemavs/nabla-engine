import { GameRuntime } from '@nabla/engine/runtime/browser'
import { projectGroundPhoto } from '@nabla/engine/render'
import { createTerrainDriveScene } from '@nabla/engine/examples/terrain-drive'
import { hasVehiclePreset } from '@nabla/engine/vehicles'
import { mapTileId } from '@nabla/engine/scene'
import { LoadingScreen, showError } from './loading.js'
import { readDisplaySettings, bindDisplaySettings } from './display-settings.js'
import { fetchCoverage, parseTerrainConfig, startFromIndex } from './terrain.js'

/** Spanish controls for the terrain example (the original hint is shared with the flat demo). */
const CONTROLS =
  '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Conducir · <kbd>Espacio</kbd> Freno · ' +
  '<kbd>C</kbd> Cámara · <kbd>J</kbd> Menú · <kbd>H</kbd> GPS · <kbd>E</kbd> Entrar/salir · ' +
  '<kbd>V</kbd> Vuelo · <kbd>F</kbd> Acoplar · <kbd>T</kbd> Transferir · <kbd>R</kbd> Recuperar · ' +
  '<kbd>Tab</kbd> Arma'

let runtime: GameRuntime | undefined
try {
  const params = new URLSearchParams(location.search)
  const config = await startFromIndex(parseTerrainConfig())
  const vehicle = config.scene.vehicle ?? 'car'
  if (!hasVehiclePreset(vehicle)) throw new Error(`Vehículo desconocido: ${vehicle}`)
  const scene = createTerrainDriveScene({
    ...config.scene,
    latitude: config.start!.latitude,
    longitude: config.start!.longitude,
  })
  const loading = new LoadingScreen()
  loading.setTiles(config.tile ? [config.tile] : [])
  document.getElementById('controls-hint')!.innerHTML = CONTROLS
  if (config.atlas.photo !== 'none') projectGroundPhoto()
  runtime = new GameRuntime({
    display: readDisplaySettings(),
    canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
    scene,
    sea: true,
    restParkedOnGround: true,
    performance: { preset: params.get('quality') ?? 'custom' },
    tiles: {
      baseUrl: config.base,
      mode: 'static',
      horizon: false,
      // A host that lists its tiles (the dev-server mount does) is never asked for tiles it lacks.
      coverage: await fetchCoverage(config.base),
      atlas: config.atlas,
      imagery: config.atlas.photo === 'none' ? 'none' : 'package',
    },
    onDiagnostics: params.has('diagnostics')
      ? (sample) =>
          document
            .getElementById('game-canvas')!
            .dispatchEvent(new CustomEvent('nabla:frame', { detail: sample }))
      : undefined,
    onProgress(status, tiles) {
      loading.setStatus(status)
      for (const tile of tiles ?? []) loading.markTileLoaded(tile)
    },
    onFrame(frame) {
      document.getElementById('speed-display')!.textContent = Math.round(frame.speedKmh) + ' km/h'
      document.getElementById('gear-display')!.textContent = frame.gearLabel ?? ''
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
  loading.setStatus(
    config.tile ? `Cargando el terreno ${mapTileId(config.tile)}…` : 'Cargando el terreno…',
  )
  await runtime.play({ vehicleId: 'player-vehicle' })
  loading.hide()
  bindDisplaySettings(runtime)
  document.getElementById('game-hud')!.classList.remove('hidden')
  document.getElementById('game-canvas')!.focus()
} catch (error) {
  runtime?.dispose()
  showError(error instanceof Error ? error.message : String(error))
}
