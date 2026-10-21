/**
 * Main menu component: the start screen (title notice, ENTER button, extra entries) and the menu
 * toggle button (menu / Esc / play states). Hosts only configure it: texts are i18n keys read
 * through the `t` they pass, icons and links are data, styling is {@link MAIN_MENU_CSS} plus the
 * shared button CSS (`.nabla-btn`, `--icon`, `--danger`, `--go`).
 *
 * `mountStartScreen` is self-contained on purpose (no module references), so a host can inline
 * its source (`mountStartScreen.toString()`) in a classic first-paint script, like
 * `mountMobileQualityButton`.
 */

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
 * Keep a menu toggle in step with the menu and the pointer lock: menu icon when closed, red «Esc»
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
  button.setAttribute('aria-pressed', String(state.open))
  if (mode === 'open') button.innerHTML = PLAY_ICON
  else if (mode === 'locked') button.textContent = 'Esc'
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

/**
 * Default start screen look (the Euskadi Online style): centered under the title, white on a soft
 * dark halo, a thin outlined ENTER. Hosts set `--nabla-start-font`, `--nabla-start-top` and
 * `--nabla-start-gap` (the one spacing between all elements).
 */
export const MAIN_MENU_CSS = [
  `.nabla-start { position:fixed;left:50%;top:var(--nabla-start-top,50%);z-index:1004;transform:translateX(-50%);`,
  `width:min(92vw,640px);text-align:center;color:#fff;font-family:var(--nabla-start-font,Arial,sans-serif);`,
  `pointer-events:auto;opacity:0;transition:opacity .6s ease;`,
  `display:flex;flex-direction:column;align-items:center;gap:var(--nabla-start-gap,1em); }`,
  `.nabla-start::before { content:"";position:absolute;inset:-3vh -4vw;z-index:-1;pointer-events:none;`,
  `background:radial-gradient(closest-side,rgba(0,0,0,.45),rgba(0,0,0,0)); }`,
  `.nabla-start.is-on { opacity:1; }`,
  `.nabla-start,.nabla-start button { text-shadow:0 2px 14px rgba(0,0,0,.9); }`,
  `.nabla-start-logo { display:block;max-width:60%; }`,
  `.nabla-start-title { margin:0;font:700 clamp(20px,3vw,36px)/1.1 var(--nabla-start-font,Arial,sans-serif); }`,
  `.nabla-start-notes { position:fixed;left:0;right:0;bottom:var(--nabla-ui-margin,12px);z-index:1004;`,
  `display:flex;flex-direction:column;align-items:center;gap:.3em;text-align:center;color:#fff;`,
  `font-family:var(--nabla-start-font,Arial,sans-serif);text-shadow:0 2px 14px rgba(0,0,0,.9);`,
  `pointer-events:none;opacity:0;transition:opacity .6s ease; }`,
  `.nabla-start-notes.is-on { opacity:1; }`,
  `.nabla-start-notice { margin:0;font-size:clamp(10px,.85vw,12px);line-height:1.35;opacity:.78; }`,
  `.nabla-start-locales { display:flex;justify-content:center;gap:1.2em;font-size:clamp(11px,.95vw,13px); }`,
  `.nabla-start-locales a { color:rgba(255,255,255,.78);text-decoration:none;letter-spacing:.08em; }`,
  `.nabla-start-locales a:hover,.nabla-start-locales a:focus-visible { color:#fff;text-decoration:underline;outline:none; }`,
  `.nabla-start-enter { margin:0;font:400 clamp(14px,1.4vw,18px) var(--nabla-start-font,Arial,sans-serif);`,
  `letter-spacing:.45em;padding:.8em 1.6em .8em 2.05em;color:#fff;background:rgba(0,0,0,.35);cursor:pointer;`,
  `border:1px solid rgba(255,255,255,.75);border-radius:2px; }`,
  `.nabla-start-enter:hover,.nabla-start-enter:focus-visible { background:rgba(255,255,255,.16);outline:none; }`,
  `.nabla-start-entries { display:flex;align-items:center;justify-content:center;gap:16px; }`,
  `.nabla-start-entry { display:flex;align-items:center;justify-content:center;width:36px;height:36px;`,
  `color:rgba(255,255,255,.75);background:none;border:1px solid transparent;border-radius:50%;`,
  `box-sizing:border-box;text-decoration:none;cursor:pointer; }`,
  `.nabla-start-entry svg { width:24px;height:24px; }`,
  `.nabla-start-entry:hover,.nabla-start-entry:focus-visible { color:#fff;border-color:rgba(255,255,255,.5);outline:none; }`,
].join('')
