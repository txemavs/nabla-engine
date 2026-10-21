import { addCornerButton } from '@nabla/engine/runtime/corner-buttons'
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import {
  activePlayMode,
  installSettingsScope,
  playModeFromSearch,
  vrModeQuery,
} from '@nabla/engine/runtime/settings-scope'

/** The page was opened in a VR mode (`?vr=pc` PC browser + Link, `?vr=headset` in the headset). */
export function pcVRRequested(search = location.search): boolean {
  return playModeFromSearch(search) !== 'pc'
}

/** Order of the `casco` button in the top-right row: + 10, CAM 20, FOV 30, QLTY 40, casco 50, clock 60. */
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
  button.className = 'nabla-btn nabla-btn--icon'
  button.hidden = true
  button.title = 'casco: jugar en el casco VR'
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
    if (activePlayMode() === 'pc') {
      installSettingsScope('headset-pc')
      const url = new URL(location.href)
      url.searchParams.set('vr', vrModeQuery['headset-pc'])
      history.replaceState(history.state, '', url)
    }
    button.disabled = true
    void runtime
      .loadXR()
      .then((xr) => xr.enter())
      .then(() => document.querySelector<HTMLCanvasElement>('#game-canvas')?.focus())
      .catch((error) => say(`No se pudo entrar en VR: ${String(error)}`))
      .finally(() => {
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
