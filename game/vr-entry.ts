import { addCornerButton } from '@nabla/engine/runtime/corner-buttons'
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import {
  activePlayMode,
  installSettingsScope,
  playModeFromSearch,
  vrModeQuery,
} from '@nabla/engine/runtime/settings-scope'
import { t } from '@nabla/engine/i18n'
import { GAME_MENU_VR_BUTTON_ID } from '../src/runtime/main-menu.js'

/** The page was opened in a VR mode (`?vr=pc` PC browser + Link, `?vr=headset` in the headset). */
export function pcVRRequested(search = location.search): boolean {
  return playModeFromSearch(search) !== 'pc'
}

/** Order of the `casco` button in the top-right row (menu-only: the main menu offers it): + 10, CAM 20, FOV 30, QLTY 40, casco 50, clock 60. */
export const VR_BUTTON_ORDER = 50

const icon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7h18v10h-6l-3-3-3 3H3z"/><path d="M6 10h3m6 0h3"/></svg>'

/** True only when a headset can start immersive VR here; never throws. */
async function immersiveVRSupported(): Promise<boolean> {
  if (!window.isSecureContext || !navigator.xr) return false
  try {
    return await navigator.xr.isSessionSupported('immersive-vr')
  } catch {
    return false
  }
}

/** Resolves once the page has loaded and gone idle, so the probe never competes with boot. */
function afterGameLoaded(): Promise<void> {
  const idle = () =>
    new Promise<void>((resolve) => {
      const ric = (
        window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }
      ).requestIdleCallback
      if (ric) ric(() => resolve(), { timeout: 2000 })
      else setTimeout(resolve, 500)
    })
  if (document.readyState === 'complete') return idle()
  return new Promise((resolve) =>
    window.addEventListener('load', () => void idle().then(resolve), { once: true }),
  )
}

/**
 * The casco click: requests the immersive session synchronously, inside the user gesture.
 * `enter()` calls `navigator.xr.requestSession` before its first await and the XR code is
 * already loaded by the support probe, so no promise hop or settings work comes first.
 */
export function startVREntry(runtime: Pick<GameRuntime, 'loadedXR' | 'loadXR'>): Promise<void> {
  const loaded = runtime.loadedXR
  const entering = loaded ? loaded.enter() : runtime.loadXR().then((xr) => xr.enter())
  if (activePlayMode() === 'pc') {
    installSettingsScope('headset-pc')
    const url = new URL(location.href)
    url.searchParams.set('vr', vrModeQuery['headset-pc'])
    history.replaceState(history.state, '', url)
  }
  return entering
}

/**
 * One `casco` button, just left of the clock in the top-right row, shown only when
 * `navigator.xr.isSessionSupported('immersive-vr')` is true. The probe runs after the game has
 * loaded: an installed OpenXR runtime (Quest Link, SteamVR) can stall `navigator.xr`, and boot
 * must never wait for it. On a PC page the click switches to the `headset-pc` settings profile
 * (`?vr=pc`) and enters VR inside the same user gesture WebXR needs. The standalone headset
 * profile (`?vr=headset`) is reached by address only; there it is the same button.
 */
export function mountVREntry(runtime: GameRuntime): void {
  const button = document.createElement('button')
  button.type = 'button'
  // Offered from the main menu (Virtual reality › Enter); the corner keeps it for its click.
  button.id = GAME_MENU_VR_BUTTON_ID
  button.className = 'nabla-btn nabla-btn--icon nabla-btn--menu-only'
  button.hidden = true
  button.title = t('vr.enter')
  button.setAttribute('aria-label', button.title)
  button.innerHTML = icon
  let disposed = false
  const say = (text: string) => {
    const message = document.getElementById('game-message')
    if (message) message.textContent = text
    console.info(`[vr] ${text}`)
  }
  const check = async () => {
    const supported = await immersiveVRSupported()
    if (disposed) return
    button.hidden = !supported
    if (!supported) return
    addCornerButton('tr', button, VR_BUTTON_ORDER)
    // Load the XR code once a headset is there, so the click enters at once.
    void runtime.loadXR().catch(() => {})
  }
  button.onclick = () => {
    button.disabled = true
    const entering = startVREntry(runtime)
    // Quest Link keeps the request pending until the headset is worn and Link is active.
    const waiting = setTimeout(() => say(t('vr.waiting-headset')), 8000)
    void entering
      .then(() => document.querySelector<HTMLCanvasElement>('#game-canvas')?.focus())
      .catch((error) => say(t('vr.enter-failed', { error: String(error) })))
      .finally(() => {
        clearTimeout(waiting)
        button.disabled = false
      })
  }
  void afterGameLoaded().then(() => {
    if (disposed) return
    navigator.xr?.addEventListener('devicechange', check)
    void check()
  })
  window.addEventListener(
    'pagehide',
    () => {
      disposed = true
      navigator.xr?.removeEventListener('devicechange', check)
      button.remove()
    },
    { once: true },
  )
}
