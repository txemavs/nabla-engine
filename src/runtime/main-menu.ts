/**
 * Main menu component: the start screen (title notice, ENTER button, extra entries) and the menu
 * toggle button (menu / Esc / play states). Hosts only configure it: texts are i18n keys read
 * through the `t` they pass, icons and links are data, styling is the engine stylesheet (src/ui/styles/menu.css) plus the
 * shared button CSS (`.nabla-btn`, `--icon`, `--danger`, `--go`).
 *
 * `mountStartScreen` is self-contained on purpose (no module references), so a host can inline
 * its source (`mountStartScreen.toString()`) in a classic first-paint script, like
 * `mountMobileQualityButton`.
 */
import { installEngineStyles } from '../ui/styles.js'
import { engineVersion } from './engine-version.js'
import { createInstallEntry } from './pwa-install.js'

/** Translate function of the host: the engine `t`, or an inlined copy (`window.euskadiT`). */
export type MenuTranslate = (
  key: string,
  params?: Readonly<Record<string, string | number>>,
) => string

/** One extra item under the ENTER button: a link (`href`) or an action (`run`). */
export interface StartScreenEntry {
  id: string
  /** i18n key of the tooltip / aria-label (icon entries) or the visible label (text entries). */
  labelKey: string
  /** Inline SVG markup; when set the entry is an icon button. */
  icon?: string
  href?: string
  run?: () => void
}

export interface StartScreenOptions {
  t: MenuTranslate
  /** Element id of the screen (hosts may style it further). Default `nabla-start`. */
  id?: string
  /** Optional title line above the notices (i18n key). */
  titleKey?: string
  /** Optional logo above everything. */
  logoUrl?: string
  /** ENTER button label (i18n key). */
  enterKey: string
  /** Small lines under the title (i18n keys). */
  noticeKeys?: readonly string[]
  /**
   * Where the notices go: `inline` (default, in the screen) or `bottom` (their own block fixed at
   * the bottom of the viewport, `--nabla-ui-margin` from the edge).
   */
  noticePosition?: 'inline' | 'bottom'
  /**
   * Language links above ENTER: every locale but `locale`, labelled `locale.<code>`. Each reloads
   * the same address with `?locale=<code>`, other parameters kept.
   */
  locales?: readonly string[]
  /** The active locale (left out of the links). */
  locale?: string
  entries?: readonly StartScreenEntry[]
  /** Called with the entries row, to add host widgets (e.g. the mobile quality button). */
  decorate?: (row: HTMLElement) => void
  /** sessionStorage flag that enters right away once (then cleared). */
  autoEnterFlag?: string
  /** The player entered (button, Enter, Space, or the auto-enter flag). */
  onEnter: (why: string) => void
}

export interface StartScreen {
  panel: HTMLElement
  enter: (why: string) => void
}

