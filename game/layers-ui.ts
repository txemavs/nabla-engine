/** Terrain layer selector, inside the existing display menu. Engine owns the layers and the drawing. */
import {
  TILE_LAYERS,
  formatLayerSpec,
  loadHiddenLayers,
  parseLayerSpec,
  saveHiddenLayers,
  type LayerStorage,
} from '@nabla/engine/render'
import type { GameRuntime } from '@nabla/engine/runtime/browser'

export const LAYERS_STORAGE_KEY = 'nabla.terrain.layers'

function browserStorage(): LayerStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/** The layers to start with: an explicit `&layers=` wins over the stored choice. */
export function initialHiddenLayers(
  search: string = location.search,
  storage: LayerStorage | undefined = browserStorage(),
): string[] {
  const spec = new URLSearchParams(search).get('layers')
  return spec === null ? loadHiddenLayers(storage, LAYERS_STORAGE_KEY) : parseLayerSpec(spec, [])
}

/** Add one checkbox per layer (road first) to the display menu; changes apply live and persist. */
export function bindLayerSelector(runtime: GameRuntime, storage = browserStorage()): void {
  const panel = document.getElementById('display-settings')!
  const group = document.createElement('fieldset')
  group.id = 'terrain-layers'
  const legend = document.createElement('legend')
  legend.textContent = 'Capas del terreno'
  group.append(legend)
  const boxes = new Map<string, HTMLInputElement>()
  const sync = () => {
    const hidden = TILE_LAYERS.filter((layer) => !boxes.get(layer.id)!.checked).map((l) => l.id)
    runtime.setHiddenLayers(hidden)
    saveHiddenLayers(storage, LAYERS_STORAGE_KEY, hidden)
    const url = new URL(location.href)
    const spec = formatLayerSpec(hidden)
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
  panel.querySelector('summary')!.after(group)
}
