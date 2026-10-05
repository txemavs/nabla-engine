/**
 * Host-skinnable engine splash / loading chrome.
 * Default Nabla skin remains; hosts (e.g. Euskadi Online) override logo, title,
 * rotating messages, layout and optional theme CSS without forking the loader.
 */

/**
 * Where load status appears relative to the canvas.
 * - `centered`: classic full-screen Nabla boot card.
 * - `corner`: status box bottom-left (attract / TV-style boot).
 * - `mark`: mark-only pre-attract. Black screen with only the logo (default: the Nabla ▽ mark,
 *   `nablaMarkUrl`), small in the bottom-right corner; no title, load texts, progress or tile grid.
 *   The page lifts the black curtain once attract draws the planet; the mark stays until play.
 */
export type SplashLayout = 'centered' | 'corner' | 'mark'

/**
 * The Nabla mark: hollow tip-down ▽ triangle in ice blue (same drawing as `assets/brand/source.svg`).
 * Inline so a host needs no asset path for the `mark` layout.
 */
export const NABLA_MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">' +
  '<defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#D9F5FF"/><stop offset=".382" stop-color="#81B5D8"/><stop offset="1" stop-color="#245580"/></linearGradient>' +
  '<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#244F7B"/><stop offset=".618" stop-color="#609BBF"/><stop offset="1" stop-color="#DFFAFF"/></linearGradient>' +
  '<linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ECFCFF"/><stop offset=".382" stop-color="#6498BA"/><stop offset="1" stop-color="#C7EDF4"/></linearGradient></defs>' +
  '<polygon fill="#E8FAFF" points="18,48.43 162,48.43 157.68,50.92 22.32,50.92"/>' +
  '<polygon fill="#719AB8" points="162,48.43 90,173.14 90,168.15 157.68,50.92"/>' +
  '<polygon fill="#C6E9F8" points="90,173.14 18,48.43 22.32,50.92 90,168.15"/>' +
  '<polygon fill="url(#a)" points="22.32,50.92 157.68,50.92 141.84,60.07 38.16,60.07"/>' +
  '<polygon fill="url(#b)" points="157.68,50.92 90,168.15 90,149.86 141.84,60.07"/>' +
  '<polygon fill="url(#c)" points="90,168.15 22.32,50.92 38.16,60.07 90,149.86"/>' +
  '<polygon fill="#274D70" points="38.16,60.07 141.84,60.07 137.52,62.56 42.48,62.56"/>' +
  '<polygon fill="#D2EDF4" points="141.84,60.07 90,149.86 90,144.87 137.52,62.56"/>' +
  '<polygon fill="#84B5D2" points="90,149.86 38.16,60.07 42.48,62.56 90,144.87"/>' +
  '</svg>'

/** `NABLA_MARK_SVG` as an `<img src>`; the default logo of the `mark` layout. */
export const nablaMarkUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(NABLA_MARK_SVG)

export interface EngineSplashSkin {
  /** Image URL for the splash logo; omit to keep the default Nabla mark when present in the DOM. */
  logoUrl?: string
  /** Main title text (default: "NABLA ENGINE"); `''` hides the title. */
  title?: string
  /**
   * Rotating or sequential load messages shown while the host waits.
   * The active line is also updated by `setSplashStatus` / progress callbacks.
   * `[]` means no host load texts (the status line starts empty); omit for the Nabla defaults.
   */
  messages?: readonly string[]
  /**
   * `false` hides every load text (status line and detail lines) in any layout, including the
   * engine's streaming lines. Failures still reach the player through the page's error overlay.
   * Default true; the `mark` layout never shows texts.
   */
  status?: boolean
  /**
   * Optional CSS text injected once as a `<style data-nabla-splash-theme>` tag.
   * Prefer CSS variables (`--splash-accent`, `--splash-bg`, …) over hard-coded forks.
   */
  themeCss?: string
  /**
   * `centered` is the classic full-screen Nabla boot card.
   * `corner` pins status to the bottom-left (attract / TV-style boot).
   * `mark` is the black, mark-only pre-attract screen (logo bottom-right, no texts).
   */
  layout?: SplashLayout
}

export const defaultNablaSplashSkin: Readonly<EngineSplashSkin> = Object.freeze({
  title: 'NABLA ENGINE',
  messages: ['Cargando el motor…', 'Preparando el cielo…', 'Cargando el terreno…'],
  layout: 'centered',
})

export interface SplashElements {
  root: HTMLElement
  title?: HTMLElement | null
  logo?: HTMLImageElement | null
  status?: HTMLElement | null
  detail?: HTMLElement | null
  progressBar?: HTMLElement | null
}

const THEME_STYLE_ATTR = 'data-nabla-splash-theme'

