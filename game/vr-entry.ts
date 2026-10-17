import type { GameRuntime } from '@nabla/engine/runtime/browser'

/** Enter the current world, keeping the user gesture required by WebXR. */
export function mountVREntry(runtime: GameRuntime): void {
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
    if (supported) place()
    else button.remove()
  }
  button.onclick = () => {
    button.disabled = true
    void runtime.xr
      .enter()
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
