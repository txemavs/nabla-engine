/**
 * Terrain cache and load radius in the "Terreno" menu section: disk cache size, cells kept in memory,
 * load radius and "Vaciar caché". The mechanisms are the engine's (the shared IndexedDB map cache and
 * PlanetWorld streaming) and Studio's vocabulary; this file only draws the controls.
 */
import { clearMapCache, mapCacheStats, setMapCacheBudget } from '@nabla/engine/render'
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import {
  CACHE_BUDGETS_MB,
  LOAD_DISTANCES_M,
  MEMORY_CELL_CHOICES,
  formatBudget,
  formatCacheUsage,
  formatDistance,
  formatMemoryCells,
  normalizeCacheSettings,
  parseCacheParams,
  parseStoredCache,
  resolveCacheSettings,
  serializeStoredCache,
  type TerrainCacheSettings,
} from '@nabla/engine/planet/terrain-cache'
import { formatMissingReport } from '@nabla/engine/planet/missing-tiles'
import { browserStorage } from './entry.js'
import type { SourceStorage } from '@nabla/engine/planet/terrain-source'

export const CACHE_STORAGE_KEY = 'nabla.terrain.cache'
/** Package cells are 11-15 MB each: the engine's 100 MB default would evict them as they arrive. */
export const DEFAULT_CACHE: TerrainCacheSettings = { diskMb: 1000 }

/** Remembered values, overridden field by field by the URL. */
export function currentCacheSettings(
  search: string = location.search,
  storage: SourceStorage | undefined = browserStorage(),
): TerrainCacheSettings {
  return resolveCacheSettings(
    search,
    parseStoredCache(storage?.getItem(CACHE_STORAGE_KEY)),
    DEFAULT_CACHE,
  )
}

/** Apply settings to a running game. Returns what the browser refused (e.g. no IndexedDB). */
export async function applyCacheSettings(
  runtime: GameRuntime,
  settings: TerrainCacheSettings,
): Promise<void> {
  runtime.setStreaming({ distance: settings.distance, cells: settings.cells })
  if (settings.diskMb !== undefined) await setMapCacheBudget(settings.diskMb)
}

function choice(
  id: string,
  text: string,
  values: readonly number[],
  format: (value: number) => string,
  current: number,
): { label: HTMLLabelElement; select: HTMLSelectElement } {
  const label = document.createElement('label')
  label.textContent = text
  const select = document.createElement('select')
  select.id = id
  const all = values.includes(current) ? values : [...values, current].sort((a, b) => a - b)
  for (const value of all) select.add(new Option(format(value), String(value)))
  select.value = String(current)
  label.append(select)
  return { label, select }
}

