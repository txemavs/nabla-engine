/**
 * Host-skinnable engine splash / loading chrome.
 * Default Nabla skin remains; hosts (e.g. Euskadi Online) override logo, title,
 * rotating messages, layout and optional theme CSS without forking the loader.
 */

/** Where load status appears relative to the canvas. */
export type SplashLayout = 'centered' | 'corner'

export interface EngineSplashSkin {
  /** Image URL for the splash logo; omit to keep the default Nabla mark when present in the DOM. */
  logoUrl?: string
  /** Main title text (default: "NABLA ENGINE"). */
  title?: string
  /**
   * Rotating or sequential load messages shown while the host waits.
   * The active line is also updated by `setSplashStatus` / progress callbacks.
   */
  messages?: readonly string[]
  /**
   * Optional CSS text injected once as a `<style data-nabla-splash-theme>` tag.
   * Prefer CSS variables (`--splash-accent`, `--splash-bg`, …) over hard-coded forks.
   */
  themeCss?: string
  /**
   * `centered` is the classic full-screen Nabla boot card.
   * `corner` pins status to the bottom-left (attract / TV-style boot).
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
  root.classList.toggle('splash-centered', resolved.layout !== 'corner')

  const title =
    (root.querySelector('#loading-title') as HTMLElement | null) ??
    (root.querySelector('h1') as HTMLElement | null)
  if (title && resolved.title) title.textContent = resolved.title

  let logo = root.querySelector('#loading-logo') as HTMLImageElement | null
  if (resolved.logoUrl) {
    if (!logo) {
      logo = root.ownerDocument!.createElement('img')
      logo.id = 'loading-logo'
      logo.alt = resolved.title || 'Logo'
      const before = title ?? root.firstChild
      root.insertBefore(logo, before)
    }
    logo.src = resolved.logoUrl
    logo.hidden = false
  } else if (logo && !logo.getAttribute('src')) {
    logo.hidden = true
  }

  const status = root.querySelector('#loading-status') as HTMLElement | null
  if (status && resolved.messages?.length && !status.textContent?.trim()) {
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

/** Pick a message by progress 0..1 (or cycle by index). */
export function splashMessageAt(
  messages: readonly string[] | undefined,
  progressOrIndex: number,
): string {
  const list = messages?.length ? messages : defaultNablaSplashSkin.messages!
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
