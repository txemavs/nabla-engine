import { GameRuntime } from '@nabla/engine/runtime/browser'
import { projectGroundPhoto, setHiddenTileLayers } from '@nabla/engine/render'
import { createTerrainDriveScene } from '@nabla/engine/examples/terrain-drive'
import { hasVehiclePreset } from '@nabla/engine/vehicles'
import { mapTileId } from '@nabla/engine/scene'
import { MissingTiles } from '@nabla/engine/planet/missing-tiles'
import { browserStorage } from './entry.js'
import { LoadingScreen, showError } from './loading.js'
import { startError } from './start-error.js'
import { bindPosition, showLocation } from './position.js'
import { bindTerrainSelector } from './terrain-selector.js'
import { bindTerrainCache } from './terrain-cache.js'
import { bindLayerSelector, initialHiddenLayers } from './layers-ui.js'
import { readDisplaySettings, bindDisplaySettings } from './display-settings.js'
import { formatCells, parseTerrainConfig, startFromIndex } from './terrain.js'
import { describeLoading } from './loading-text.js'

/** Spanish controls for the terrain example (the original hint is shared with the flat demo). */
const CONTROLS =
  '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Conducir · <kbd>Espacio</kbd> Freno · ' +
  '<kbd>C</kbd> Cámara · <kbd>J</kbd> Menú · <kbd>H</kbd> GPS · <kbd>E</kbd> Entrar/salir · ' +
  '<kbd>V</kbd> Vuelo · <kbd>F</kbd> Acoplar · <kbd>T</kbd> Transferir · <kbd>R</kbd> Recuperar · ' +
  '<kbd>Tab</kbd> Arma'

// Bound first, so a terrain that fails to load can still be swapped from the menu.
bindTerrainSelector()
bindPosition()
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
  startBase = config.base
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
  setHiddenTileLayers(initialHiddenLayers())
  runtime = new GameRuntime({
    locale: 'es',
    hud: true,
    display: readDisplaySettings(),
    canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
    scene,
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
      document.getElementById('speed-display')!.textContent = Math.round(frame.speedKmh) + ' km/h'
      document.getElementById('gear-display')!.textContent = frame.gearLabel ?? ''
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
  bindTerrainCache(runtime)
  // Headless checks read where vehicles and the player sit against the ground.
  if (params.has('diagnostics'))
    Object.assign(window, { nablaGroundAudit: () => runtime?.groundAudit(), nablaRuntime: runtime })
  window.addEventListener('pagehide', () => runtime?.dispose(), { once: true })
  loading.setStatus(
    config.tile ? `Cargando el terreno ${mapTileId(config.tile)}…` : 'Cargando el terreno…',
  )
  await runtime.play({ vehicleId: 'player-vehicle', playerMode: config.playerMode })
  loading.hide()
  bindDisplaySettings(runtime)
  bindLayerSelector(runtime)
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
