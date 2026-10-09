/**
 * Compact in-game settings: a small HUD icon opens a GTA Online–style tabbed
 * window styled with the shared ship-monitor stylesheet. Plain HTML/CSS/JS.
 *
 * Architecture: the Planeta tab hosts `createPlanetSettingsPanel().root`, which
 * a ship interior monitor can remount later without a second stylesheet.
 */
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import {
  createPlanetSettingsPanel,
  installVehicleMonitorStyles,
  type PlanetSettingsPanel,
} from '../src/runtime/planet-settings-panel.js'

export type SettingsHud = {
  open: () => void
  close: () => void
  toggle: () => void
  destroy: () => void
}

const TABS = [
  { id: 'planet', label: 'Planeta' },
  { id: 'options', label: 'Opciones' },
  { id: 'performance', label: 'Rendimiento' },
  { id: 'video', label: 'Vídeo' },
  { id: 'audio', label: 'Audio' },
  { id: 'objects', label: 'Objetos' },
  { id: 'dev', label: 'Desarrollo' },
] as const

type TabId = (typeof TABS)[number]['id']

/**
 * Where each menu section (`menuSection(id, …)`) lives, in display order within its tab:
 *   Planeta     — Posición, Hora, Tierra (map layers), Mar, Aire (clouds), Cielo (sky, sun, flare)
 *   Opciones    — player preferences: Cámara, Conducción, Volante y espejos, Mapa (city labels)
 *   Rendimiento — Calidad (profile, FPS limit, resolution scale, apply) and the terrain Caché
 *   Vídeo       — Sombras and Postproceso (asphalt contrast)
 *   Audio       — General / Motor / Música volumes and music mute
 *   Objetos     — Añadir (vehicles and objects to place)
 *   Desarrollo  — planet values to copy, light tuning sliders, terrain source
 * Sections created after the HUD mounts (the Tierra layer list is bound later) are placed as they
 * appear. An unknown id lands in Opciones so a new feature is never left in the hidden legacy menu.
 */
export const SECTION_TABS: ReadonlyArray<readonly [id: string, tab: TabId]> = [
  ['terrain-position', 'planet'],
  ['settings-planet-time', 'planet'],
  ['terrain-layers', 'planet'],
  ['settings-planet-sea', 'planet'],
  ['settings-planet-air', 'planet'],
  ['settings-planet-sky', 'planet'],
  ['camera-extras', 'options'],
  ['driving-extras', 'options'],
  ['settings-options-driver', 'options'],
  ['settings-options-labels', 'options'],
  ['display-quality-section', 'performance'],
  ['display-performance', 'performance'],
  ['terrain-cache', 'performance'],
  ['quality-shadows', 'video'],
  ['road-style', 'video'],
  ['settings-sound', 'audio'],
  ['scene-vehicles', 'objects'],
  ['settings-config-planet', 'dev'],
  ['settings-light', 'dev'],
  ['terrain-source', 'dev'],
]

/** Tab for a section id, or undefined when the HUD does not place it (the legacy Planeta). */
export function sectionTab(id: string): TabId | undefined {
  if (id === 'scene-planet') return undefined
  return SECTION_TABS.find(([section]) => section === id)?.[1] ?? 'options'
}

/** Section titles in the Ajustes window; the sections keep their ids, listeners and storage. */
const SECTION_TITLES: Readonly<Record<string, string>> = {
  'terrain-layers': 'Tierra',
  'road-style': 'Postproceso',
  'scene-vehicles': 'Añadir',
  'settings-light': 'Luz (ajuste fino)',
}

/** Shorter names for the Tierra layer switches (by `data-layer`). */
const LAYER_LABELS: Readonly<Record<string, string>> = {
  photo: 'Suelo',
  road: 'Carreteras',
  buildings: 'Edificios',
}

/** The city labels toggle is a player preference: it leaves the Tierra list for Opciones. */
const OPTION_LAYERS = ['places'] as const

