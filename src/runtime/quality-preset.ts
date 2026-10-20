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
/** Profile to return to when the mobile toggle is switched off. */
export const QUALITY_PREVIOUS_STORAGE_KEY = 'nabla.quality.previous'
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

/** Active quality profile: URL `quality`, else the saved one, else `fallback`. */
export function readQualityPreset(
  search: string = globalThis.location?.search ?? '',
  storage: ReadStorage | undefined | null = defaultStorage(),
  fallback = 'custom',
): string {
  const fromUrl = new URLSearchParams(search).get('quality')
  if (fromUrl && VALID.test(fromUrl)) return fromUrl
  return safeGet(storage, QUALITY_STORAGE_KEY) ?? fallback
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
 * Switch to {@link MOBILE_QUALITY}, or back to the profile used before it. Returns the profile
 * to boot with next; the caller reloads so every setting is applied from the start.
 */
export function toggleMobileQuality(
  current: string,
  storage: WriteStorage | undefined | null = defaultStorage(),
): string {
  let next: string
  try {
    if (current === MOBILE_QUALITY) {
      next = safeGet(storage, QUALITY_PREVIOUS_STORAGE_KEY) ?? 'custom'
      if (next === MOBILE_QUALITY) next = 'custom'
      storage?.removeItem(QUALITY_PREVIOUS_STORAGE_KEY)
    } else {
      storage?.setItem(QUALITY_PREVIOUS_STORAGE_KEY, current)
      next = MOBILE_QUALITY
    }
  } catch {
    next = current === MOBILE_QUALITY ? 'custom' : MOBILE_QUALITY
  }
  saveQualityPreset(next, storage)
  return next
}

/**
 * Round, icon-only phone button that toggles mobile quality and reloads. Self-contained (no
 * imports, no outer references) so a host boot script can inline it with `Function#toString`
 * before the engine bundle loads; it uses the same storage keys as the functions above.
 */
export function mountMobileQualityButton(parent: HTMLElement): HTMLButtonElement {
  const KEY = 'nabla.quality'
  const PREV = 'nabla.quality.previous'
  const get = (key: string): string | null => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }
  const set = (key: string, value: string | null) => {
    try {
      if (value === null || value === 'custom') localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch {
      /* Storage is optional. */
    }
  }
  const current = new URLSearchParams(location.search).get('quality') ?? get(KEY) ?? 'custom'
  const active = current === 'mobile'
  const button = document.createElement('button')
  button.type = 'button'
  button.id = 'nabla-mobile-quality'
  button.title = active ? 'Calidad móvil activa · volver a la anterior' : 'Calidad móvil'
  button.setAttribute('aria-label', 'Calidad móvil')
  button.setAttribute('aria-pressed', String(active))
  button.style.cssText =
    'display:flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;margin:0;border-radius:50%;cursor:pointer;box-sizing:border-box;' +
    (active
      ? 'color:#fff;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.75)'
      : 'color:rgba(255,255,255,.75);background:transparent;border:1px solid transparent')
  button.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>'
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (active) {
      const previous = get(PREV)
      set(KEY, previous && previous !== 'mobile' ? previous : null)
      set(PREV, null)
    } else {
      try {
        localStorage.setItem(PREV, current)
      } catch {
        /* Storage is optional. */
      }
      set(KEY, 'mobile')
    }
    const url = new URL(location.href)
    url.searchParams.delete('quality')
    location.assign(url.href)
  })
  parent.append(button)
  return button
}