/** Show the start screen; it fades out and removes itself on enter. */
export function mountStartScreen(doc: Document, options: StartScreenOptions): StartScreen {
  const panel = doc.createElement('div')
  panel.id = options.id || 'nabla-start'
  panel.className = 'nabla-start'
  if (options.logoUrl) {
    const logo = doc.createElement('img')
    logo.className = 'nabla-start-logo'
    logo.src = options.logoUrl
    logo.alt = ''
    panel.append(logo)
  }
  if (options.titleKey) {
    const title = doc.createElement('h1')
    title.className = 'nabla-start-title'
    title.textContent = options.t(options.titleKey)
    panel.append(title)
  }
  const notices = options.noticePosition === 'bottom' ? doc.createElement('div') : panel
  if (notices !== panel) notices.className = 'nabla-start-notes'
  const parts = notices === panel ? [panel] : [panel, notices]
  for (const key of options.noticeKeys || []) {
    const notice = doc.createElement('p')
    notice.className = 'nabla-start-notice'
    notice.textContent = options.t(key)
    notices.append(notice)
  }
  const others = (options.locales || []).filter((code) => code !== options.locale)
  if (others.length) {
    const nav = doc.createElement('nav')
    nav.className = 'nabla-start-locales'
    for (const code of others) {
      const link = doc.createElement('a')
      const url = new URL(doc.location.href)
      url.searchParams.set('locale', code)
      link.href = url.href
      link.hreflang = code
      link.textContent = options.t('locale.' + code)
      nav.append(link)
    }
    panel.append(nav)
  }
  const button = doc.createElement('button')
  button.type = 'button'
  button.className = 'nabla-start-enter'
  button.textContent = options.t(options.enterKey)
  panel.append(button)
  const row = doc.createElement('div')
  row.className = 'nabla-start-entries'
  for (const entry of options.entries || []) {
    const item = doc.createElement(entry.href ? 'a' : 'button')
    item.id = entry.id
    item.className = 'nabla-start-entry'
    const label = options.t(entry.labelKey)
    if (entry.icon) {
      item.innerHTML = entry.icon
      item.title = label
      item.setAttribute('aria-label', label)
    } else item.textContent = label
    if (item instanceof HTMLAnchorElement) item.href = entry.href as string
    else {
      ;(item as HTMLButtonElement).type = 'button'
      item.addEventListener('click', () => entry.run?.())
    }
    row.append(item)
  }
  options.decorate?.(row)
  if (row.childElementCount) panel.append(row)
  let entered = false
  const win = doc.defaultView || window
  const onKey = (event: KeyboardEvent) => {
    if (row.contains(event.target as Node)) return
    if (event.code !== 'Enter' && event.code !== 'NumpadEnter' && event.code !== 'Space') return
    event.preventDefault()
    event.stopImmediatePropagation()
    enter(event.code)
  }
  const enter = (why: string) => {
    if (entered) return
    entered = true
    win.removeEventListener('keydown', onKey, true)
    for (const part of parts) part.classList.remove('is-on')
    setTimeout(() => parts.forEach((part) => part.remove()), 700)
    options.onEnter(why)
  }
  button.addEventListener('click', () => enter('button'))
  win.addEventListener('keydown', onKey, true)
  const show = () => {
    if (!doc.body) {
      setTimeout(show, 16)
      return
    }
    doc.body.append(...parts)
    void panel.offsetWidth
    for (const part of parts) part.classList.add('is-on')
    if (!options.autoEnterFlag) return
    try {
      if (sessionStorage.getItem(options.autoEnterFlag) === '1') {
        sessionStorage.removeItem(options.autoEnterFlag)
        enter('auto')
      }
    } catch {
      /* Storage is optional. */
    }
  }
  show()
  return { panel, enter }
}

/** i18n keys of the menu toggle tooltips (engine defaults in the engine catalog). */
export interface MenuToggleKeys {
  open: string
  resume: string
  release: string
}

export const MENU_TOGGLE_KEYS: MenuToggleKeys = {
  open: 'menu.open',
  resume: 'menu.resume',
  release: 'menu.release',
}

const MENU_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
const PLAY_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 4l13 8-13 8z"/></svg>'

/**
 * Keep a menu toggle in step with the menu and the pointer lock: menu icon when closed, red «ESC»
 * while the cursor is locked (Esc releases it), green play icon while the menu is open.
 */
export function syncMenuToggle(
  button: HTMLElement,
  state: { open: boolean; locked: boolean },
  t: MenuTranslate,
  keys: MenuToggleKeys = MENU_TOGGLE_KEYS,
): void {
  const mode = state.open ? 'open' : state.locked ? 'locked' : 'closed'
  if (button.dataset.menuMode === mode) return
  button.dataset.menuMode = mode
  button.classList.add('nabla-btn', 'nabla-btn--icon')
  button.classList.toggle('nabla-btn--go', mode === 'open')
  button.classList.toggle('nabla-btn--danger', mode === 'locked')
  button.classList.toggle('nabla-btn--key', mode === 'locked')
  button.setAttribute('aria-pressed', String(state.open))
  if (mode === 'open') button.innerHTML = PLAY_ICON
  else if (mode === 'locked') button.textContent = 'ESC'
  else button.innerHTML = MENU_ICON
  button.title = t(mode === 'open' ? keys.resume : mode === 'locked' ? keys.release : keys.open)
  button.setAttribute('aria-label', button.title)
}

/** A menu toggle wired to `document`: pointer lock and `body.settings-is-open` drive its state. */
export function mountMenuToggle(
  doc: Document,
  options: { t: MenuTranslate; onClick: () => void; keys?: MenuToggleKeys; id?: string },
): HTMLButtonElement {
  const button = doc.createElement('button')
  button.type = 'button'
  if (options.id) button.id = options.id
  const sync = () =>
    syncMenuToggle(
      button,
      { open: doc.body.classList.contains('settings-is-open'), locked: !!doc.pointerLockElement },
      options.t,
      options.keys,
    )
  button.addEventListener('click', () => options.onClick())
  doc.addEventListener('pointerlockchange', sync)
  new MutationObserver(sync).observe(doc.body, { attributes: true, attributeFilter: ['class'] })
  sync()
  return button
}