/** Resolve a partial host override over the default Nabla skin. */
export function resolveSplashSkin(
  skin: EngineSplashSkin = {},
): Required<Pick<EngineSplashSkin, 'title' | 'layout'>> & EngineSplashSkin {
  return {
    ...defaultNablaSplashSkin,
    ...skin,
    title: skin.title ?? defaultNablaSplashSkin.title!,
    layout: skin.layout ?? defaultNablaSplashSkin.layout!,
    messages: skin.messages ?? defaultNablaSplashSkin.messages,
  }
}

/**
 * Apply skin slots to an existing splash DOM subtree.
 * Expected optional ids/classes: `#loading-screen` (or `root`), `#loading-title` / `h1`,
 * `#loading-logo`, `#loading-status`, `#loading-detail`, `#loading-progress-bar`.
 */
export function applySplashSkin(root: HTMLElement, skin: EngineSplashSkin = {}): EngineSplashSkin {
  const resolved = resolveSplashSkin(skin)
  root.dataset.splashLayout = resolved.layout
  root.classList.toggle('splash-corner', resolved.layout === 'corner')
  root.classList.toggle('splash-mark', resolved.layout === 'mark')
  root.classList.toggle('splash-centered', resolved.layout === 'centered')
  const quiet = resolved.status === false || resolved.layout === 'mark'
  root.classList.toggle('splash-no-status', quiet)

  const title =
    (root.querySelector('#loading-title') as HTMLElement | null) ??
    (root.querySelector('h1') as HTMLElement | null)
  if (title) {
    // '' is an explicit "no title"; the mark layout never shows one.
    if (resolved.title) title.textContent = resolved.title
    else title.textContent = ''
    title.hidden = !resolved.title || resolved.layout === 'mark'
  }

  let logo = root.querySelector('#loading-logo') as HTMLImageElement | null
  // The mark layout defaults to the Nabla ▽ unless the page already shows a logo.
  const logoUrl =
    resolved.logoUrl ??
    (resolved.layout === 'mark' && !logo?.getAttribute('src') ? nablaMarkUrl : undefined)
  if (logoUrl) {
    if (!logo) {
      logo = root.ownerDocument!.createElement('img')
      logo.id = 'loading-logo'
      logo.alt = resolved.title || 'Logo'
      const before = title ?? root.firstChild
      root.insertBefore(logo, before)
    }
    logo.src = logoUrl
    logo.hidden = false
  } else if (logo && !logo.getAttribute('src')) {
    logo.hidden = true
  }

  const status = root.querySelector('#loading-status') as HTMLElement | null
  if (status) status.hidden = quiet
  const detail = root.querySelector('#loading-detail') as HTMLElement | null
  if (detail && quiet) detail.hidden = true
  if (status && resolved.messages?.length === 0) status.textContent = ''
  else if (status && resolved.messages?.length && !status.textContent?.trim()) {
    status.textContent = resolved.messages[0] ?? ''
  }

  if (resolved.themeCss) injectSplashTheme(root.ownerDocument!, resolved.themeCss)
  return resolved
}

/** Inject or replace host theme CSS for the splash. */
export function injectSplashTheme(doc: Document, css: string): void {
  let style = doc.querySelector(`style[${THEME_STYLE_ATTR}]`) as HTMLStyleElement | null
  if (!style) {
    style = doc.createElement('style')
    style.setAttribute(THEME_STYLE_ATTR, '')
    doc.head.appendChild(style)
  }
  style.textContent = css
}

/** Pick a message by progress 0..1 (or cycle by index). `undefined` uses the defaults; `[]` gives ''. */
export function splashMessageAt(
  messages: readonly string[] | undefined,
  progressOrIndex: number,
): string {
  const list = messages ?? defaultNablaSplashSkin.messages!
  if (!list.length) return ''
  if (progressOrIndex >= 0 && progressOrIndex <= 1 && list.length > 1) {
    const index = Math.min(list.length - 1, Math.floor(progressOrIndex * list.length))
    return list[index]!
  }
  const index = Math.abs(Math.floor(progressOrIndex)) % list.length
  return list[index]!
}

/** Read the usual splash slots under a root element. */
export function splashElements(root: HTMLElement): SplashElements {
  return {
    root,
    title:
      (root.querySelector('#loading-title') as HTMLElement | null) ??
      (root.querySelector('h1') as HTMLElement | null),
    logo: root.querySelector('#loading-logo') as HTMLImageElement | null,
    status: root.querySelector('#loading-status') as HTMLElement | null,
    detail: root.querySelector('#loading-detail') as HTMLElement | null,
    progressBar: root.querySelector('#loading-progress-bar') as HTMLElement | null,
  }
}
