import { pageSearch } from './page-query.js'
import { readQualityPreset } from '@nabla/engine/runtime/quality-preset'
import { appendFsrControls } from './fsr-settings.js'
import { HEADLAMP_SHADOWS_KEY } from './startup-light-settings.js'
import { createUsbSettingsPanel } from '@nabla/engine/runtime/core'
import { settingsNavigationStyles } from './settings-navigation-styles.js'
import { createControlsSection } from './settings-controls.js'
import { createMapSection } from './settings-map.js'
import { nudgeRearLight, rearLightJson } from '../src/render/vehicle-presentation/light-tuning.js'
import {
  formatClockTime,
  localMinutes,
  shiftSkyClockKeepingRate,
  skyTime,
} from '@nabla/engine/planet/sky'
import { createWheelStepper } from './clock-wheel.js'
import { vehicleGroupSections, vehicleGroupVisibility } from './vehicle-group.js'
import { keyboardAction, menuNavigationKey } from '@nabla/engine/config/controls'
/**
 * Full-screen HTML monitor for the desktop game. Navigation remounts the existing controls;
 * their engine methods, input listeners and saved preferences remain authoritative.
 */
import { createSettingsManagement } from './settings-management.js'
import { actionCamControls, softActionCamSettings } from '../src/runtime/action-cam-settings.js'
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { weaponPoseNames, type WeaponPose } from '../src/runtime/weapon-pose-tuning.js'
import {
  sidearmTuningDefaults,
  sidearmTuningRanges,
  type SidearmTuning,
} from '../src/runtime/sidearm-tuning.js'
import {
  createPlanetSettingsPanel,
  installVehicleMonitorStyles,
  type PlanetSettingsPanel,
} from '../src/runtime/planet-settings-panel.js'
import { t } from '@nabla/engine/i18n'

export type SettingsHud = {
  open: () => void
  close: () => void
  toggle: () => void
  destroy: () => void
}

const TABS = [
  { id: 'planet', label: t('settings.world') },
  { id: 'options', label: t('settings.settings') },
  { id: 'objects', label: t('settings.objects') },
  { id: 'dev', label: t('settings.development') },
] as const

type TabId = (typeof TABS)[number]['id']

/** Sections retain their DOM, listeners and persistence; only their location changes. */
export const SECTION_TABS: ReadonlyArray<readonly [id: string, tab: TabId]> = [
  ['settings-planet-time', 'planet'],
  ['settings-map', 'planet'],
  ['terrain-position', 'planet'],
  ['terrain-layers', 'planet'],
  ['settings-layer-air', 'planet'],
  ['road-style', 'planet'],
  ['settings-planet-air', 'planet'],
  ['settings-planet-sea', 'planet'],
  ['settings-streetlights', 'planet'],
  ['settings-headlamp', 'planet'],
  ['settings-traffic-signs', 'planet'],
  ['settings-options-labels', 'planet'],
  ['display-quality-section', 'options'],
  ['settings-sharpness', 'options'],
  ['quality-shadows', 'options'],
  ['settings-distances', 'options'],
  ['display-performance', 'options'],
  ['settings-effects', 'options'],
  ['settings-muzzle-flash', 'options'],
  ['camera-extras', 'options'],
  ['settings-camera-fov', 'options'],
  ['settings-action-cam', 'options'],
  ['driving-extras', 'options'],
  ['settings-controls', 'options'],
  ['settings-usb', 'options'],
  ['settings-sound', 'options'],
  ['settings-management', 'options'],
  ['scene-vehicles', 'objects'],
  ['settings-placed-objects', 'objects'],
  ['settings-object-layout', 'objects'],
  ['settings-options-driver', 'objects'],
  ['settings-car-beams', 'objects'],
  ['settings-vehicle-sound', 'objects'],
  ['settings-truck-exhaust', 'objects'],
  ['settings-weapon', 'objects'],
  ['settings-options-sidearm', 'dev'],
  ['settings-weapon-poses', 'dev'],
  ['settings-light', 'dev'],
  ['settings-rear-light-nudge', 'dev'],
  ['settings-sign-shadows', 'dev'],
  ['settings-experimental-light-shadows', 'dev'],
  ['settings-config-planet', 'dev'],
  ['terrain-source', 'dev'],
  ['terrain-cache', 'dev'],
  ['settings-diagnostics', 'dev'],
]

/** Tab for a section id, or undefined when the HUD does not place it (the legacy Planeta). */
export function sectionTab(id: string): TabId | undefined {
  if (id === 'scene-planet') return undefined
  return SECTION_TABS.find(([section]) => section === id)?.[1] ?? 'options'
}

/** Section titles in the Ajustes window; the sections keep their ids, listeners and storage. */
const SECTION_TITLES: Readonly<Record<string, string>> = {
  'terrain-layers': t('settings.ground'),
  'road-style': t('settings.asphalt-contrast'),
  'scene-vehicles': t('settings.add'),
  'settings-car-beams': t('settings.lights'),
  'settings-rear-light-nudge': t('settings.rear-light-fine-tuning'),
  'settings-truck-exhaust': t('settings.exhaust-and-smoke'),
  'settings-vehicle-sound': t('settings.sound'),
  'settings-options-driver': t('settings.driver-and-mirrors'),
  'display-quality-section': t('settings.quality'),
  'settings-options-labels': t('settings.place-names'),
  'settings-sound': t('settings.sound'),
  'settings-planet-air': t('settings.weather'),
  'quality-shadows': t('settings.sun-shadows'),
  'camera-extras': t('settings.options'),
  'settings-management': t('settings.management'),
  'settings-camera-fov': t('settings.field-of-view'),
  'settings-weapon': t('settings.weapon-wheel'),
  'settings-options-sidearm': t('settings.aiming'),
  'settings-muzzle-flash': t('settings.muzzle-flash'),
  'settings-config-planet': t('settings.planet'),
  'terrain-source': t('settings.terrain'),
  'settings-light': t('settings.light-fine-tuning'),
  'settings-weapon-poses': t('settings.poses-and-animations'),
}

