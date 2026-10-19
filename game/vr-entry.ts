import type { GameRuntime } from '@nabla/engine/runtime/browser'

/** The page was opened as PC VR (`?vr=pc`, from the headset page). */
export function pcVRRequested(search = location.search): boolean {
  return new URLSearchParams(search).get('vr') === 'pc'
}

/**
 * Enter the current world, keeping the user gesture required by WebXR. Only for the PC VR entry
 * (`?vr=pc`, from the headset page): the normal game boot never touches `navigator.xr`, never
 * checks session support and never loads the XR code, because an installed OpenXR runtime
 * (Quest Link, SteamVR) can stall that boot.
 */
export function mountVREntry(runtime: GameRuntime): void {
  if (!pcVRRequested()) return
  const button = document.createElement('button')
  button.type = 'button'
  button.id = 'euskadi-enter-vr'
  button.title = 'Entrar en realidad virtual'
  button.setAttribute('aria-label', button.title)
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7h18v10h-6l-3-3-3 3H3z"/><path d="M6 10h3m6 0h3"/></svg><span>VR</span>'
  button.style.cssText =
    'display:inline-flex;align-items:center;justify-content:center;gap:4px;height:36px;padding:0 8px;margin-right:6px;background:var(--button,#252525);color:var(--ink,#fff);border:1px solid var(--line,#555);border-radius:2px;pointer-events:auto'
  let supported = false,
    disposed = false
  const place = () => {
    const clock = document.getElementById('euskadi-clock-group')
    if (supported && clock && button.parentElement !== clock) clock.prepend(button)
  }
  const observer = new MutationObserver(place)
  observer.observe(document.body, { childList: true, subtree: true })
  const check = async () => {
    try {
      supported = !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr'))
    } catch {
      supported = false
    }
    if (disposed) return
    // Load the XR code as soon as the device can use it, so the click enters at once (WebXR
    // needs the user gesture) instead of waiting for the download.
    if (supported) void runtime.loadXR().catch(() => {})
    if (supported) place()
    else button.remove()
    // Point at the button: WebXR needs a click, so the session cannot start by itself.
    if (supported) {
      button.style.outline = '3px solid var(--accent,#ffb000)'
      button.focus()
    }
  }
  button.onclick = () => {
    button.disabled = true
    void runtime
      .loadXR()
      .then((xr) => xr.enter())
      .then(() => {
        button.style.outline = ''
        // Keyboard, USB wheel/pedals and gamepad follow canvas focus, as on the desktop.
        document.querySelector<HTMLCanvasElement>('#game-canvas')?.focus()
      })
      .catch((error) => {
        const message = document.getElementById('game-message')
        if (message) message.textContent = `No se pudo entrar en VR: ${String(error)}`
      })
      .finally(() => {
        button.disabled = false
      })
  }
  navigator.xr?.addEventListener('devicechange', check)
  void check()
  window.addEventListener(
    'pagehide',
    () => {
      disposed = true
      observer.disconnect()
      navigator.xr?.removeEventListener('devicechange', check)
      button.remove()
    },
    { once: true },
  )
}
