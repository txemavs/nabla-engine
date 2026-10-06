/** Terrain layer selector (menu section "Capas"). Engine owns the layers and the drawing. */
import {
  TILE_LAYERS,
  formatLayerSpec,
  loadHiddenLayers,
  parseLayerSpec,
  saveHiddenLayers,
  type LayerStorage,
} from '@nabla/engine/render'
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { menuSection } from './menu.js'

export const LAYERS_STORAGE_KEY = 'nabla.terrain.layers'
export const ROAD_HIDDEN_HINT = 'Carretera oculta: no se ven asfalto ni puentes'

function browserStorage(): LayerStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/**
 * The layers to start with: an explicit `&layers=` wins over the stored choice. Both apply over
 * `defaults`, the host's default hidden layers (e.g. `['places']` from `NABLA_BOOT.cityLabels: false`).
 */
export function initialHiddenLayers(
  search: string = location.search,
  storage: LayerStorage | undefined = browserStorage(),
  defaults: readonly string[] = [],
): string[] {
  const spec = new URLSearchParams(search).get('layers')
  return spec === null
    ? loadHiddenLayers(storage, LAYERS_STORAGE_KEY, defaults)
    : parseLayerSpec(spec, defaults)
}

/** HUD text while the road layer ('Carretera') is hidden; undefined when roads are drawn. */
export function roadHiddenHint(hidden: readonly string[]): string | undefined {
  return hidden.includes('road') ? ROAD_HIDDEN_HINT : undefined
}

/**
 * Small HUD chip shown while 'Carretera' is hidden (a stored `-road` survives reloads, and
 * roads and bridges then vanish without any other sign). «Mostrar» turns the layer back on.
 */
function mountRoadHiddenHint(onShow: () => void): (hidden: readonly string[]) => void {
  const hint = document.createElement('div')
  hint.id = 'road-hidden-hint'
  hint.setAttribute('role', 'status')
  const text = document.createElement('span')
  const show = document.createElement('button')
  show.type = 'button'
  show.textContent = 'Mostrar'
  show.addEventListener('click', onShow)
  hint.append(text, show)
  document.body.append(hint)
  return (hidden) => {
    const message = roadHiddenHint(hidden)
    text.textContent = message ?? ''
    hint.classList.toggle('hidden', !message)
  }
}

/**
 * Add one checkbox per layer (road first) to the Capas menu section; changes apply live and persist
 * as differences from `defaults` (the same host defaults given to `initialHiddenLayers`).
 * A HUD chip says when 'Carretera' is hidden.
 */
export function bindLayerSelector(
  runtime: GameRuntime,
  storage = browserStorage(),
  defaults: readonly string[] = [],
): void {
  const group = menuSection('terrain-layers', 'Capas')
  const boxes = new Map<string, HTMLInputElement>()
  const showRoad = () => {
    const road = boxes.get('road')
    if (!road || road.checked) return
    road.checked = true
    sync()
  }
  const updateHint = mountRoadHiddenHint(showRoad)
  const sync = () => {
    const hidden = TILE_LAYERS.filter((layer) => !boxes.get(layer.id)!.checked).map((l) => l.id)
    runtime.setHiddenLayers(hidden)
    updateHint(hidden)
    saveHiddenLayers(storage, LAYERS_STORAGE_KEY, hidden, defaults)
    const url = new URL(location.href)
    const spec = formatLayerSpec(hidden, defaults)
    if (spec) url.searchParams.set('layers', spec)
    else url.searchParams.delete('layers')
    history.replaceState(null, '', url)
  }
  const hidden = new Set(runtime.hiddenLayers)
  for (const layer of TILE_LAYERS) {
    const label = document.createElement('label')
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.dataset.layer = layer.id
    box.checked = !hidden.has(layer.id)
    box.addEventListener('change', sync)
    boxes.set(layer.id, box)
    label.append(box, ' ' + layer.label)
    group.append(label)
  }
  updateHint([...hidden])
}
