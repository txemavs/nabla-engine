/** Streaming overview uses the engine's existing tile states, without loading any extra cells. */
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import type { TileDiagnostic } from '../src/render/planet/debug.js'

export function tileMapLayout(tiles: readonly TileDiagnostic[]) {
  if (!tiles.length) return []
  const zoom = Math.max(...tiles.map(({ tile }) => tile.z))
  const cells = tiles.map((item) => {
    const size = 2 ** (zoom - item.tile.z)
    return { ...item, x: item.tile.x * size, y: item.tile.y * size, size }
  })
  const left = Math.min(...cells.map((cell) => cell.x)),
    top = Math.min(...cells.map((cell) => cell.y))
  const width = Math.max(...cells.map((cell) => cell.x + cell.size)) - left
  const height = Math.max(...cells.map((cell) => cell.y + cell.size)) - top
  return cells.map((cell) => ({
    ...cell,
    left: ((cell.x - left) / width) * 100,
    top: ((cell.y - top) / height) * 100,
    width: (cell.size / width) * 100,
    height: (cell.size / height) * 100,
  }))
}
const labels: Record<TileDiagnostic['state'], string> = {
  visible: 'Visible',
  resident: 'En memoria',
  downloading: 'Pedida',
  installing: 'Preparando',
  planned: 'En espera',
  retry: 'Reintento',
}
export function createMapSection(doc: Document, runtime: Pick<GameRuntime, 'terrainTiles'>) {
  const root = doc.createElement('fieldset')
  root.id = 'settings-map'
  root.className = 'menu-section'
  const legend = doc.createElement('legend')
  legend.textContent = 'Mapa'
  const note = doc.createElement('p')
  note.className = 'settings-note'
  note.textContent =
    'Estados reales del streaming. Las texturas de las teselas se incorporarán en el siguiente paso.'
  const summary = doc.createElement('p')
  summary.className = 'settings-map-legend'
  const map = doc.createElement('div')
  map.className = 'settings-tile-map'
  map.setAttribute('aria-label', 'Teselas cargadas y pedidas')
  const empty = doc.createElement('p')
  empty.textContent = 'No hay teselas cargadas ni pedidas en esta escena.'
  root.append(legend, note, summary, map, empty)
  let signature = ''
  const refresh = () => {
    const tiles = runtime.terrainTiles ?? []
    const next = tiles.map(({ tile, state }) => `${tile.z}/${tile.x}/${tile.y}:${state}`).join('|')
    if (next === signature && root.dataset.ready) return
    signature = next
    root.dataset.ready = 'true'
    const counts = new Map<string, number>()
    for (const tile of tiles) counts.set(tile.state, (counts.get(tile.state) ?? 0) + 1)
    summary.textContent = [...counts]
      .map(([state, count]) => `${labels[state as TileDiagnostic['state']]}: ${count}`)
      .join(' · ')
    empty.hidden = tiles.length > 0
    map.hidden = tiles.length === 0
    map.replaceChildren(
      ...tileMapLayout(tiles).map((cell) => {
        const tile = doc.createElement('div')
        tile.className = `settings-map-tile state-${cell.state}`
        tile.style.left = `${cell.left}%`
        tile.style.top = `${cell.top}%`
        tile.style.width = `${cell.width}%`
        tile.style.height = `${cell.height}%`
        tile.title = `${cell.tile.z}/${cell.tile.x}/${cell.tile.y} · ${labels[cell.state]}`
        tile.textContent = `${cell.tile.x}/${cell.tile.y}`
        return tile
      }),
    )
  }
  return { root, refresh }
}