/** One item of a {@link SideMenuSection}: a link (`href`), an action (`run`) or a note line. */
export interface SideMenuEntry {
  id?: string
  /** i18n key of the label (or of the note text). */
  labelKey: string
  href?: string
  /** Runs inside the click (so it may start a user-gesture API, e.g. an XR session). */
  run?: () => void
  /** A muted text line instead of a button. */
  note?: boolean
  /** Keep the menu open after the action (default: it closes). */
  keepOpen?: boolean
  /** An element the caller owns (and keeps updating), placed as the entry; clicks close the menu. */
  element?: HTMLElement
}

/** A titled group of entries; without `titleKey` the entries stand on their own. */
export interface SideMenuSection {
  id: string
  titleKey?: string
  entries: readonly SideMenuEntry[]
}

export interface SideMenuOptions {
  t: MenuTranslate
  /** Element id of the menu. Default `nabla-side-menu`. */
  id?: string
  /** i18n key of the menu's aria-label. */
  labelKey: string
  sections: readonly SideMenuSection[]
  /** The button that opens the menu (it does not close the menu on outside presses). */
  toggle?: () => HTMLElement | null
  /** Class set on <body> while open. Default `nabla-side-menu-open`. */
  bodyClass?: string
}

export interface SideMenu {
  nav: HTMLElement
  readonly isOpen: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  /** An entry (button, link or note) by its id. */
  entry: (id: string) => HTMLElement | null
  /** Remove the menu and its listeners. */
  destroy: () => void
}

/**
 * Narrow or touch screens: the menu drops down full width under the top row and its titled
 * sections are a tree with one open at a time. Otherwise a left side panel with every section open.
 */
export const SIDE_MENU_COMPACT_QUERY =
  '(max-width: 600px), (pointer: coarse) and (max-width: 900px)'

/**
 * The game's main menu, opened by the ☰ toggle. Hosts only configure sections and entries
 * (i18n keys, links, actions); look: src/ui/styles/menu.css and the shared `.nabla-btn` buttons.
 */
export function mountSideMenu(doc: Document, options: SideMenuOptions): SideMenu {
  const nav = doc.createElement('nav')
  nav.className = 'nabla-side-menu'
  nav.id = options.id || 'nabla-side-menu'
  nav.hidden = true
  nav.setAttribute('aria-label', options.t(options.labelKey))
  const bodyClass = options.bodyClass || 'nabla-side-menu-open'
  const entries = new Map<string, HTMLElement>()
  const groups: HTMLDetailsElement[] = []
  const setOpen = (open: boolean) => {
    nav.hidden = !open
    doc.body.classList.toggle(bodyClass, open)
    options.toggle?.()?.setAttribute('aria-expanded', String(open))
    if (open) doc.exitPointerLock?.()
  }
  for (const section of options.sections) {
    let box: HTMLElement
    if (section.titleKey) {
      const group = doc.createElement('details')
      const title = doc.createElement('summary')
      title.className = 'nabla-side-menu-title'
      title.textContent = options.t(section.titleKey)
      group.append(title)
      groups.push(group)
      box = group
    } else box = doc.createElement('div')
    box.className = 'nabla-side-menu-section'
    box.dataset.section = section.id
    for (const entry of section.entries) {
      let item: HTMLElement
      if (entry.element) {
        item = entry.element
        item.classList.add('nabla-btn')
        if (!entry.keepOpen) item.addEventListener('click', () => setOpen(false))
        if (entry.id) entries.set(entry.id, item)
        box.append(item)
        continue
      }
      if (entry.note) {
        item = doc.createElement('p')
        item.className = 'nabla-side-menu-note'
      } else if (entry.href) {
        const link = doc.createElement('a')
        link.href = entry.href
        item = link
      } else {
        const button = doc.createElement('button')
        button.type = 'button'
        item = button
      }
      if (!entry.note) item.className = 'nabla-btn'
      item.textContent = options.t(entry.labelKey)
      if (entry.run)
        item.addEventListener('click', () => {
          if (!entry.keepOpen) setOpen(false)
          entry.run!()
        })
      if (entry.id) {
        item.id = entry.id
        entries.set(entry.id, item)
      }
      box.append(item)
    }
    nav.append(box)
  }
  // Compact: one open titled section (details[name]); wide: all open, titles are plain headings.
  const compact = doc.defaultView?.matchMedia(SIDE_MENU_COMPACT_QUERY)
  const layout = () => {
    const narrow = !!compact?.matches
    nav.classList.toggle('is-compact', narrow)
    groups.forEach((group, i) => {
      if (narrow) group.name = `${nav.id}-sections`
      else group.removeAttribute('name')
      group.open = narrow ? i === 0 : true
    })
  }
  compact?.addEventListener('change', layout)
  layout()
  nav.addEventListener('click', (event) => {
    const summary = (event.target as HTMLElement).closest('summary')
    if (summary && !nav.classList.contains('is-compact')) event.preventDefault()
  })
  const outside = (event: Event) => {
    const target = event.target as Node
    if (nav.hidden || nav.contains(target) || options.toggle?.()?.contains(target)) return
    setOpen(false)
  }
  doc.addEventListener('pointerdown', outside)
  const onEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || nav.hidden) return
    event.preventDefault()
    event.stopPropagation()
    setOpen(false)
  }
  doc.addEventListener('keydown', onEscape, true)
  installEngineStyles(doc)
  doc.body.append(nav)
  return {
    nav,
    destroy: () => {
      doc.removeEventListener('pointerdown', outside)
      doc.removeEventListener('keydown', onEscape, true)
      compact?.removeEventListener('change', layout)
      doc.body.classList.remove(bodyClass)
      nav.remove()
    },
    get isOpen() {
      return !nav.hidden
    },
    setOpen,
    toggle: () => setOpen(nav.hidden !== false),
    entry: (id) => entries.get(id) ?? null,
  }
}