/** Shorter names for the Tierra layer switches (by `data-layer`). */
const LAYER_LABELS: Readonly<Record<string, string>> = {
  photo: t('settings.ground'),
  road: t('settings.roads'),
  buildings: t('settings.buildings'),
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
  toggle.className = 'settings-toggle nabla-btn nabla-corner nabla-corner--tr'
  toggle.title = t('settings.open-menu-wheel-1-h')
  toggle.classList.add('settings-clock')
  toggle.setAttribute('aria-label', t('settings.open-settings'))
  toggle.setAttribute('aria-expanded', 'false')
  toggle.setAttribute('aria-controls', 'settings-window')
  toggle.textContent = '12:00'

  const win = doc.createElement('div')
  win.id = 'settings-window'
  win.className = 'settings-window portal-tablet-layer'
  win.hidden = true
  win.setAttribute('role', 'dialog')
  win.setAttribute('aria-label', t('settings.settings'))

  const console = doc.createElement('div')
  console.className = 'portal-console settings-console'
  const title = doc.createElement('strong')
  title.textContent = doc.documentElement.dataset.appName ?? t('settings.nabla-settings')
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

  // Keep the shared action rail centred below the menu/time button, even when its label grows.
  const alignToolbar = () => {
    const rect = toggle.getBoundingClientRect()
    const toolbar = doc.querySelector<HTMLElement>('.game-toolbar')
    if (!toolbar || !rect.width) return
    toolbar.style.right = `${window.innerWidth - rect.right}px`
    toolbar.style.width = `${rect.width}px`
    toolbar.style.top = `${rect.bottom + 8}px`
  }
  const toolbarResize = new ResizeObserver(alignToolbar)
  toolbarResize.observe(toggle)
  window.addEventListener('resize', alignToolbar)
  const header = doc.createElement('header')
  header.className = 'settings-header'
  const closeButton = doc.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'settings-close'
  closeButton.textContent = t('settings.back-to-the-game')
  closeButton.addEventListener('click', () => close())
  header.append(title, closeButton)
  const footer = doc.createElement('footer')
  footer.className = 'settings-footer'
  const footerHint = doc.createElement('small')
  footerHint.textContent = t('settings.backups-and-restore-in-settings-to-settings')
  footer.append(footerHint)
  console.append(header, tabBar, panes, footer)
  win.append(console)

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
      const next =
        rank === -1
          ? null
          : [...pane.children].find(
              (child) => order(child.id || child.querySelector('.menu-section')?.id || '') > rank,
            )
      pane.insertBefore(el, next ?? null)
    }
    const title = SECTION_TITLES[el.id]
    const legend = el.querySelector(':scope > legend')
    if (title && legend) legend.textContent = title
    if (el.id === 'terrain-layers') {
      for (const [id, text] of Object.entries(LAYER_LABELS))
        relabel(el.querySelector(`input[data-layer="${id}"]`)?.closest('label'), text)
      moveOptionLayers(el)
      if (seaRow && !el.contains(seaRow)) el.append(seaRow)
    }
  }

  // «Nombres de poblaciones» keeps its checkbox (and the layer selector's listener and storage);
  // only its row moves to Opciones → Mapa.
  const moveOptionLayers = (layers: HTMLElement) => {
    for (const id of OPTION_LAYERS)
      relabel(
        layers.querySelector(`input[data-layer="${id}"]`)?.closest('label'),
        t('settings.place-names'),
      )
  }

  // Desarrollo: the planet config text and «Copiar config».
  const configGroup = fieldset('settings-config-planet', t('settings.planet-values'))
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
  relabel(skyRow, t('settings.stars-and-planets'))
  relabel(sunRow, t('settings.sun'))
  relabel(seaRow, t('settings.sea'))
  relabel(artisticRow, t('settings.enable-weather'))
  relabel(rowOf('ps-cloud-amount'), t('settings.cloud-cover'))
  relabel(rowOf('ps-cloud-pressure-mode'), t('settings.pressure'))
  relabel(rowOf('ps-cloud-pressure'), t('settings.pressure-value'))
  relabel(rowOf('ps-lens-flare'), t('settings.lens-flare'))

  if (timeGroup) {
    const time = fieldset('settings-planet-time', t('settings.date-and-time'))
    hideSubtitle(timeGroup)
    relabel(rowOf('time-range'), t('settings.set'))
    relabel(rowOf('time-speed'), t('settings.speed'))
    time.append(timeGroup)
    place(time)
  }
  const seaGroup = byId('scene-sea')
  const sea = fieldset('settings-planet-sea', t('settings.sea-level'))
  if (seaGroup) {
    hideSubtitle(seaGroup)
    // The panel's sea switch replaces the legacy duplicate; the tide button sits before the level.
    byId('planet-sea')?.closest('label')?.setAttribute('hidden', '')
    const tide = byId('sea-tide')
    if (tide) tide.textContent = t('settings.tides')
    const level = rowOf('sea-range')
    relabel(level, t('settings.level-m'))
    seaGroup.append(...rows(seaRow, tide, level))
    sea.append(seaGroup)
  } else sea.append(...rows(seaRow))
  place(sea)

  const air = fieldset('settings-planet-air', t('settings.air'))
  air.append(
    ...rows(
      artisticRow,
      subtitle(t('settings.sky')),
      rowOf('ps-cloud-amount'),
      rowOf('ps-cloud-pressure-mode'),
      rowOf('ps-cloud-pressure'),
    ),
  )
  place(air)

  const sky = fieldset('settings-layer-air', t('settings.air'))
  sky.append(...rows(sunRow, skyRow, cloudsRow, rowOf('ps-lens-flare')))
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
  if (quality && typeof runtime.setFsr === 'function') appendFsrControls(quality, runtime)
  const performanceGroup = byId('display-performance')
  if (quality && performanceGroup) {
    const tail = [...quality.children].filter((el) => el.matches('button, p'))
    quality.append(
      ...[...performanceGroup.children].filter((el) => el.tagName !== 'LEGEND'),
      ...tail,
    )
    performanceGroup.hidden = true
  }

  if (quality && runtime.fieldLightLimit !== undefined) {
    const lightProfile = readQualityPreset()
    const storageKey = `nabla.field-light-limit-v2:${lightProfile}`
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved !== null && saved.trim() !== '') runtime.setFieldLightLimit(Number(saved))
    } catch {
      /* Storage is optional. */
    }
    const label = doc.createElement('label')
    label.textContent = t('settings.nearby-lit-street-lamps') + ' '
    const input = doc.createElement('input')
    input.id = 'field-light-limit'
    input.type = 'range'
    input.min = '0'
    input.max = '24'
    input.step = '1'
    input.value = String(runtime.fieldLightLimit)
    input.setAttribute('aria-label', t('settings.nearby-lit-street-lamps'))
    const value = doc.createElement('output')
    value.textContent = input.value
    const apply = doc.createElement('button')
    apply.type = 'button'
    apply.textContent = t('settings.apply-street-lamps')
    apply.disabled = true
    const warning = doc.createElement('p')
    warning.textContent = t('settings.applying-changes-the-number-of-lights-and-recomp')
    input.addEventListener('input', () => {
      value.textContent = input.value
      apply.disabled = Number(input.value) === runtime.fieldLightLimit
    })
    apply.addEventListener('click', async () => {
      const requested = Number(input.value)
      apply.disabled = true
      input.disabled = true
      apply.textContent = t('settings.applying')
      // Paint the warning/status before the next render compiles the new light layout.
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
      try {
        runtime.setFieldLightLimit(requested)
        value.textContent = input.value = String(runtime.fieldLightLimit)
        try {
          localStorage.setItem(storageKey, value.textContent)
        } catch {
          /* Optional storage. */
        }
      } finally {
        input.disabled = false
        apply.textContent = t('settings.apply-street-lamps')
        apply.disabled = Number(input.value) === runtime.fieldLightLimit
      }
    })
    label.append(input, value)
    const lamps = fieldset('settings-streetlights', t('settings.street-lamps'))
    lamps.append(label, warning, apply)
    place(lamps)
    // Experimental opt-in for this session only; never restore an expensive saved setting.
    runtime.setFieldLightShadows(false)
    try {
      localStorage.removeItem('nabla.field-light-shadows')
    } catch {
      /* optional storage */
    }
    const shadows = doc.createElement('input')
    shadows.type = 'checkbox'
    shadows.id = 'field-light-shadows'
    shadows.checked = runtime.fieldLightShadows
    shadows.addEventListener('change', () => runtime.setFieldLightShadows(shadows.checked))
    const shadowLabel = doc.createElement('label')
    shadowLabel.append(shadows, ' ' + t('settings.street-lamp-shadows-experimental'))
    shadowLabel.title = t('settings.requires-general-shadows-to-be-on-only-nearby-st')
    const experimental = fieldset(
      'settings-experimental-light-shadows',
      t('settings.street-lamp-shadows-experimental'),
    )
    experimental.append(shadowLabel)
    place(experimental)
  }

  let refreshVehicleLights = () => {}
  {
    const section = fieldset('settings-car-beams', t('settings.vehicle-lights'))
    const status = doc.createElement('p')
    section.append(status)
    const controls = new Map<string, HTMLInputElement>()
    const spec = [
      ['low', t('settings.low-beam-cutoff'), -5, 5, 0.01],
      ['high', t('settings.high-beam-cutoff'), -5, 5, 0.01],
      ['frontX', t('settings.headlights-right-left-m'), -2, 2, 0.01],
      ['frontY', t('settings.headlights-up-down-m'), -2, 2, 0.01],
      ['frontZ', t('settings.headlights-back-front-m'), -2, 2, 0.01],
      ['rearX', t('settings.rear-light-right-left-m'), -2, 2, 0.01],
      ['rearY', t('settings.rear-light-up-down-m'), -2, 2, 0.01],
      ['rearZ', t('settings.rear-light-back-front-m'), -2, 2, 0.01],
      ['rearIntensity', t('settings.rear-light-intensity'), 0, 3, 0.05],
      ['rearReach', t('settings.rear-light-range'), 0, 3, 0.05],
    ] as const
    for (const [key, title, min, max, step] of spec) {
      const label = doc.createElement('label'),
        input = doc.createElement('input')
      input.type = 'range'
      input.min = String(min)
      input.max = String(max)
      input.step = String(step)
      input.setAttribute('aria-label', title)
      const output = doc.createElement('output')
      input.addEventListener('input', () => {
        runtime.setVehicleLightAdjustment({ [key]: Number(input.value) })
        output.textContent = Number(input.value).toFixed(2)
        refreshVehicleLights()
      })
      controls.set(key, input)
      label.dataset.lampGroup = key.startsWith('rear') ? 'rear' : 'front'
      label.append(title, input, output)
      section.append(label)
    }
    const reset = doc.createElement('button'),
      share = doc.createElement('button')
    reset.type = share.type = 'button'
    reset.textContent = t('settings.reset-lights')
    share.textContent = t('settings.share-light-settings')
    const exported = doc.createElement('textarea')
    exported.readOnly = true
    exported.hidden = true
    exported.setAttribute('aria-label', t('settings.light-settings-to-share'))
    share.addEventListener('click', async () => {
      const current = runtime.vehicleLightAdjustment
      if (!current) return
      const text = JSON.stringify(
        {
          schema: 'nabla.vehicle-lights/1',
          model: current.model,
          name: current.name,
          values: current.values,
          units: { position: 'metres', cutoff: 'degrees' },
        },
        null,
        2,
      )
      exported.value = text
      exported.hidden = false
      try {
        await navigator.clipboard.writeText(text)
        share.textContent = t('settings.settings-copied')
      } catch {
        exported.focus()
        exported.select()
      }
    })
    let previous = ''
    refreshVehicleLights = () => {
      const current = runtime.vehicleLightAdjustment
      const signature = JSON.stringify(current)
      if (signature === previous) return
      previous = signature
      status.textContent = current
        ? current.name + ' ' + t('settings.settings-saved-for-this-model')
        : t('settings.get-into-a-vehicle-to-adjust-its-lights')
      // Only the lamps the occupied vehicle actually has are listed.
      const lamps = current?.lamps ?? { front: true, rear: true }
      for (const [key, input] of controls) {
        input.disabled = !current
        const group = input.parentElement!.dataset.lampGroup === 'rear' ? 'rear' : 'front'
        input.parentElement!.hidden = !lamps[group]
        if (current) {
          input.value = String(current.values[key as keyof typeof current.values])
          input.nextElementSibling!.textContent = Number(input.value).toFixed(2)
        }
      }
      reset.disabled = share.disabled = !current
      exported.hidden = true
      share.textContent = t('settings.share-light-settings')
    }
    reset.addEventListener('click', () => {
      runtime.setVehicleLightAdjustment()
      previous = ''
      refreshVehicleLights()
    })
    const note = doc.createElement('p')
    note.textContent = t('settings.adjusts-the-light-positions-not-the-lamp-geometr')
    section.append(reset, share, exported, note)
    refreshVehicleLights()
    place(section)
  }

  // Cámara → field of view: the same offset as the J menu (`nabla.cameraFov`).
  let refreshCameraFov = () => {}
  if (typeof runtime.setCameraFovOffset === 'function') {
    const section = fieldset('settings-camera-fov', t('settings.field-of-view'))
    const label = doc.createElement('label'),
      slider = doc.createElement('input'),
      value = doc.createElement('output')
    slider.type = 'range'
    const range = runtime.cameraFovRange
    slider.min = String(range.min)
    slider.max = String(range.max)
    slider.step = '1'
    slider.setAttribute('aria-label', t('settings.field-of-view-2'))
    slider.addEventListener('input', () => {
      const offset = runtime.setCameraFovOffset(Number(slider.value))
      value.textContent = `${offset > 0 ? '+' : ''}${offset}°`
    })
    label.append(t('settings.field-of-view') + ' ', slider, value)
    section.append(label)
    refreshCameraFov = () => {
      if (doc.activeElement === slider) return
      const offset = runtime.cameraFovOffset ?? 0
      slider.value = String(offset)
      value.textContent = `${offset > 0 ? '+' : ''}${offset}°`
    }
    refreshCameraFov()
    place(section)
  }

  // Objetos → Arma: put the aiming weapon wheel (moved with the mouse wheel) back to default.
  if (typeof runtime.resetWeaponWheel === 'function') {
    const section = fieldset('settings-weapon', t('settings.weapon-wheel'))
    const note = doc.createElement('p')
    note.textContent = t('settings.the-mouse-wheel-moves-the-weapon-while-aiming-th')
    const reset = doc.createElement('button')
    reset.type = 'button'
    reset.textContent = t('settings.reset-weapon-wheel')
    reset.addEventListener('click', () => runtime.resetWeaponWheel())
    section.append(note, reset)
    place(section)
  }

  // The occupied vehicle's own sounds: its engine volume (the same mix as Configuración → Sonido)
  // and the reversing alarm, for vehicles that have one.
  let refreshVehicleSound = () => {}
  {
    const section = fieldset('settings-vehicle-sound', t('settings.vehicle-sound'))
    const status = doc.createElement('p')
    const engineLabel = doc.createElement('label'),
      engine = doc.createElement('input'),
      engineValue = doc.createElement('output')
    engine.type = 'range'
    engine.min = '0'
    engine.max = '100'
    engine.step = '1'
    engine.setAttribute('aria-label', t('settings.engine-volume'))
    engine.addEventListener('input', () => {
      const mix = runtime.setAudioMix({ engine: Number(engine.value) / 100 })
      engineValue.textContent = `${Math.round(mix.engine * 100)}%`
    })
    engineLabel.append(t('settings.engine') + ' ', engine, engineValue)
    const alarmLabel = doc.createElement('label'),
      alarm = doc.createElement('input')
    alarm.type = 'checkbox'
    alarm.setAttribute('aria-label', t('settings.reversing-beeper'))
    alarm.addEventListener('change', () => runtime.setReverseAlarmEnabled(alarm.checked))
    alarmLabel.append(alarm, ' ' + t('settings.reversing-beeper'))
    section.append(status, engineLabel, alarmLabel)
    refreshVehicleSound = () => {
      const occupied = runtime.occupiedVehicle ?? null
      const show = vehicleGroupVisibility(occupied)
      status.textContent = occupied
        ? occupied.name + ' ' + t('settings.engine-volume-is-the-one-in-settings-to-sound')
        : t('settings.get-into-a-vehicle-to-adjust-its-sound')
      engine.disabled = !occupied
      alarm.disabled = !occupied
      alarmLabel.hidden = !show.reverseAlarm
      // Follow the mix without fighting a slider being dragged.
      if (doc.activeElement !== engine) {
        engine.value = String(Math.round((runtime.audioMix?.engine ?? 1) * 100))
        engineValue.textContent = `${engine.value}%`
      }
      alarm.checked = runtime.reverseAlarmEnabled !== false
    }
    refreshVehicleSound()
    place(section)
  }

  // Development: nudge where the tail lamp's light lands in small steps, then copy the JSON.
  let refreshRearNudge = () => {}
  {
    const section = fieldset('settings-rear-light-nudge', t('settings.rear-light-fine-tuning'))
    const status = doc.createElement('p')
    section.append(status)
    const rows = [
      ['rearX', t('settings.right-left-m'), 0.01, 0.05],
      ['rearY', t('settings.up-down-m'), 0.01, 0.05],
      ['rearZ', t('settings.back-front-m'), 0.01, 0.05],
      ['rearIntensity', t('settings.intensity'), 0.05, 0.25],
      ['rearReach', t('settings.range'), 0.05, 0.25],
    ] as const
    const outputs = new Map<string, HTMLOutputElement>()
    const buttons: HTMLButtonElement[] = []
    for (const [key, title, small, large] of rows) {
      const row = doc.createElement('div')
      row.className = 'settings-nudge-row'
      const name = doc.createElement('span')
      name.textContent = title
      const output = doc.createElement('output')
      outputs.set(key, output)
      row.append(name)
      const steps = [-large, -small, small, large]
      const make = (delta: number) => {
        const button = doc.createElement('button')
        button.type = 'button'
        button.textContent = (delta > 0 ? '+' : '−') + Math.abs(delta)
        button.setAttribute('aria-label', `${title} ${delta > 0 ? '+' : '−'}${Math.abs(delta)}`)
        button.addEventListener('click', () => {
          const current = runtime.vehicleLightAdjustment
          if (!current) return
          runtime.setVehicleLightAdjustment(nudgeRearLight(current.values, key, delta))
          refreshVehicleLights()
          refreshRearNudge()
        })
        buttons.push(button)
        return button
      }
      row.append(make(steps[0]), make(steps[1]), output, make(steps[2]), make(steps[3]))
      section.append(row)
    }
    const copy = doc.createElement('button'),
      reset = doc.createElement('button')
    copy.type = reset.type = 'button'
    copy.textContent = t('settings.copy-json')
    reset.textContent = t('settings.reset')
    const exported = doc.createElement('textarea')
    exported.readOnly = true
    exported.hidden = true
    exported.setAttribute('aria-label', t('settings.rear-light-json'))
    copy.addEventListener('click', async () => {
      const current = runtime.vehicleLightAdjustment
      if (!current) return
      const text = rearLightJson(current.values)
      exported.value = text
      exported.hidden = false
      try {
        await navigator.clipboard.writeText(text)
        copy.textContent = t('settings.json-copied')
      } catch {
        exported.focus()
        exported.select()
      }
    })
    reset.addEventListener('click', () => {
      runtime.setVehicleLightAdjustment()
      refreshVehicleLights()
      refreshRearNudge()
    })
    let previous = ''
    refreshRearNudge = () => {
      const current = runtime.vehicleLightAdjustment
      const signature = JSON.stringify(current)
      if (signature === previous) return
      previous = signature
      const usable = !!current?.lamps.rear
      status.textContent = usable
        ? current!.name + ' ' + t('settings.paste-the-json-into-the-vehicle-s-vehicle-lights')
        : t('settings.get-into-a-vehicle-with-a-rear-light-to-adjust-i')
      for (const button of [...buttons, copy, reset]) button.disabled = !usable
      for (const [key, output] of outputs)
        output.textContent = current
          ? current.values[key as keyof typeof current.values].toFixed(3)
          : '–'
      exported.hidden = true
      copy.textContent = t('settings.copy-json')
    }
    section.append(copy, reset, exported)
    refreshRearNudge()
    place(section)
  }

  if (doc.documentElement.dataset.irunSigns === 'true') {
    const physicsSection = fieldset('settings-sign-physics', t('settings.signage-physics'))
    const physicsInput = doc.createElement('input')
    physicsInput.type = 'checkbox'
    physicsInput.checked = runtime.sceneryPhysics.enabled
    physicsInput.addEventListener('change', () => {
      runtime.sceneryPhysics.setEnabled(physicsInput.checked)
      window.dispatchEvent(new Event('euskadi-sign-physics'))
    })
    const physicsLabel = doc.createElement('label')
    physicsLabel.append(t('settings.signage-collisions-and-impacts'), physicsInput)
    const physicsNote = doc.createElement('p')
    physicsNote.textContent = t('settings.enables-knock-down-signs-bullet-marks-and-solid')
    physicsSection.append(physicsLabel, physicsNote)
    const experimental = fieldset('settings-sign-shadows', t('settings.sign-shadows'))
    const shadows = doc.createElement('input')
    shadows.type = 'checkbox'
    shadows.checked = doc.documentElement.dataset.irunSignShadows === 'true'
    shadows.addEventListener('change', () => {
      doc.documentElement.dataset.irunSignShadows = String(shadows.checked)
      window.dispatchEvent(new Event('euskadi-sign-shadows'))
    })
    const shadowLabel = doc.createElement('label')
    shadowLabel.append(t('settings.enable-sign-and-pole-shadows'), shadows)
    const warning = doc.createElement('p')
    warning.textContent = t('settings.experimental-raises-rendering-cost-the-first-act')
    experimental.append(shadowLabel, warning)
    place(experimental)
    const section = fieldset('settings-traffic-signs', t('settings.traffic-signs'))
    const key = 'euskadi.irun-signs'
    let saved: Record<string, unknown> = {}
    try {
      saved = JSON.parse(localStorage.getItem(key) ?? '{}') ?? {}
    } catch {
      /* Optional storage. */
    }
    const enabled = doc.createElement('input')
    enabled.type = 'checkbox'
    enabled.checked = saved.enabled !== false
    const enabledLabel = doc.createElement('label')
    enabledLabel.append(t('settings.enable-traffic-signs'), enabled)
    section.append(enabledLabel)
    const number = (
      title: string,
      value: unknown,
      fallback: number,
      min: number,
      max: number,
      parent: HTMLElement = section,
    ) => {
      const input = doc.createElement('input')
      input.type = 'number'
      input.min = String(min)
      input.max = String(max)
      input.step = '1'
      input.value = String(
        typeof value === 'number' && Number.isFinite(value)
          ? Math.max(min, Math.min(max, Math.round(value)))
          : fallback,
      )
      const label = doc.createElement('label')
      const slider = doc.createElement('input')
      slider.type = 'range'
      slider.min = input.min
      slider.max = input.max
      slider.step = input.step
      slider.value = input.value
      slider.setAttribute('aria-label', title)
      input.setAttribute('aria-label', title + ' valor')
      input.style.width = '90px'
      slider.addEventListener('input', () => {
        input.value = slider.value
        input.dispatchEvent(new Event('change'))
      })
      input.addEventListener('change', () => {
        const value = input.valueAsNumber
        input.value = String(
          Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback,
        )
        slider.value = input.value
      })
      label.append(title, slider, input)
      parent.append(label)
      return input
    }
    const limit = number(t('settings.maximum-count'), saved.limit, 50, 1, 500)
    const radius = number(t('settings.distance-around-the-player-m'), saved.radius, 150, 25, 500)
    const physicsRadius = number(
      t('settings.physics-distance-m'),
      saved.physicsRadius,
      30,
      5,
      150,
      physicsSection,
    )
    runtime.sceneryPhysics.setRadius(Number(physicsRadius.value))
    const apply = () => {
      for (const input of [limit, radius, physicsRadius]) {
        const value = input.valueAsNumber
        input.value = String(
          Number.isFinite(value)
            ? Math.max(Number(input.min), Math.min(Number(input.max), Math.round(value)))
            : 100,
        )
      }
      const settings = {
        enabled: enabled.checked,
        limit: Number(limit.value),
        radius: Number(radius.value),
        physicsRadius: Number(physicsRadius.value),
      }
      runtime.sceneryPhysics.setRadius(Number(physicsRadius.value))
      try {
        localStorage.setItem(key, JSON.stringify(settings))
      } catch {
        /* Optional storage. */
      }
      window.dispatchEvent(new CustomEvent('euskadi-sign-settings', { detail: settings }))
    }
    for (const input of [enabled, limit, radius, physicsRadius])
      input.addEventListener('change', apply)
    section.append(physicsSection)
    place(section)
  }

  if (quality) {
    const label = doc.createElement('label')
    const input = doc.createElement('input')
    input.type = 'checkbox'
    input.id = 'headlamp-shadows'
    const key = HEADLAMP_SHADOWS_KEY
    // Startup restored this before warming shaders; mounting UI must not change it.
    input.checked = runtime.headlampShadows
    input.addEventListener('change', () => {
      runtime.setHeadlampShadows(input.checked)
      try {
        localStorage.setItem(key, String(input.checked))
      } catch {
        /* optional storage */
      }
    })
    label.append(input, ' ' + t('settings.flashlight-shadows'))
    const headlamp = fieldset('settings-headlamp', t('settings.flashlight'))
    headlamp.append(label)
    place(headlamp)
  }

  let cameraOptions = byId('camera-extras')
  if (!cameraOptions) {
    cameraOptions = fieldset('camera-extras', t('settings.camera'))
    place(cameraOptions)
  }
  {
    const label = doc.createElement('label')
    const input = doc.createElement('select')
    input.id = 'camera-first-person-mode'
    for (const [value, text] of [
      ['normal', t('settings.normal')],
      ['pointer', t('settings.pointer-mode')],
    ]) {
      const option = doc.createElement('option')
      option.value = value
      option.textContent = text
      input.append(option)
    }
    input.value = runtime.bodycamEnabled ? 'normal' : 'pointer'
    input.addEventListener('change', () => runtime.setBodycamEnabled(input.value === 'normal'))
    label.append(t('settings.first-person') + ' ', input)
    cameraOptions.append(label)
  }

  if (typeof runtime.actionCamEnabled === 'boolean') {
    const label = doc.createElement('label'),
      input = doc.createElement('input')
    input.type = 'checkbox'
    input.id = 'camera-action-cam'
    input.checked = runtime.actionCamEnabled
    input.addEventListener('change', () => runtime.setActionCamEnabled(input.checked))
    label.append(input, ' ' + t('settings.action-cam-steps-and-tilt-while-walking'))
    cameraOptions.append(label)
  }
  if (runtime.actionCamSettings && typeof runtime.setActionCamSettings === 'function') {
    const tuning = doc.createElement('details'),
      title = doc.createElement('summary')
    tuning.id = 'camera-action-cam-settings'
    title.textContent = t('settings.tune-action-cam')
    tuning.append(title)
    const note = doc.createElement('p')
    note.textContent = t('settings.live-changes-saved-in-this-browser-a-longer-cycl')
    tuning.append(note)
    const groups = new Map<string, HTMLDetailsElement>(),
      refresh: Array<() => void> = []
    for (const control of actionCamControls) {
      let group = groups.get(control.group)
      if (!group) {
        group = doc.createElement('details')
        const summary = doc.createElement('summary')
        summary.textContent = control.group
        group.open = groups.size === 0
        group.append(summary)
        groups.set(control.group, group)
        tuning.append(group)
      }
      const row = doc.createElement('label'),
        slider = doc.createElement('input'),
        value = doc.createElement('output')
      slider.type = 'range'
      slider.id = `action-cam-${control.key}`
      slider.min = String(control.min)
      slider.max = String(control.max)
      slider.step = String(control.step)
      const sync = () => {
        const amount = runtime.actionCamSettings[control.key] * control.scale
        slider.value = String(amount)
        value.textContent = `${amount.toFixed(control.step < 0.01 ? 3 : 2)} ${control.unit}`
      }
      slider.addEventListener('input', () => {
        runtime.setActionCamSettings({ [control.key]: slider.valueAsNumber / control.scale })
        sync()
      })
      row.append(control.label, slider, value)
      group.append(row)
      refresh.push(sync)
      sync()
    }
    const soft = doc.createElement('button'),
      reset = doc.createElement('button')
    soft.type = reset.type = 'button'
    soft.id = 'action-cam-soft'
    reset.id = 'action-cam-reset'
    soft.textContent = t('settings.apply-smoothly')
    reset.textContent = t('settings.reset-action-cam')
    soft.addEventListener('click', () => {
      runtime.setActionCamSettings(softActionCamSettings)
      refresh.forEach((sync) => sync())
    })
    reset.addEventListener('click', () => {
      runtime.resetActionCamSettings()
      refresh.forEach((sync) => sync())
    })
    tuning.append(soft, reset)
    cameraOptions.append(tuning)
  }
  if (typeof runtime.tunnelEnabled === 'boolean') {
    const label = doc.createElement('label')
    const input = doc.createElement('input')
    input.type = 'checkbox'
    input.id = 'quality-tunnel'
    input.checked = runtime.tunnelEnabled
    input.addEventListener('change', () => runtime.setTunnelEnabled(input.checked))
    label.append(input, ' ' + t('settings.tunnel-effect-when-aiming'))
    cameraOptions.append(label)
  }

  // Quality preference applies immediately to both exhaust and gun smoke.
  if (quality && typeof runtime.smokeEnabled === 'boolean') {
    const label = doc.createElement('label'),
      input = doc.createElement('input')
    input.type = 'checkbox'
    input.id = 'quality-smoke'
    input.checked = runtime.smokeEnabled
    label.append(input, ' ' + t('settings.smoke-exhausts-and-shots'))
    input.addEventListener('change', () => runtime.setSmokeEnabled(input.checked))
    const amount = doc.createElement('input'),
      value = doc.createElement('output')
    amount.type = 'range'
    amount.min = '0'
    amount.max = '300'
    amount.step = '1'
    amount.value = String(runtime.smokePercent)
    amount.setAttribute('aria-label', t('settings.smoke-amount'))
    value.textContent = amount.value + ' %'
    amount.addEventListener('input', () => {
      runtime.setSmokePercent(amount.valueAsNumber)
      value.textContent = amount.value + ' %'
    })
    label.append(amount, value)
    quality.insertBefore(label, quality.querySelector('button'))
  }

  // Opciones → Volante y espejos: the driver's steering wheel and mirror glass adjustments.
  const driverGroups = rows(
    byId('scene-driver-pose'),
    byId('scene-steering-wheel'),
    byId('scene-mirrors'),
  )
  if (driverGroups.length) {
    const driver = fieldset('settings-options-driver', t('settings.vehicle-driver-and-mirrors'))
    driver.append(...driverGroups)
    place(driver)
  }

  {
    const group = fieldset('settings-muzzle-flash', t('settings.pistol-muzzle-flash'))
    const note = doc.createElement('p')
    note.textContent = t('settings.offset-from-the-original-position-in-millimetres')
    group.append(note)
    const controls = new Map<string, [HTMLInputElement, HTMLInputElement]>()
    const refresh = () => {
      const values = runtime.muzzleFlashTuning
      for (const [key, inputs] of controls)
        for (const input of inputs) input.value = String(values[key as keyof typeof values])
    }
    for (const [key, text] of [
      ['x', t('settings.left-right-mm')],
      ['y', t('settings.down-up-mm')],
      ['z', t('settings.forward-back-mm')],
      ['intensity', t('settings.intensity-2')],
    ] as const) {
      const row = doc.createElement('label'),
        slider = doc.createElement('input'),
        number = doc.createElement('input')
      slider.type = 'range'
      number.type = 'number'
      slider.id = `muzzle-flash-${key}`
      number.id = `muzzle-flash-${key}-value`
      for (const input of [slider, number]) {
        input.min = key === 'intensity' ? '0' : '-200'
        input.max = key === 'intensity' ? '300' : '200'
        input.step = key === 'intensity' ? '1' : '0.1'
        input.setAttribute('aria-label', text + (input === number ? ' valor' : ''))
        input.addEventListener('input', () => {
          if (!Number.isFinite(input.valueAsNumber)) return
          runtime.setMuzzleFlashTuning({ [key]: input.valueAsNumber })
          refresh()
        })
      }
      number.style.width = '75px'
      row.append(text + ' ', slider, number)
      group.append(row)
      controls.set(key, [slider, number])
    }
    const preview = doc.createElement('button'),
      reset = doc.createElement('button')
    preview.type = reset.type = 'button'
    preview.textContent = t('settings.test-muzzle-flash-1-s')
    preview.onclick = () => runtime.previewMuzzleFlash()
    reset.textContent = t('settings.reset-muzzle-flash')
    reset.onclick = () => {
      runtime.setMuzzleFlashTuning({ x: 0, y: 0, z: -72, intensity: 100 })
      refresh()
    }
    group.append(preview, reset)
    refresh()
    place(group)
  }

  // Live aimed-pistol adjustments remain visible with the mouse free over the sliders.
  let refreshSidearm = () => {}
  if (runtime.sidearmTuning && runtime.setSidearmTuning) {
    const group = fieldset('settings-options-sidearm', t('settings.pistol-aiming'))
    const controls = new Map<
      keyof SidearmTuning,
      { input: HTMLInputElement; output: HTMLOutputElement }
    >()
    for (const [key, title] of [
      ['height', t('settings.height-when-aiming')],
      ['angle', t('settings.angle-when-aiming')],
    ] as const) {
      const row = doc.createElement('label'),
        input = doc.createElement('input'),
        output = doc.createElement('output')
      input.type = 'range'
      input.id = `sidearm-aim-${key}`
      input.setAttribute('aria-label', title)
      const multiplier = key === 'height' ? 1000 : 1
      const [min, max, step] = sidearmTuningRanges[key]
      input.min = String((min - sidearmTuningDefaults[key]) * multiplier)
      input.max = String((max - sidearmTuningDefaults[key]) * multiplier)
      input.step = String(step * multiplier)
      output.htmlFor = input.id
      row.append(title + ' ', input, ' ', output)
      group.append(row)
      controls.set(key, { input, output })
      input.addEventListener('input', () => {
        runtime.setSidearmTuning({
          [key]: sidearmTuningDefaults[key] + Number(input.value) / multiplier,
        })
        runtime.setSidearmAimPreview(true)
        refreshSidearm()
      })
    }
    refreshSidearm = () => {
      const tuning = runtime.sidearmTuning
      for (const [key, { input, output }] of controls) {
        const value = (tuning[key] - sidearmTuningDefaults[key]) * (key === 'height' ? 1000 : 1)
        input.value = String(value)
        output.value = key === 'height' ? `${value.toFixed(2)} mm` : `${value.toFixed(2)}°`
        input.setAttribute('aria-valuetext', output.value)
      }
    }
    const reset = doc.createElement('button')
    reset.type = 'button'
    reset.textContent = t('settings.reset-pistol')
    reset.addEventListener('click', () => {
      runtime.setSidearmTuning(sidearmTuningDefaults)
      runtime.setSidearmAimPreview(true)
      refreshSidearm()
    })
    group.append(reset)
    refreshSidearm()
    place(group)
  }

  {
    const group = fieldset('settings-weapon-poses', t('settings.weapon-pose-position-and-angles'))
    const note = doc.createElement('p')
    note.textContent = t('settings.rotations-in-degrees-and-position-in-millimetres')
    const target = doc.createElement('p')
    target.style.fontWeight = 'bold'
    const select = doc.createElement('select')
    select.setAttribute('aria-label', t('settings.weapon-pose'))
    for (const [value, text] of Object.entries(weaponPoseNames)) {
      const option = doc.createElement('option')
      option.value = value
      option.textContent = text
      select.append(option)
    }
    const controls: Array<{
      axis: 'pitch' | 'yaw' | 'roll' | 'x' | 'y' | 'z'
      range: HTMLInputElement
      number: HTMLInputElement
    }> = []
    const refresh = () => {
      const weapon = runtime.weaponPoseTarget
      target.textContent = `Editando: ${weapon.name}${weapon.rig ? ` · ${weapon.rig}` : ''} (elige el arma con su tecla 1-5)`
      const values = runtime.weaponPoseTuning[select.value as WeaponPose]
      for (const { axis, range, number } of controls)
        range.value = number.value = String(values[axis])
    }
    group.append(note, target, select)
    group.addEventListener('pointerenter', () => refresh())
    for (const [axis, title] of [
      ['pitch', t('settings.up-down')],
      ['yaw', t('settings.left-right')],
      ['roll', t('settings.side-tilt')],
      ['x', t('settings.side-position')],
      ['y', t('settings.height')],
      ['z', t('settings.closer-farther')],
    ] as const) {
      const row = doc.createElement('label'),
        range = doc.createElement('input'),
        number = doc.createElement('input')
      const position = ['x', 'y', 'z'].includes(axis)
      row.textContent = title + (position ? ' (mm) ' : ' (°) ')
      range.type = 'range'
      number.type = 'number'
      for (const input of [range, number]) {
        input.min = position ? '-500' : '-180'
        input.max = position ? '500' : '180'
        input.step = '0.1'
        input.setAttribute('aria-label', `${title}${input === number ? ' valor' : ''}`)
        input.addEventListener('input', () => {
          if (!Number.isFinite(input.valueAsNumber)) return
          const values = runtime.weaponPoseTuning
          values[select.value as WeaponPose][axis] = input.valueAsNumber
          runtime.setWeaponPoseTuning(values)
          runtime.previewWeaponPose(select.value as WeaponPose)
          refresh()
        })
      }
      number.style.width = '75px'
      row.append(range, number)
      group.append(row)
      controls.push({ axis, range, number })
    }
    select.addEventListener('change', () => {
      refresh()
      runtime.previewWeaponPose(select.value as WeaponPose)
    })
    const preview = doc.createElement('button'),
      stop = doc.createElement('button'),
      reset = doc.createElement('button'),
      copy = doc.createElement('button')
    for (const button of [preview, stop, reset, copy]) button.type = 'button'
    preview.textContent = t('settings.view-pose')
    stop.textContent = t('settings.back-to-the-game')
    reset.textContent = t('settings.reset-this-pose')
    copy.textContent = t('settings.copy-all-settings')
    preview.onclick = () => runtime.previewWeaponPose(select.value as WeaponPose)
    stop.onclick = () => runtime.previewWeaponPose(null)
    reset.onclick = () => {
      const values = runtime.weaponPoseTuning
      values[select.value as WeaponPose] = runtime.weaponPoseDefaults[select.value as WeaponPose]
      runtime.setWeaponPoseTuning(values)
      refresh()
      runtime.previewWeaponPose(select.value as WeaponPose)
    }
    const status = doc.createElement('p'),
      exportText = doc.createElement('textarea')
    status.setAttribute('role', 'status')
    exportText.readOnly = true
    exportText.hidden = true
    exportText.setAttribute('aria-label', t('settings.all-weapon-settings-to-copy'))
    exportText.style.width = '100%'
    exportText.rows = 12
    copy.onclick = async () => {
      const weapon = runtime.weaponPoseTarget
      const text = JSON.stringify(
        {
          version: 2,
          weapon: weapon.id,
          rig: weapon.rig,
          hint: t('settings.paste-poses-into-the-rig-json-as-a-top-level-pos'),
          positionUnits: 'millimeters',
          units: 'degrees',
          angles: 'offsets from reviewed poses',
          aim: runtime.sidearmTuning,
          poses: runtime.weaponPoseTuning,
        },
        null,
        2,
      )
      exportText.value = text
      exportText.hidden = false
      try {
        await navigator.clipboard.writeText(text)
        status.textContent = t('settings.copied-all-poses-and-the-aiming-setting')
      } catch {
        exportText.focus()
        exportText.select()
        status.textContent = t('settings.selected-press-ctrl-c-to-copy-all-settings')
      }
    }
    group.append(preview, stop, reset, copy, status, exportText)
    refresh()
    place(group)
  }

  const vehicleList = byId('vehicle-list')
  if (vehicleList) {
    const placed = fieldset('settings-placed-objects', t('settings.in-the-world'))
    placed.append(vehicleList)
    place(placed)
  }
  const exportButton = byId('vehicle-export')
  if (exportButton) {
    const distribution = fieldset('settings-object-layout', t('settings.save-layout'))
    distribution.append(exportButton, ...rows(byId('vehicle-export-text')))
    place(distribution)
  }

  const management = createSettingsManagement(doc, {
    local: () => localStorage,
    session: () => sessionStorage,
    search: () => pageSearch(),
    reload: (search) => {
      const url = new URL(location.href)
      url.search = search
      history.replaceState(history.state, '', url)
      runtime.pause?.()
      location.reload()
    },
  })
  place(management)
  const controlsSection = createControlsSection(doc)
  place(controlsSection)
  const usbPanel = createUsbSettingsPanel(runtime.usbControllers, runtime.usbFeedback, doc)
  place(usbPanel.root)
  const mapSection = createMapSection(doc, runtime)
  place(mapSection.root)
  const actionCam = byId('camera-action-cam-settings')
  if (actionCam) {
    const section = fieldset('settings-action-cam', t('settings.action-cam'))
    ;(actionCam as HTMLDetailsElement).open = true
    actionCam.querySelector('summary')?.setAttribute('hidden', '')
    section.append(actionCam)
    place(section)
  }
  const effects = fieldset('settings-effects', t('settings.effects'))
  for (const id of ['quality-smoke']) {
    const row = rowOf(id)
    if (row) effects.append(row)
  }
  if (effects.querySelector('input')) place(effects)

  // The legacy Planeta section (scene-controls) duplicates the sky / sun / clouds toggles the
  // planet panel already has; its Hora and Mar groups moved above. Keep it in the DOM (it holds
  // the listeners) but hidden.
  const diagnostics = fieldset('settings-diagnostics', t('settings.diagnostics'))
  for (const id of ['terrain-missing-show', 'terrain-missing-retry', 'terrain-missing-list']) {
    const control = byId(id)
    if (control) diagnostics.append(control)
  }
  if (diagnostics.children.length > 1) place(diagnostics)

  const legacyPlanet = byId('scene-planet')
  if (legacyPlanet) {
    for (const id of ['scene-sky', 'scene-sun', 'scene-clouds']) {
      const el = byId(id)
      if (el) el.hidden = true
    }
    legacyPlanet.hidden = true
    paneEls.get('planet')!.append(legacyPlanet)
  }

  const sharpness = fieldset('settings-sharpness', t('settings.sharpness'))
  for (const id of ['display-scale', 'display-scale-auto']) {
    const row = rowOf(id)
    if (row) {
      relabel(
        row,
        id === 'display-scale' ? t('settings.sharpness') : t('settings.automatic-sharpness'),
      )
      sharpness.append(row)
    }
  }
  if (sharpness.querySelector('input')) place(sharpness)

  // A tab with nothing to show (e.g. Audio on a host without the mixer) is hidden.
  const syncTabs = () => {
    for (const tab of TABS) {
      const pane = paneEls.get(tab.id)!
      const btn = tabBar.querySelector<HTMLElement>(`#settings-tab-${tab.id}`)
      if (btn) btn.hidden = !pane.querySelector('.settings-section-content > .menu-section')
    }
  }
  // Fold existing controls rather than rebuild them: values, listeners and exports stay live.
  const navigationGroups = [
    {
      tab: 'planet',
      id: 'map',
      label: t('settings.map'),
      sections: ['settings-map', 'terrain-position'],
    },
    {
      tab: 'planet',
      id: 'layers',
      label: t('settings.layers'),
      sections: ['terrain-layers', 'settings-layer-air'],
    },
    {
      tab: 'planet',
      id: 'world-options',
      label: t('settings.options'),
      sections: [
        'road-style',
        'settings-planet-air',
        'settings-planet-sea',
        'settings-streetlights',
        'settings-headlamp',
        'settings-traffic-signs',
        'settings-options-labels',
      ],
    },
    {
      tab: 'options',
      id: 'display',
      label: t('settings.display'),
      sections: [
        'display-quality-section',
        'settings-sharpness',
        'quality-shadows',
        'settings-distances',
        'display-performance',
      ],
    },
    {
      tab: 'options',
      id: 'effects',
      label: t('settings.effects'),
      sections: ['settings-effects', 'settings-muzzle-flash'],
    },
    {
      tab: 'options',
      id: 'cameras',
      label: t('settings.camera'),
      sections: ['camera-extras', 'settings-camera-fov', 'settings-action-cam'],
    },
    { tab: 'options', id: 'driving', label: t('settings.driving'), sections: ['driving-extras'] },
    {
      tab: 'options',
      id: 'controls',
      label: t('settings.controls'),
      sections: ['settings-controls', 'settings-usb'],
    },
    {
      tab: 'objects',
      id: 'vehicles',
      label: t('settings.vehicles'),
      sections: ['scene-vehicles', 'settings-placed-objects', 'settings-object-layout'],
    },
    {
      tab: 'objects',
      id: 'current-vehicle',
      label: t('settings.current-vehicle'),
      sections: [...vehicleGroupSections],
    },
    { tab: 'objects', id: 'weapon', label: t('settings.weapon'), sections: ['settings-weapon'] },
    {
      tab: 'dev',
      id: 'weapons',
      label: t('settings.weapons'),
      sections: ['settings-options-sidearm', 'settings-weapon-poses'],
    },
  ]
  const sections = new Map<
    TabId,
    { nav: HTMLElement; body: HTMLElement; toggle: HTMLButtonElement; active?: string }
  >()
  const mobileLayout = window.matchMedia('(max-width:600px)')
  // Narrow screens fold the tree under its own button (.settings-sections-toggle); the content
  // always follows the tree in the pane.
  const positionContent = (tab: TabId) => {
    const layout = sections.get(tab)
    if (layout) paneEls.get(tab)!.append(layout.body)
  }
  const onMenuResize = () => {
    for (const tab of paneEls.keys()) positionContent(tab)
  }
  mobileLayout.addEventListener('change', onMenuResize)
  // Move the existing nodes, retaining native labels, listeners and live value spans.
  const alignSettingRows = (root: HTMLElement) => {
    for (const label of root.querySelectorAll<HTMLLabelElement>('label')) {
      if (
        label.querySelector(':scope > .settings-row-name') ||
        !label.querySelector('input, select, textarea')
      )
        continue
      const text = [...label.childNodes].filter(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      )
      if (!text.length) continue
      const name = doc.createElement('span'),
        value = doc.createElement('span')
      name.className = 'settings-row-name'
      value.className = 'settings-row-value'
      for (const node of text) name.append(node)
      value.append(...label.childNodes)
      label.append(name, value)
      label.classList.add('settings-inline-row')
    }
  }
  let activeTab: TabId = 'planet'
  const chooseSection = (tab: TabId, id: string) => {
    const layout = sections.get(tab)
    if (!layout) return
    layout.active = id
    for (const group of layout.body.querySelectorAll<HTMLElement>(':scope > .menu-section'))
      group.hidden = group.id !== id
    for (const button of layout.nav.querySelectorAll<HTMLButtonElement>('button[data-section]')) {
      const selected = button.dataset.section === id
      if (selected) button.setAttribute('aria-current', 'page')
      else button.removeAttribute('aria-current')
    }
    const category = layout.nav
      .querySelector<HTMLButtonElement>(`button[data-section="${id}"]`)
      ?.closest('details')
    if (category) category.open = true
    layout.toggle.textContent =
      layout.body.querySelector<HTMLElement>(`#${CSS.escape(id)}`)?.dataset.sectionTitle ?? id
    layout.nav.removeAttribute('data-open')
    layout.toggle.setAttribute('aria-expanded', 'false')
    positionContent(tab)
    layout.body.scrollTop = 0
    if (tab === 'planet' && id === 'settings-map' && !win.hidden) mapSection.refresh()
  }
  const foldSections = () => {
    for (const [tab, pane] of paneEls) {
      let layout = sections.get(tab)
      if (!layout) {
        const nav = doc.createElement('nav'),
          body = doc.createElement('div')
        nav.className = 'settings-sections'
        nav.setAttribute('aria-label', t('settings.sections'))
        body.className = 'settings-section-content'
        const toggle = doc.createElement('button')
        toggle.type = 'button'
        toggle.className = 'settings-sections-toggle'
        toggle.setAttribute('aria-expanded', 'false')
        toggle.addEventListener('click', () => {
          const open = !nav.hasAttribute('data-open')
          nav.toggleAttribute('data-open', open)
          toggle.setAttribute('aria-expanded', String(open))
        })
        pane.append(nav, body)
        layout = { nav, body, toggle }
        sections.set(tab, layout)
      }
      for (const section of [...pane.querySelectorAll<HTMLElement>(':scope > .menu-section')]) {
        if (section.hidden) continue
        const legend = section.querySelector<HTMLElement>(':scope > legend')
        if (legend) legend.hidden = true
        section.dataset.sectionTitle = legend?.textContent ?? section.id
        layout.body.append(section)
      }
      const ordered = [...layout.body.querySelectorAll<HTMLElement>(':scope > .menu-section')].sort(
        (a, b) => (order(a.id) < 0 ? 999 : order(a.id)) - (order(b.id) < 0 ? 999 : order(b.id)),
      )
      const items: HTMLElement[] = []
      const previousGroups = new Map(
        [...layout.nav.querySelectorAll<HTMLDetailsElement>('details[data-nav-group]')].map(
          (el) => [el.dataset.navGroup, el.open],
        ),
      )
      const groups = new Map<string, HTMLDetailsElement>()
      for (const section of ordered) {
        const button = doc.createElement('button')
        button.type = 'button'
        button.textContent = section.dataset.sectionTitle ?? section.id
        button.dataset.section = section.id
        button.addEventListener('click', () => {
          runtime.setSidearmAimPreview?.(false)
          chooseSection(tab, section.id)
        })
        const category = navigationGroups.find(
          (group) => group.tab === tab && group.sections.includes(section.id),
        )
        if (category) {
          let group = groups.get(category.id)
          if (!group) {
            group = doc.createElement('details')
            group.className = 'settings-nav-group'
            group.dataset.navGroup = category.id
            // Exclusive accordion: one open group per tab (the active section's group).
            group.name = `settings-nav-${tab}`
            group.open = previousGroups.get(category.id) ?? false
            const summary = doc.createElement('summary')
            summary.textContent = category.label
            group.append(summary)
            groups.set(category.id, group)
            items.push(group)
          }
          group.append(button)
        } else items.push(button)
      }
      // The mobile body may be nested in a group about to be replaced.
      pane.append(layout.body)
      alignSettingRows(layout.body)
      layout.nav.replaceChildren(layout.toggle, ...items)
      const chosen = ordered.find((el) => el.id === layout.active) ?? ordered[0]
      if (chosen) chooseSection(tab, chosen.id)
    }
  }
  foldSections()
  syncTabs()
  // Sections bound after the HUD (Tierra in the terrain game) are placed when they appear.
  const observer = menu
    ? new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes) if (node instanceof HTMLElement) place(node)
        foldSections()
        syncTabs()
      })
    : null
  observer?.observe(menu!, { childList: true })

  const style = doc.createElement('style')
  style.id = 'nabla-settings-hud-layout'
  style.textContent = settingsNavigationStyles

  doc.head.append(style)
  doc.body.append(toggle, win)

  planetPanel.bind(runtime)

  const selectTab = (id: TabId) => {
    activeTab = id
    if (id !== 'dev') runtime.setSidearmAimPreview?.(false)
    for (const tab of TABS) {
      const btn = doc.getElementById(`settings-tab-${tab.id}`)
      const pane = paneEls.get(tab.id)!
      const on = tab.id === id
      btn?.setAttribute('aria-selected', on ? 'true' : 'false')
      if (btn) btn.tabIndex = on ? 0 : -1
      pane.hidden = !on
    }
    planetPanel?.refresh()
  }

  const open = () => {
    refreshSidearm()
    win.hidden = false
    if (legacy) legacy.open = true
    toggle.setAttribute('aria-expanded', 'true')
    toggle.setAttribute('aria-label', t('settings.collapse-menu'))
    toggle.title = t('settings.collapse-menu-wheel-1-h')
    doc.body.classList.add('settings-is-open')
    if (activeTab === 'planet' && sections.get('planet')?.active === 'settings-map')
      mapSection.refresh()
    ;(doc.getElementById('euskadi-options-toggle') ?? closeButton).focus()
    // Taking focus from the canvas is enough: the runtime frees the pointer when it loses input.
    doc.getElementById('game-canvas')?.blur()
    planetPanel?.refresh()
  }
  const close = () => {
    runtime.setSidearmAimPreview?.(false)
    win.hidden = true
    if (legacy) legacy.open = false
    toggle.setAttribute('aria-expanded', 'false')
    toggle.setAttribute('aria-label', t('settings.open-menu'))
    toggle.title = t('settings.open-menu-wheel-1-h')
    doc.body.classList.remove('settings-is-open')
    doc.getElementById('game-canvas')?.focus()
  }
  const toggleWin = () => (win.hidden ? open() : close())

  toggle.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleWin()
  })
  tabBar.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest(
      'button[data-tab]',
    ) as HTMLButtonElement | null
    if (!btn?.dataset.tab) return
    selectTab(btn.dataset.tab as TabId)
  })
  tabBar.addEventListener('keydown', (event) => {
    const intent = menuNavigationKey(event.code)
    if (!intent || intent === 'focus') return
    event.preventDefault()
    const current = TABS.findIndex((tab) => tab.id === activeTab)
    const index =
      intent === 'first'
        ? 0
        : intent === 'last'
          ? TABS.length - 1
          : (current + (intent === 'next' ? 1 : -1) + TABS.length) % TABS.length
    selectTab(TABS[index].id)
    doc.getElementById(`settings-tab-${TABS[index].id}`)?.focus()
  })
  /**
   * Every per-vehicle option lives in one group of the Objetos tab, titled with the occupied
   * vehicle's name; options the vehicle cannot use (exhaust smoke on a bike) are not listed.
   */
  const refreshVehicleGroup = () => {
    const occupied = runtime.occupiedVehicle ?? null
    const group = doc.querySelector<HTMLDetailsElement>('details[data-nav-group="current-vehicle"]')
    if (!group) return
    const summary = group.querySelector('summary')
    const label = occupied?.name ?? t('settings.current-vehicle')
    if (summary && summary.textContent !== label) summary.textContent = label
    const show = vehicleGroupVisibility(occupied)
    // A section the vehicle cannot use disappears from the list; rows inside follow its options.
    for (const id of vehicleGroupSections) {
      const button = group.querySelector<HTMLButtonElement>(`button[data-section="${id}"]`)
      if (!button) continue
      const visible = show.sections[id]
      button.hidden = !visible
      button.style.display = visible ? '' : 'none'
      if (!visible && sections.get('objects')?.active === id) {
        const next = vehicleGroupSections.find((candidate) => show.sections[candidate])
        if (next) chooseSection('objects', next)
      }
    }
    const mirrorsGroup = doc.getElementById('scene-mirrors')
    if (mirrorsGroup) mirrorsGroup.hidden = !show.mirrors
    for (const row of doc.querySelectorAll<HTMLElement>('[data-exhaust-group]'))
      row.hidden = !(row.dataset.exhaustGroup === 'amount'
        ? show.exhaustAmount
        : show.exhaustPosition)
  }
  const updateClock = () => {
    refreshVehicleGroup()
    refreshVehicleLights()
    refreshRearNudge()
    refreshVehicleSound()
    refreshCameraFov()
    if (runtime.skyClock)
      toggle.textContent = formatClockTime(localMinutes(skyTime(runtime.skyClock)))
    if (!win.hidden && activeTab === 'planet' && sections.get('planet')?.active === 'settings-map')
      mapSection.refresh()
  }
  updateClock()
  const clockTimer = window.setInterval(updateClock, 1000)
  // Mouse wheel over the clock button: one hour per notch, up = later.
  const wheel = createWheelStepper()
  const onClockWheel = (event: WheelEvent) => {
    const steps = wheel.push(event.deltaY, event.deltaMode)
    event.preventDefault()
    if (!steps) return
    runtime.setSkyClock(shiftSkyClockKeepingRate(runtime.skyClock, steps * 60))
    // The time controls of the planet panel and the address listen for this to follow.
    window.dispatchEvent(new Event('nabla-sky-clock'))
    updateClock()
  }
  toggle.addEventListener('wheel', onClockWheel, { passive: false })
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      menuNavigationKey(event.code) === 'focus' &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.repeat) return
      if (win.hidden) {
        doc.exitPointerLock?.()
        open()
      } else {
        close()
        const canvas = doc.getElementById('game-canvas')
        const lock = canvas?.requestPointerLock?.()
        if (lock instanceof Promise) void lock.catch(() => undefined)
      }
      return
    }
    if (win.hidden) return
    if (menuNavigationKey(event.code) === 'focus') {
      const focusable = [
        toggle,
        ...win.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, a[href]'),
      ].filter(
        (el) =>
          !(el as HTMLInputElement).disabled && el.tabIndex >= 0 && el.getClientRects().length > 0,
      )
      const first = focusable[0],
        last = focusable.at(-1)
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    if (keyboardAction(event.code, { mode: 'road', menu: true }) === 'menu.back' && !win.hidden) {
      event.preventDefault()
      close()
    }
  }
  doc.addEventListener('keydown', onKeyDown, true)

  return {
    open,
    close,
    toggle: toggleWin,
    destroy: () => {
      usbPanel.dispose()
      doc.removeEventListener('keydown', onKeyDown, true)
      window.clearInterval(clockTimer)
      doc.body.classList.remove('settings-is-open')
      mobileLayout.removeEventListener('change', onMenuResize)
      toolbarResize.disconnect()
      window.removeEventListener('resize', alignToolbar)
      runtime.setSidearmAimPreview?.(false)
      observer?.disconnect()
      planetPanel?.destroy()
      planetPanel = null
      toggle.removeEventListener('wheel', onClockWheel)
      toggle.remove()
      win.remove()
      style.remove()
      if (legacy) legacy.hidden = false
    },
  }
}
