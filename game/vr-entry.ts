import type { GameRuntime } from '@nabla/engine/runtime/browser'
import {
  playModeFromSearch,
  vrModeQuery,
  type PlayMode,
  type VRPlayMode,
} from '@nabla/engine/runtime/settings-scope'

/** The page was opened in a VR mode (`?vr=pc` PC browser + Link, `?vr=headset` in the headset). */
export function pcVRRequested(search = location.search): boolean {
  return playModeFromSearch(search) !== 'pc'
}

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

/** Host slot for the buttons: the top-right clock group, else the toolbar, else a corner. */
function placeButtons(buttons: readonly HTMLButtonElement[]): void {
  const host =
    document.getElementById('euskadi-clock-group') ??
    document.querySelector<HTMLElement>('.game-toolbar')
  const first = buttons[0]
  if (host) {
    if (first.parentElement !== host || first.nextElementSibling !== buttons[1])
      host.prepend(...buttons)
    return
  }
  for (const button of buttons)
    if (!button.parentElement) {
      button.classList.add('nabla-corner', 'nabla-corner--tr')
      document.body.append(button)
    }
}

const icon =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7h18v10h-6l-3-3-3 3H3z"/><path d="M6 10h3m6 0h3"/></svg>'

const modes: readonly { mode: VRPlayMode; label: string; title: string }[] = [
  {
    mode: 'headset',
    label: 'casco',
    title: 'Jugar en el casco (navegador del Quest o Link dentro del casco)',
  },
  {
    mode: 'headset-pc',
    label: 'casco PC',
    title: 'Jugar en el casco conectado al PC (Link / SteamVR), con volante y pedales USB',
  },
]

/** Address of `mode`, keeping the other parameters. */
function modeUrl(mode: VRPlayMode): string {
  const url = new URL(location.href)
  url.searchParams.set('vr', vrModeQuery[mode])
  return url.toString()
}

/**
 * Two VR entries in the top-right row, `casco` (`?vr=headset`) and `casco PC` (`?vr=pc`); each
 * mode keeps its own saved settings (`settings-scope.ts`). Outside the active mode a button just
 * opens that mode's address. In the active mode it enters VR, keeping the user gesture WebXR
 * needs; when VR cannot start it is dimmed and says why (title, game message, click re-checks).
 * Only a VR mode touches `navigator.xr` or loads the XR code: an installed OpenXR runtime (Quest
 * Link, SteamVR) can stall the normal boot.
 */
export function mountVREntry(runtime: GameRuntime): void {
  const active: PlayMode = playModeFromSearch()
  const buttons = modes.map(({ mode, label, title }) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.id = mode === 'headset' ? 'euskadi-enter-vr-headset' : 'euskadi-enter-vr'
    button.className = 'nabla-btn nabla-btn--wide'
    button.dataset.vrMode = mode
    button.setAttribute('aria-label', title)
    button.title = title
    button.innerHTML = `${icon}<span>${label}</span>`
    if (mode !== active) button.onclick = () => location.assign(modeUrl(mode))
    return button
  })
  const place = () => placeButtons(buttons)
  place()
  const observer = new MutationObserver(place)
  observer.observe(document.body, { childList: true, subtree: true })
  let disposed = false
  let check: (() => Promise<void>) | null = null
  const current = buttons.find((button) => button.dataset.vrMode === active)
  if (current) {
    const title = current.title
    let reason: string | null = 'Comprobando el casco VR…'
    const say = (text: string) => {
      const message = document.getElementById('game-message')
      if (message) message.textContent = text
      console.info(`[vr] ${text}`)
    }
    const render = () => {
      current.setAttribute('aria-disabled', reason ? 'true' : 'false')
      current.style.opacity = reason ? '0.5' : ''
      current.style.outline = reason ? '' : '3px solid var(--accent,#ffb000)'
      current.title = reason ? `${title}: ${reason}` : title
    }
    render()
    check = async () => {
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
      current.focus()
    }
    current.onclick = () => {
      if (reason) {
        say(`VR no disponible: ${reason}`)
        void check?.()
        return
      }
      current.disabled = true
      void runtime
        .loadXR()
        .then((xr) => xr.enter())
        .then(() => {
          current.style.outline = ''
          // Keyboard, USB wheel/pedals and gamepad follow canvas focus, as on the desktop.
          document.querySelector<HTMLCanvasElement>('#game-canvas')?.focus()
        })
        .catch((error) => say(`No se pudo entrar en VR: ${String(error)}`))
        .finally(() => {
          current.disabled = false
        })
    }
    navigator.xr?.addEventListener('devicechange', check)
    void check()
  }
  window.addEventListener(
    'pagehide',
    () => {
      disposed = true
      observer.disconnect()
      if (check) navigator.xr?.removeEventListener('devicechange', check)
      for (const button of buttons) button.remove()
    },
    { once: true },
  )
}