/** The settings window as the game menu drives it (settings-hud.ts registers it). */
export interface GameMenuSettings {
  /** Open on `tab` and, when given, on that section of it (a section id). */
  open: (tab?: string, section?: string) => void
  close: () => void
  readonly isOpen: boolean
  /**
   * Where the menu's other sections (virtual reality, host links, extra entries) are shown as
   * titled `.menu-section` fieldsets. With it ☰ opens the settings window directly.
   */
  readonly menuPane?: HTMLElement
}

export interface GameMenuOptions {
  /** Translate function (default: the engine catalog passed to {@link mountGameMenu}). */
  t?: MenuTranslate
  /** i18n key of the menu's aria-label. Default `menu.label`. */
  labelKey?: string
  /** Element id of the menu. Default `nabla-side-menu`. */
  id?: string
  /** Class set on <body> while open. Default `nabla-side-menu-open`. */
  bodyClass?: string
  /** The host's sections, given the engine defaults (game tabs, virtual reality). */
  sections?: (defaults: SideMenuSection[]) => SideMenuSection[]
}

/** Id of the engine's Enter VR corner button (vr-entry.ts); the menu offers it instead. */
export const GAME_MENU_VR_BUTTON_ID = 'nabla-vr-enter'
/** Id of the ☰ toggle in the top-left corner. */
export const GAME_MENU_TOGGLE_ID = 'nabla-menu-toggle'

interface GameMenuState {
  doc: Document
  t: MenuTranslate
  options: GameMenuOptions
  extra: Map<string, SideMenuEntry[]>
  settings?: GameMenuSettings
  menu?: SideMenu
  toggle?: HTMLButtonElement
  observer?: MutationObserver
}
// One menu per page even when the source tree and the package build are both loaded
// (game/*.ts import src, host inline modules import the package): the state lives on globalThis.
const GAME_MENU_KEY = Symbol.for('nabla.gameMenu')
const PENDING_KEY = Symbol.for('nabla.gameMenu.pending')
const store = globalThis as unknown as {
  [GAME_MENU_KEY]?: GameMenuState | null
  // Entries added before the menu is mounted.
  [PENDING_KEY]?: Map<string, SideMenuEntry[]>
}

/** Id prefix of the game section's tab entries (the settings window shows the tabs itself). */
const MENU_TAB_ENTRY = 'nabla-menu-tab-'

const SETTINGS_TABS: ReadonlyArray<readonly [tab: string, key: string]> = [
  ['planet', 'settings.world'],
  ['options', 'settings.settings'],
  ['dev', 'settings.development'],
]

/**
 * The engine's sections: Main first (info: version, engine status, current scenario and install;
 * virtual reality: enter, note, headset page), then the game's settings tabs. In the settings
 * window the Main sections fill its first tab, before World.
 */
