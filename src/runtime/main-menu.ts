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
  doc.addEventListener('pointerdown', (event) => {
    const target = event.target as Node
    if (nav.hidden || nav.contains(target) || options.toggle?.()?.contains(target)) return
    setOpen(false)
  })
  installEngineStyles(doc)
  doc.body.append(nav)
  return {
    nav,
    get isOpen() {
      return !nav.hidden
    },
    setOpen,
    toggle: () => setOpen(nav.hidden !== false),
    entry: (id) => entries.get(id) ?? null,
  }
}

