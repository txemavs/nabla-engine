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
  { id: 'quality', label: 'Calidad' },
  { id: 'layers', label: 'Capas' },
  { id: 'vehicles', label: 'Vehículos' },
] as const

type TabId = (typeof TABS)[number]['id']

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

  let planetPanel: PlanetSettingsPanel | null = createPlanetSettingsPanel(doc)
  paneEls.get('planet')!.append(planetPanel.root)

  // Relocate existing menu sections into tabs (Calidad / Capas / Vehículos / leftover Planeta clock/sea).
  const qualityPane = paneEls.get('quality')!
  for (const id of ['display-quality-section', 'display-performance']) {
    const el = doc.getElementById(id)
    if (el) qualityPane.append(el)
  }
  const layersPane = paneEls.get('layers')!
  for (const id of ['terrain-position', 'terrain-layers']) {
    const el = doc.getElementById(id)
    if (el) layersPane.append(el)
  }
  const vehiclesPane = paneEls.get('vehicles')!
  const vehicles = doc.getElementById('scene-vehicles')
  if (vehicles) vehiclesPane.append(vehicles)

  // Keep time/sea groups from the legacy Planeta section under Capas as "Escena".
  const legacyPlanet = doc.getElementById('scene-planet')
  if (legacyPlanet) {
    const sceneBox = doc.createElement('fieldset')
    sceneBox.className = 'menu-section'
    sceneBox.id = 'settings-scene-extras'
    const legend = doc.createElement('legend')
    legend.textContent = 'Hora y mar'
    sceneBox.append(legend)
    while (legacyPlanet.firstChild) sceneBox.append(legacyPlanet.firstChild)
    layersPane.append(sceneBox)
    legacyPlanet.remove()
  }

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
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 14px;
}
.settings-tab {
  flex: 1 1 auto;
  min-width: 90px;
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
  margin: 8px 0;
}
.settings-pane output,
.planet-settings-config {
  color: #91cdfb;
  font-variant-numeric: tabular-nums;
}
.planet-settings-config {
  margin-top: 12px;
  padding: 10px;
  background: #0a1520;
  border: 1px solid #395e79;
  border-radius: 6px;
  font-size: 16px;
  white-space: pre-wrap;
  user-select: all;
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
      planetPanel?.destroy()
      planetPanel = null
      toggle.remove()
      win.remove()
      style.remove()
      if (legacy) legacy.hidden = false
    },
  }
}