/** Ids of the Main > Info entries (version line, status lines, install button). */
export const GAME_MENU_VERSION_ID = 'nabla-menu-version'
export const GAME_MENU_INSTALL_ID = 'nabla-menu-install'
/** Engine status line (renderer and physics thread), set by the settings window. */
export const GAME_MENU_ENGINE_ID = 'nabla-menu-engine'
/** Current scenario line, set by the host when it loads one (hidden until then). */
export const GAME_MENU_SCENARIO_ID = 'nabla-menu-scenario'

export function defaultGameMenuSections(): SideMenuSection[] {
  return [
    {
      id: 'info',
      titleKey: 'menu.info',
      entries: [
        { id: GAME_MENU_VERSION_ID, labelKey: 'menu.version', note: true },
        { id: GAME_MENU_ENGINE_ID, labelKey: 'menu.engine', note: true },
        { id: GAME_MENU_SCENARIO_ID, labelKey: 'menu.scenario', note: true },
        { id: GAME_MENU_INSTALL_ID, labelKey: 'pwa.install' },
      ],
    },
    {
      id: 'vr',
      titleKey: 'menu.vr',
      entries: [
        {
          id: 'nabla-menu-vr-enter',
          labelKey: 'menu.vr-enter',
          run: () => store[GAME_MENU_KEY]?.doc.getElementById(GAME_MENU_VR_BUTTON_ID)?.click(),
        },
        { id: 'nabla-menu-vr-note', labelKey: 'menu.vr-unavailable', note: true },
        { labelKey: 'menu.headset', href: '/headset.html' },
      ],
    },
    {
      id: 'game',
      titleKey: 'menu.game',
      entries: SETTINGS_TABS.map(([tab, key]) => ({
        id: `${MENU_TAB_ENTRY}${tab}`,
        labelKey: key,
        run: () => openGameSettings(tab),
      })),
    },
  ]
}

/**
 * Open the settings window, on `tab` when given (app, planet, options, dev) and on its `section`
 * (e.g. `nabla-menu-section-scenarios`).
 */
export function openGameSettings(tab?: string, section?: string): void {
  const state = store[GAME_MENU_KEY]
  if (!state?.settings) return
  state.menu?.setOpen(false)
  state.settings.open(tab, section)
}

/** Info entries: the version line with the number, the install action as a live button. */
function infoEntry(doc: Document, t: MenuTranslate, entry: SideMenuEntry): SideMenuEntry {
  if (entry.element) return entry
  if (entry.id === GAME_MENU_VERSION_ID) {
    const line = doc.createElement('p')
    line.id = GAME_MENU_VERSION_ID
    line.className = 'nabla-side-menu-note'
    line.textContent = `${t(entry.labelKey)} ${engineVersion ? `v${engineVersion}` : t('menu.version-dev')}`
    return { ...entry, element: line }
  }
  if (entry.id === GAME_MENU_ENGINE_ID || entry.id === GAME_MENU_SCENARIO_ID) {
    const line = doc.createElement('p')
    line.id = entry.id
    line.className = 'nabla-side-menu-note'
    const text = notes()[entry.id]
    line.textContent = text ?? ''
    line.hidden = !text
    return { ...entry, element: line }
  }
  if (entry.id === GAME_MENU_INSTALL_ID) {
    const button = createInstallEntry(doc, t)
    button.textContent = t(entry.labelKey)
    return { ...entry, element: button }
  }
  return entry
}

function buildGameMenu(state: GameMenuState): void {
  const { doc, options } = state
  state.menu?.destroy()
  state.observer?.disconnect()
  const t = options.t ?? state.t
  const defaults = defaultGameMenuSections()
  const sections = (options.sections ? options.sections(defaults) : defaults).map((section) => ({
    ...section,
    entries: [...section.entries, ...(state.extra.get(section.id) ?? [])].map((entry) =>
      infoEntry(doc, t, entry),
    ),
  }))
  const menu = mountSideMenu(doc, {
    t,
    id: options.id,
    bodyClass: options.bodyClass,
    labelKey: options.labelKey ?? 'menu.label',
    toggle: () => state.toggle ?? null,
    sections,
  })
  state.menu = menu
  // VR entry: shown when the engine's VR button is offered (or the page has its own entry).
  const syncVR = () => {
    const button = doc.getElementById(GAME_MENU_VR_BUTTON_ID)
    const pageEntry = [...(state.extra.get('vr') ?? [])].some((entry) => entry.element)
    const ready = !!button && !button.hidden && !pageEntry
    const enter = menu.entry('nabla-menu-vr-enter')
    const note = menu.entry('nabla-menu-vr-note')
    if (enter && enter.hidden === ready) enter.hidden = !ready
    const noted = !ready && !pageEntry
    if (note && note.hidden === noted) note.hidden = !noted
  }
  syncVR()
  showInSettings(state, t)
  state.observer = new MutationObserver(syncVR)
  state.observer.observe(doc.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['hidden'],
  })
}