/** Replace the first piece of text in a row, keeping its control (and its listeners). */
function relabel(row: Element | null | undefined, text: string): void {
  if (!row) return
  for (const node of row.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue
    const old = node.textContent
    node.textContent = (old.startsWith(' ') ? ' ' : '') + text + (old.endsWith(' ') ? ' ' : '')
    return
  }
}

/** Replace the sprawling `#display-settings` details with icon + tabbed window. */
export function mountSettingsHud(runtime: GameRuntime): SettingsHud {
  const doc = document
  installVehicleMonitorStyles(doc.head)

  const legacy = doc.getElementById('display-settings') as HTMLDetailsElement | null
  if (legacy) {
    legacy.open = false
    legacy.hidden = true
  }

  const toggle = doc.createElement('button')
  toggle.type = 'button'
  toggle.id = 'settings-toggle'
  toggle.className = 'settings-toggle'
  toggle.title = 'Ajustes (Planeta / visual)'
  toggle.setAttribute('aria-label', 'Abrir ajustes')
  toggle.setAttribute('aria-expanded', 'false')
  toggle.setAttribute('aria-controls', 'settings-window')
  toggle.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
    '<path fill="currentColor" d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm9.4 3.1-1.1-.6.2-1.3 1.2-2.1-2.1-2.1-2.1 1.2-1.3.2-.6-1.1L14.4 3h-4.8l-.6 1.8-1.3-.2-2.1-1.2-2.1 2.1 1.2 2.1-.2 1.3-1.1.6L3 14.4v4.8l1.8.6.2 1.3-1.2 2.1 2.1 2.1 2.1-1.2 1.3-.2.6 1.1.6 1.8h4.8l.6-1.8 1.3.2 2.1 1.2 2.1-2.1-1.2-2.1.2-1.3 1.1-.6 1.8-.6v-4.8l-1.8-.6zM12 16.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9z"/></svg>'

  const win = doc.createElement('div')
  win.id = 'settings-window'
  win.className = 'settings-window portal-tablet-layer'
  win.hidden = true
  win.setAttribute('role', 'dialog')
  win.setAttribute('aria-label', 'Ajustes')

  const console = doc.createElement('div')
  console.className = 'portal-console settings-console'
  const title = doc.createElement('strong')
  title.textContent = 'NABLA · AJUSTES'
  const tabBar = doc.createElement('div')
  tabBar.className = 'settings-tabs'
  tabBar.setAttribute('role', 'tablist')

  const panes = doc.createElement('div')
  panes.className = 'settings-panes'

  const paneEls = new Map<TabId, HTMLElement>()
  for (const tab of TABS) {
    const btn = doc.createElement('button')
    btn.type = 'button'
    btn.className = 'settings-tab'
    btn.id = `settings-tab-${tab.id}`
    btn.dataset.tab = tab.id
    btn.setAttribute('role', 'tab')
    btn.setAttribute('aria-selected', tab.id === 'planet' ? 'true' : 'false')
    btn.textContent = tab.label
    tabBar.append(btn)

    const pane = doc.createElement('div')
    pane.className = 'settings-pane'
    pane.id = `settings-pane-${tab.id}`
    pane.dataset.pane = tab.id
    pane.setAttribute('role', 'tabpanel')
    pane.hidden = tab.id !== 'planet'
    panes.append(pane)
    paneEls.set(tab.id, pane)
  }

  const closeBtn = doc.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'settings-close'
  closeBtn.textContent = 'Cerrar'
  console.append(title, tabBar, panes, closeBtn)
  win.append(console)

  const planetPane = paneEls.get('planet')!
  const timeGroup = doc.getElementById('scene-time')
  // The planet panel's controls are spread over the Planeta sections below; its emptied root
  // stays out of the window.
  let planetPanel: PlanetSettingsPanel | null = createPlanetSettingsPanel(doc)

  const fieldset = (id: string, title?: string) => {
    const group = doc.createElement('fieldset')
    group.className = 'menu-section'
    group.id = id
    if (title) {
      const legend = doc.createElement('legend')
      legend.textContent = title
      group.append(legend)
    }
    return group
  }

  /** Move a section into its tab, keeping the `SECTION_TABS` order inside the pane. */
  const order = (id: string) => SECTION_TABS.findIndex(([section]) => section === id)
  const place = (el: HTMLElement) => {
    const tab = sectionTab(el.id)
    if (!tab) return
    const pane = paneEls.get(tab)!
    if (el.parentElement !== pane) {
      const rank = order(el.id)
      const next = rank === -1 ? null : [...pane.children].find((child) => order(child.id) > rank)
      pane.insertBefore(el, next ?? null)
    }
    const title = SECTION_TITLES[el.id]
    const legend = el.querySelector(':scope > legend')
    if (title && legend) legend.textContent = title
    if (el.id === 'terrain-layers') {
      for (const [id, text] of Object.entries(LAYER_LABELS))
        relabel(el.querySelector(`input[data-layer="${id}"]`)?.closest('label'), text)
      moveOptionLayers(el)
    }
  }

  // «Nombres de poblaciones» keeps its checkbox (and the layer selector's listener and storage);
  // only its row moves to Opciones → Mapa.
  const moveOptionLayers = (layers: HTMLElement) => {
    const rows = OPTION_LAYERS.map(
      (id) => layers.querySelector(`input[data-layer="${id}"]`)?.closest('label') ?? null,
    ).filter((row): row is HTMLLabelElement => row !== null)
    if (!rows.length) return
    let group = doc.getElementById('settings-options-labels')
    if (!group) {
      group = fieldset('settings-options-labels', 'Mapa')
      place(group)
    }
    group.append(...rows)
  }

  // Desarrollo: the planet config text and «Copiar config».
  const configGroup = fieldset('settings-config-planet', 'Valores del planeta')
  configGroup.append(planetPanel.config)
  place(configGroup)

  // Planeta: the planet panel rows and the legacy Hora / Mar groups, one titled section each.
  const panelRoot = planetPanel.root
  // The window joins the document only at the end of the mount: look in it and in the
  // (detached) panel too.
  const byId = (id: string) =>
    doc.getElementById(id) ??
    win.querySelector<HTMLElement>(`#${id}`) ??
    panelRoot.querySelector<HTMLElement>(`#${id}`)
  const rowOf = (id: string) => byId(id)?.closest('label') ?? null
  const rows = (...items: Array<HTMLElement | null>) =>
    items.filter((item): item is HTMLElement => item !== null)
  const subtitle = (text: string) => {
    const heading = doc.createElement('p')
    heading.className = 'menu-subtitle'
    heading.textContent = text
    return heading
  }
  /** A legacy planet group keeps its controls; the section legend replaces its own subtitle. */
  const hideSubtitle = (group: HTMLElement | null) => {
    const heading = group?.querySelector<HTMLElement>(':scope > .menu-subtitle')
    if (heading) heading.hidden = true
  }
  const skyRow = rowOf('ps-sky')
  const sunRow = rowOf('ps-sun')
  const seaRow = rowOf('ps-sea')
  const cloudsRow = rowOf('ps-clouds')
  const artisticRow = rowOf('ps-artistic')
  relabel(skyRow, 'Activado')
  relabel(sunRow, 'Activado')
  relabel(seaRow, 'Activado')
  relabel(rowOf('ps-cloud-amount'), 'Nublado')
  relabel(rowOf('ps-cloud-pressure-mode'), 'Presión')
  relabel(rowOf('ps-cloud-pressure'), 'Presión (valor)')
  relabel(rowOf('ps-lens-flare'), 'Destello')

  if (timeGroup) {
    const time = fieldset('settings-planet-time', 'Hora')
    hideSubtitle(timeGroup)
    relabel(rowOf('time-range'), 'Fijar')
    relabel(rowOf('time-speed'), 'Velocidad')
    time.append(timeGroup)
    place(time)
  }
  const seaGroup = byId('scene-sea')
  const sea = fieldset('settings-planet-sea', 'Mar')
  if (seaGroup) {
    hideSubtitle(seaGroup)
    // The panel's sea switch replaces the legacy duplicate; the tide button sits before the level.
    byId('planet-sea')?.closest('label')?.setAttribute('hidden', '')
    const tide = byId('sea-tide')
    if (tide) tide.textContent = 'Mareas'
    const level = rowOf('sea-range')
    relabel(level, 'Nivel m')
    seaGroup.append(...rows(seaRow, tide, level))
    sea.append(seaGroup)
  } else sea.append(...rows(seaRow))
  place(sea)

  const air = fieldset('settings-planet-air', 'Aire')
  air.append(
    ...rows(
      cloudsRow,
      artisticRow,
      subtitle('Cielo'),
      rowOf('ps-cloud-amount'),
      rowOf('ps-cloud-pressure-mode'),
      rowOf('ps-cloud-pressure'),
    ),
  )
  place(air)

  const sky = fieldset('settings-planet-sky', 'Cielo')
  sky.append(...rows(skyRow, subtitle('Sol'), sunRow, rowOf('ps-lens-flare')))
  place(sky)

  const menu = doc.getElementById('menu-sections')
  const legacySections = () =>
    [...(menu?.children ?? [])].filter((el): el is HTMLElement => el instanceof HTMLElement)
  for (const id of ['display-quality-section', 'display-performance']) {
    const el = doc.getElementById(id)
    if (el) place(el)
  }
  for (const el of legacySections()) place(el)

  // Rendimiento → Calidad: profile, FPS limit and resolution scale in one section, with the
  // «Aplicar calidad y reiniciar» button and its note last. The controls keep their ids and binds.
  const quality = byId('display-quality-section')
  const performanceGroup = byId('display-performance')
  if (quality && performanceGroup) {
    const tail = [...quality.children].filter((el) => el.matches('button, p'))
    quality.append(
      ...[...performanceGroup.children].filter((el) => el.tagName !== 'LEGEND'),
      ...tail,
    )
    performanceGroup.hidden = true
  }

  // Opciones → Volante y espejos: the driver's steering wheel and mirror glass adjustments.
  const driverGroups = rows(byId('scene-steering-wheel'), byId('scene-mirrors'))
  if (driverGroups.length) {
    const driver = fieldset('settings-options-driver', 'Volante y espejos')
    driver.append(...driverGroups)
    place(driver)
  }

  // The legacy Planeta section (scene-controls) duplicates the sky / sun / clouds toggles the
  // planet panel already has; its Hora and Mar groups moved above. Keep it in the DOM (it holds
  // the listeners) but hidden.
  const legacyPlanet = byId('scene-planet')
  if (legacyPlanet) {
    for (const id of ['scene-sky', 'scene-sun', 'scene-clouds']) {
      const el = byId(id)
      if (el) el.hidden = true
    }
    legacyPlanet.hidden = true
    planetPane.append(legacyPlanet)
  }

  // A tab with nothing to show (e.g. Audio on a host without the mixer) is hidden.
  const syncTabs = () => {
    for (const tab of TABS) {
      const pane = paneEls.get(tab.id)!
      const btn = tabBar.querySelector<HTMLElement>(`#settings-tab-${tab.id}`)
      if (btn) btn.hidden = !pane.querySelector(':scope > :not([hidden])')
    }
  }
  syncTabs()
  // Sections bound after the HUD (Tierra in the terrain game) are placed when they appear.
  const observer = menu
    ? new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes) if (node instanceof HTMLElement) place(node)
        syncTabs()
      })
    : null
  observer?.observe(menu!, { childList: true })

  const style = doc.createElement('style')
  style.id = 'nabla-settings-hud-layout'
  style.textContent = `
.settings-toggle {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 30;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  color: #c6e6ff;
  background: #142735;
  border: 2px solid #395e79;
  border-radius: 12px;
  cursor: pointer;
}
.settings-toggle[aria-expanded='true'] {
  background: #1d4e73;
  border-color: #8fd0ff;
}
.settings-window {
  position: fixed;
  top: 72px;
  right: 20px;
  z-index: 30;
  width: min(580px, calc(100vw - 24px));
  max-height: calc(100vh - 92px);
  overflow: auto;
  pointer-events: auto;
}
.settings-console {
  width: 100%;
  height: auto;
  min-height: 280px;
  max-height: none;
}
.settings-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin: 10px 0 12px;
}
.settings-console .settings-tab {
  min-width: 0;
  padding: 4px;
  font-size: 16px;
}
.settings-tab[hidden],
.settings-pane [hidden] {
  display: none !important;
}
.settings-tab[aria-selected='true'] {
  background: #1d4e73;
  border-color: #8fd0ff;
}
.settings-pane .menu-section {
  margin: 10px 0 0;
  padding: 0;
  border: 0;
}
.settings-pane label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
}
.settings-pane output,
.planet-settings-config {
  color: #91cdfb;
  font-variant-numeric: tabular-nums;
}
.planet-settings-config {
  margin-top: 0;
  padding: 10px;
  background: #0a1520;
  border: 1px solid #395e79;
  border-radius: 6px;
  font-size: 16px;
  white-space: pre-wrap;
  user-select: all;
}
/* Compact rows everywhere: a select or slider shares the line with its label. */
.settings-pane label:has(select),
.settings-pane label:has(input[type='range']) {
  flex-wrap: nowrap;
  white-space: nowrap;
}
.settings-pane label select {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  margin: 0;
  padding-block: 2px;
}
.settings-pane label input[type='range'] {
  flex: 1 1 auto;
  min-width: 70px;
}
/* Planeta: compact rows — one line per slider, switches in a grid, status beside the heading. */
#settings-pane-planet label {
  flex-wrap: nowrap;
  gap: 6px;
  margin: 2px 0;
  white-space: nowrap;
}
#settings-pane-planet .menu-section {
  margin-top: 6px;
}
#settings-pane-planet .planet-group {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  column-gap: 10px;
}
#settings-pane-planet .planet-group > * {
  grid-column: 1 / -1;
  margin: 2px 0;
}
#settings-pane-planet .planet-group > .menu-subtitle {
  grid-column: 1;
  grid-row: 1;
}
#settings-pane-planet .planet-group > p[role='status'] {
  grid-column: 2;
  grid-row: 1;
  opacity: 0.8;
  font-size: 0.85em;
}
#settings-pane-planet .planet-group > button {
  grid-column: 3;
  grid-row: 1;
  padding: 2px 10px;
}
/* Planeta switches read like the other tabs: box first, then its name. */
#settings-pane-planet label:has(> input[type='checkbox']) {
  flex-direction: row-reverse;
  justify-content: flex-end;
}
.settings-pane .planet-settings-config-block button {
  margin-top: 8px;
}
.settings-close {
  margin-top: 14px;
  width: 100%;
}
`
  doc.head.append(style)
  doc.body.append(toggle, win)

  planetPanel.bind(runtime)

  const selectTab = (id: TabId) => {
    for (const tab of TABS) {
      const btn = doc.getElementById(`settings-tab-${tab.id}`)
      const pane = paneEls.get(tab.id)!
      const on = tab.id === id
      btn?.setAttribute('aria-selected', on ? 'true' : 'false')
      pane.hidden = !on
    }
    planetPanel?.refresh()
  }

  const open = () => {
    win.hidden = false
    toggle.setAttribute('aria-expanded', 'true')
    // Taking focus from the canvas is enough: the runtime frees the pointer when it loses input.
    doc.getElementById('game-canvas')?.blur()
    planetPanel?.refresh()
  }
  const close = () => {
    win.hidden = true
    toggle.setAttribute('aria-expanded', 'false')
    doc.getElementById('game-canvas')?.focus()
  }
  const toggleWin = () => (win.hidden ? open() : close())

  toggle.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleWin()
  })
  closeBtn.addEventListener('click', close)
  tabBar.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest(
      'button[data-tab]',
    ) as HTMLButtonElement | null
    if (!btn?.dataset.tab) return
    selectTab(btn.dataset.tab as TabId)
  })
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !win.hidden) {
      event.preventDefault()
      close()
    }
  })

  return {
    open,
    close,
    toggle: toggleWin,
    destroy: () => {
      observer?.disconnect()
      planetPanel?.destroy()
      planetPanel = null
      toggle.remove()
      win.remove()
      style.remove()
      if (legacy) legacy.hidden = false
    },
  }
}
