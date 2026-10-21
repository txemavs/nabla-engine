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
/** Why immersive VR cannot start here, or null when it can (also probes the device). */
async function vrUnavailableReason(): Promise<string | null> {
  if (!window.isSecureContext) return 'La página no es segura: WebXR necesita https o localhost'
  if (!navigator.xr) return 'Este navegador no ofrece WebXR (usa Chrome o Edge en el PC)'
  try {
    if (await navigator.xr.isSessionSupported('immersive-vr')) return null
  } catch (error) {
    return `WebXR rechazó la comprobación: ${String(error)}`
  }
  return 'No hay casco VR: activa Quest Link (o SteamVR) y ponlo como runtime OpenXR'
}

/** Host slot for the button: the top-right clock group, else the toolbar, else a corner. */
function placeButton(button: HTMLButtonElement): void {
  const clock = document.getElementById('euskadi-clock-group')
  if (clock) {
    if (button.parentElement !== clock) clock.prepend(button)
    return
  }
  const toolbar = document.querySelector<HTMLElement>('.game-toolbar')
  if (toolbar) {
    if (button.parentElement !== toolbar) toolbar.prepend(button)
    return
  }
  if (!button.parentElement) {
    button.classList.add('nabla-corner', 'nabla-corner--tr')
    document.body.append(button)
  }
}

/**
 * Enter the current world, keeping the user gesture required by WebXR. Only for the PC VR entry
 * (`?vr=pc`, from the headset page): the normal game boot never touches `navigator.xr`, never
 * checks session support and never loads the XR code, because an installed OpenXR runtime
 * (Quest Link, SteamVR) can stall that boot. With `?vr=pc` the button is always shown; when VR
 * cannot start it is dimmed and says why (title, and the game message on click).
 */
export function mountVREntry(runtime: GameRuntime): void {
  if (!pcVRRequested()) return
  const button = document.createElement('button')
  button.type = 'button'
  button.id = 'euskadi-enter-vr'
  button.className = 'nabla-btn nabla-btn--wide'
  const label = 'Entrar en realidad virtual'
  button.setAttribute('aria-label', label)
  button.title = label
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7h18v10h-6l-3-3-3 3H3z"/><path d="M6 10h3m6 0h3"/></svg><span>VR</span>'
  let reason: string | null = 'Comprobando el casco VR…'
  let disposed = false
  const say = (text: string) => {
    const message = document.getElementById('game-message')
    if (message) message.textContent = text
    console.info(`[vr] ${text}`)
  }
  const render = () => {
    button.setAttribute('aria-disabled', reason ? 'true' : 'false')
    button.style.opacity = reason ? '0.5' : ''
    button.style.outline = reason ? '' : '3px solid var(--accent,#ffb000)'
    button.title = reason ? `${label}: ${reason}` : label
  }
  render()
  const place = () => placeButton(button)
  place()
  const observer = new MutationObserver(place)
  observer.observe(document.body, { childList: true, subtree: true })
  const check = async () => {
    const next = await vrUnavailableReason()
    if (disposed) return
    reason = next
    render()
    if (reason) {
      say(`VR no disponible: ${reason}`)
      return
    }
    // Load the XR code as soon as the device can use it, so the click enters at once (WebXR
    // needs the user gesture) instead of waiting for the download.
    void runtime.loadXR().catch(() => {})
    button.focus()
  }
  button.onclick = () => {
    if (reason) {
      say(`VR no disponible: ${reason}`)
      void check()
      return
    }
    button.disabled = true
    void runtime
      .loadXR()
      .then((xr) => xr.enter())
      .then(() => {
        button.style.outline = ''
        // Keyboard, USB wheel/pedals and gamepad follow canvas focus, as on the desktop.
        document.querySelector<HTMLCanvasElement>('#game-canvas')?.focus()
      })
      .catch((error) => say(`No se pudo entrar en VR: ${String(error)}`))
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