/**
 * The settings window is the full-screen menu: the side menu's sections (but the tab entries)
 * move into its menu pane, one titled fieldset each, keeping their entries and listeners.
 */
function showInSettings(state: GameMenuState, t: MenuTranslate): void {
  const pane = state.settings?.menuPane
  const menu = state.menu
  if (!pane || !menu) return
  const { doc } = state
  for (const box of [
    ...menu.nav.querySelectorAll<HTMLElement>(':scope > .nabla-side-menu-section'),
  ]) {
    const id = `nabla-menu-section-${box.dataset.section}`
    doc.getElementById(id)?.remove()
    const items = [...box.children].filter(
      (child) => child.tagName !== 'SUMMARY' && !child.id.startsWith(MENU_TAB_ENTRY),
    ) as HTMLElement[]
    if (!items.length) continue
    const group = doc.createElement('fieldset')
    group.className = 'menu-section'
    group.id = id
    const legend = doc.createElement('legend')
    const title = box.querySelector(':scope > summary')?.textContent
    legend.textContent = title || items[0].textContent || t('menu.label')
    group.append(legend, ...items)
    pane.append(group)
  }
}

/**
 * The game's one main menu: the ☰ toggle in the top-left corner and the side menu it opens
 * (engine and host pages alike). ☰ closes the settings window when it is open, otherwise it
 * opens or closes the menu. Calling again (a host configuring its sections and texts) rebuilds
 * the menu in place; the toggle stays.
 */
export function mountGameMenu(
  doc: Document,
  t: MenuTranslate,
  options: GameMenuOptions = {},
  addToCorner?: (toggle: HTMLButtonElement) => void,
): SideMenu {
  const existing = store[GAME_MENU_KEY]
  if (existing && existing.doc === doc) {
    existing.t = t
    existing.options = { ...existing.options, ...options }
    buildGameMenu(existing)
    return existing.menu!
  }
  const state: GameMenuState = { doc, t, options, extra: store[PENDING_KEY] ?? new Map() }
  store[PENDING_KEY] = undefined
  store[GAME_MENU_KEY] = state
  state.toggle = mountMenuToggle(doc, {
    t: options.t ?? t,
    id: GAME_MENU_TOGGLE_ID,
    onClick: () => {
      if (state.settings?.isOpen) state.settings.close()
      else if (state.settings?.menuPane) state.settings.open()
      else state.menu?.toggle()
    },
  })
  addToCorner?.(state.toggle)
  buildGameMenu(state)
  return state.menu!
}

/** settings-hud.ts: the window the menu's game entries open. */
export function registerGameMenuSettings(settings: GameMenuSettings): void {
  const state = store[GAME_MENU_KEY]
  if (!state) return
  state.settings = settings
  buildGameMenu(state)
}

/** Add entries to a section of the game menu (e.g. the XR page's own Enter VR and monitor). */
export function addGameMenuEntries(sectionId: string, entries: readonly SideMenuEntry[]): void {
  const state = store[GAME_MENU_KEY]
  const extra = state?.extra ?? (store[PENDING_KEY] ??= new Map())
  extra.set(sectionId, [...(extra.get(sectionId) ?? []), ...entries])
  if (state) buildGameMenu(state)
}

const NOTES_KEY = Symbol.for('nabla.gameMenu.notes')
const notes = (): Record<string, string> =>
  ((globalThis as unknown as { [NOTES_KEY]?: Record<string, string> })[NOTES_KEY] ??= {})

/**
 * Set a status line of Main > Info ({@link GAME_MENU_ENGINE_ID}, {@link GAME_MENU_SCENARIO_ID}):
 * plain text, an empty string hides it. Kept across menu rebuilds; may be called before mounting.
 */
export function setGameMenuNote(id: string, text: string): void {
  notes()[id] = text
  const line = store[GAME_MENU_KEY]?.doc.getElementById(id)
  if (line) {
    line.textContent = text
    line.hidden = !text
  }
}

/** The mounted game menu, if any. */
export function currentGameMenu(): SideMenu | null {
  return store[GAME_MENU_KEY]?.menu ?? null
}
