/** "Terreno" section of the menu: choose where the terrain comes from; applying reloads with that URL. */
import {
  DEFAULT_PACKAGES_URL,
  TERRAIN_SOURCES,
  loadTerrainSource,
  parseTerrainSource,
  saveTerrainSource,
  withTerrainSource,
  type SourceStorage,
  DEFAULT_TILES_URL,
  type TerrainSource,
  type TerrainSourceKind,
} from '@nabla/engine/planet/terrain-source'
import { SOURCE_STORAGE_KEY, browserStorage } from './entry.js'
import { menuSection } from './menu.js'

/** Build-time default for the tile host (VITE_NABLA_TILES_URL), else the public Atlas host. */
function configuredTilesUrl(): string {
  return (
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_NABLA_TILES_URL ||
    DEFAULT_TILES_URL
  )
}

/** What to show first in the tile URL field: the active one, the remembered one, the configured one. */
export function suggestedTilesUrl(
  active: TerrainSource | null,
  stored: TerrainSource | null,
  configured: string,
): string {
  if (active?.kind === 'tiles') return active.url ?? ''
  if (stored?.kind === 'tiles') return stored.url ?? ''
  return configured
}

export function bindTerrainSelector(
  search: string = location.search,
  storage: SourceStorage | undefined = browserStorage(),
  reload: (search: string) => void = (next) => location.assign(location.pathname + next),
): void {
  const active = parseTerrainSource(search) ?? { kind: 'flat' as TerrainSourceKind }
  const stored = loadTerrainSource(storage, SOURCE_STORAGE_KEY)
  const section = menuSection('terrain-source', 'Terreno')
  const radios = new Map<TerrainSourceKind, HTMLInputElement>()
  for (const entry of TERRAIN_SOURCES) {
    const label = document.createElement('label')
    label.title = entry.hint
    const radio = document.createElement('input')
    radio.type = 'radio'
    radio.name = 'terrain-source'
    radio.value = entry.kind
    radio.checked = entry.kind === active.kind
    radio.addEventListener('change', refresh)
    radios.set(entry.kind, radio)
    label.append(radio, ' ' + entry.label)
    section.append(label)
  }
  const tilesLabel = document.createElement('label')
  tilesLabel.textContent = 'URL base de las teselas'
  const tiles = document.createElement('input')
  tiles.type = 'url'
  tiles.id = 'terrain-tiles-url'
  tiles.placeholder = 'https://…  o  /ruta'
  tiles.value = suggestedTilesUrl(active, stored, configuredTilesUrl())
  tilesLabel.append(tiles)
  const lidarLabel = document.createElement('label')
  lidarLabel.className = 'inline'
  const lidar = document.createElement('input')
  lidar.type = 'checkbox'
  lidar.id = 'terrain-lidar'
  lidar.checked = active.kind === 'packages' && active.relief === 'lidar'
  lidarLabel.append(lidar, ' Relieve LiDAR (solo visual)')
  const apply = document.createElement('button')
  apply.type = 'button'
  apply.id = 'terrain-apply'
  apply.textContent = 'Aplicar y recargar'
  const message = document.createElement('p')
  message.id = 'terrain-message'
  message.setAttribute('role', 'status')
  section.append(tilesLabel, lidarLabel, apply, message)

  const selected = (): TerrainSourceKind =>
    TERRAIN_SOURCES.find((entry) => radios.get(entry.kind)!.checked)?.kind ?? 'flat'
  function refresh() {
    tilesLabel.hidden = selected() !== 'tiles'
    lidarLabel.hidden = selected() !== 'packages'
    message.textContent = ''
  }
  refresh()

  apply.addEventListener('click', () => {
    const kind = selected()
    const source: TerrainSource =
      kind === 'tiles'
        ? { kind, url: tiles.value }
        : kind === 'packages'
          ? {
              kind,
              url: active.kind === 'packages' ? active.url : DEFAULT_PACKAGES_URL,
              relief: lidar.checked ? 'lidar' : 'engine',
            }
          : { kind }
    try {
      const next = withTerrainSource(search, source)
      saveTerrainSource(storage, SOURCE_STORAGE_KEY, source)
      message.textContent = 'Cargando el terreno elegido…'
      reload(next)
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : String(error)
    }
  })
}