/** Build the controls inside the "Terreno" section, apply the remembered settings, keep the usage line fresh. */
export function bindTerrainCache(
  runtime: GameRuntime,
  search: string = location.search,
  storage: SourceStorage | undefined = browserStorage(),
): void {
  const section = document.getElementById('terrain-source')
  if (!section) return
  const settings = currentCacheSettings(search, storage)
  void applyCacheSettings(runtime, settings).catch(() => {})
  const live = runtime.streaming
  const stored = parseStoredCache(storage?.getItem(CACHE_STORAGE_KEY))

  const heading = document.createElement('p')
  heading.textContent = 'Caché y alcance'
  heading.className = 'menu-subtitle'
  const disk = choice(
    'terrain-cache-disk',
    'Caché en disco',
    CACHE_BUDGETS_MB,
    formatBudget,
    settings.diskMb ?? 1000,
  )
  const memory = choice(
    'terrain-cache-memory',
    'Celdas en memoria',
    MEMORY_CELL_CHOICES,
    String,
    settings.cells ?? live.cells,
  )
  const distance = choice(
    'terrain-cache-distance',
    'Radio de carga',
    LOAD_DISTANCES_M,
    formatDistance,
    settings.distance ?? live.distance,
  )
  const usage = document.createElement('p')
  usage.id = 'terrain-cache-usage'
  usage.setAttribute('role', 'status')
  const clear = document.createElement('button')
  clear.type = 'button'
  clear.id = 'terrain-cache-clear'
  clear.textContent = 'Vaciar caché'
  const holes = document.createElement('button')
  holes.type = 'button'
  holes.id = 'terrain-missing-show'
  holes.textContent = 'Celdas que faltan'
  holes.title = 'Celdas que el servidor no tiene (huecos en el mapa), para pedirlas al productor'
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.id = 'terrain-missing-retry'
  retry.textContent = 'Volver a pedirlas'
  const list = document.createElement('pre')
  list.id = 'terrain-missing-list'
  list.hidden = true
  section.append(
    heading,
    disk.label,
    memory.label,
    distance.label,
    usage,
    clear,
    holes,
    retry,
    list,
  )
  const showHoles = () => {
    const tiles = runtime.missingTiles
    list.textContent = tiles.length
      ? formatMissingReport(tiles)
      : 'Ninguna: el servidor tiene todas las celdas pedidas.'
    list.hidden = false
  }
  holes.addEventListener('click', () => (list.hidden ? showHoles() : (list.hidden = true)))
  retry.addEventListener('click', () => {
    runtime.clearMissingTiles()
    list.hidden = true
  })

  let remembered: TerrainCacheSettings = { ...stored }
  const change = (patch: TerrainCacheSettings) => {
    const next = normalizeCacheSettings({ ...settings, ...patch })
    Object.assign(settings, next)
    remembered = { ...remembered, ...patch }
    try {
      storage?.setItem(CACHE_STORAGE_KEY, serializeStoredCache(remembered))
    } catch {
      /* Remembering is optional. */
    }
    // A URL value would win over what was just chosen on the next load: keep the address in step.
    const url = new URL(location.href)
    const given = parseCacheParams(search)
    const names = { diskMb: 'cache', cells: 'memory', distance: 'distance' } as const
    for (const key of Object.keys(patch) as (keyof typeof names)[])
      if (given[key] !== undefined) url.searchParams.set(names[key], String(patch[key]))
    history.replaceState(null, '', url)
    void applyCacheSettings(runtime, patch)
      .catch(() => {
        usage.textContent = 'No se pudo ajustar la caché del navegador.'
      })
      .then(() => {
        // A new radius without a chosen cell count brings the engine's own count for it.
        if (patch.distance !== undefined && settings.cells === undefined)
          memory.select.value = String(runtime.streaming.cells)
        return refresh()
      })
  }
  disk.select.addEventListener('change', () => change({ diskMb: Number(disk.select.value) }))
  memory.select.addEventListener('change', () => change({ cells: Number(memory.select.value) }))
  distance.select.addEventListener('change', () =>
    change({ distance: Number(distance.select.value) }),
  )
  clear.addEventListener('click', async () => {
    try {
      await clearMapCache()
      await refresh()
    } catch {
      usage.textContent = 'No se pudo vaciar la caché.'
    }
  })

  async function refresh() {
    const cells = runtime.cellStats
    const memoryLine = cells
      ? formatMemoryCells(cells.loaded, runtime.streaming.cells) +
        (cells.missing ? ` · ${cells.missing} faltan en el servidor` : '')
      : ''
    try {
      usage.textContent = `${formatCacheUsage(await mapCacheStats())}${memoryLine ? ' · ' + memoryLine : ''}`
    } catch {
      usage.textContent = `Caché del navegador no disponible${memoryLine ? ' · ' + memoryLine : ''}`
    }
  }
  const panel = document.getElementById('display-settings') as HTMLDetailsElement | null
  let timer: ReturnType<typeof setInterval> | undefined
  panel?.addEventListener('toggle', () => {
    clearInterval(timer)
    if (panel.open) {
      void refresh()
      timer = setInterval(() => void refresh(), 2000)
    }
  })
  void refresh()
}
