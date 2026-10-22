/**
 * The player's quality profile (`performancePresets` key, or `custom`).
 *
 * `?quality=` wins when the page has it; otherwise the profile saved in `localStorage`
 * (`nabla.quality`) applies. Hosts that rewrite or strip the query string (the closed Euskadi
 * demo keeps only `?renderer=`) therefore still get the profile the player chose: before this,
 * «Aplicar calidad» reloaded with `?quality=low`, the host dropped it, and every profile booted
 * as `custom` (the heaviest browser defaults).
 */
export const QUALITY_STORAGE_KEY = 'nabla.quality'
/** Tab-only test override (`sessionStorage`) set by the phone button; never saved. */
export const QUALITY_SESSION_STORAGE_KEY = 'nabla.quality.session'
/** One-shot `sessionStorage` flag: the host skips its start screen on the next boot. */
export const AUTO_ENTER_STORAGE_KEY = 'nabla.autoEnter'
/** The lightest named profile that keeps the game readable; the phone button switches to it. */
export const MOBILE_QUALITY = 'mobile'

type ReadStorage = Pick<Storage, 'getItem'>
type WriteStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const VALID = /^[a-z][a-z0-9-]{0,31}$/

function safeGet(storage: ReadStorage | undefined | null, key: string): string | null {
  try {
    const value = storage?.getItem(key) ?? null
    return value !== null && VALID.test(value) ? value : null
  } catch {
    return null
  }
}

function defaultStorage(): WriteStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function defaultSession(): ReadStorage | undefined {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

/**
 * Active quality profile: URL `quality`, else the tab's test override (phone button), else the
 * saved one, else `fallback`.
 */
export function readQualityPreset(
  search: string = globalThis.location?.search ?? '',
  storage: ReadStorage | undefined | null = defaultStorage(),
  fallback = 'custom',
  session: ReadStorage | undefined | null = defaultSession(),
): string {
  const fromUrl = new URLSearchParams(search).get('quality')
  if (fromUrl && VALID.test(fromUrl)) return fromUrl
  return (
    safeGet(session, QUALITY_SESSION_STORAGE_KEY) ??
    safeGet(storage, QUALITY_STORAGE_KEY) ??
    fallback
  )
}

/** Remember the profile for the next boots (`custom` clears the saved choice). */
export function saveQualityPreset(
  preset: string,
  storage: WriteStorage | undefined | null = defaultStorage(),
): void {
  try {
    if (preset === 'custom' || !VALID.test(preset)) storage?.removeItem(QUALITY_STORAGE_KEY)
    else storage?.setItem(QUALITY_STORAGE_KEY, preset)
  } catch {
    /* Storage is optional. */
  }
}

/**
 * Round, icon-only phone button for testing: one click runs this tab in mobile quality and enters
 * the game straight away (`sessionStorage` override + one-shot auto-enter flag, then reload). The
 * saved profile is never touched. Clicking it while active drops the override and returns to the
 * start screen. Self-contained (no imports, no outer references) so a host boot script can inline
 * it with `Function#toString` before the engine bundle loads.
 */
export function mountMobileQualityButton(parent: HTMLElement): HTMLButtonElement {
  const SESSION = 'nabla.quality.session'
  const AUTO = 'nabla.autoEnter'
  let active = false
  try {
    active = sessionStorage.getItem(SESSION) === 'mobile'
  } catch {
    /* Storage is optional. */
  }
  const button = document.createElement('button')
  button.type = 'button'
  button.id = 'nabla-mobile-quality'
  button.title = active ? 'Probando calidad móvil · volver' : 'Entrar con calidad móvil (prueba)'
  button.setAttribute('aria-label', 'Calidad móvil')
  button.setAttribute('aria-pressed', String(active))
  button.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M18 11v2"/></svg>'
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    try {
      if (active) {
        sessionStorage.removeItem(SESSION)
        sessionStorage.removeItem(AUTO)
      } else {
        sessionStorage.setItem(SESSION, 'mobile')
        sessionStorage.setItem(AUTO, '1')
      }
    } catch {
      /* Storage is optional. */
    }
    const url = new URL(location.href)
    url.searchParams.delete('quality')
    location.assign(url.href)
  })
  parent.append(button)
  return button
}

/** Read and clear the one-shot auto-enter flag. */
export function takeAutoEnter(
  session: WriteStorage | undefined | null = defaultStorageSession(),
): boolean {
  try {
    const on = session?.getItem(AUTO_ENTER_STORAGE_KEY) === '1'
    session?.removeItem(AUTO_ENTER_STORAGE_KEY)
    return on
  } catch {
    return false
  }
}

function defaultStorageSession(): WriteStorage | undefined {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}
