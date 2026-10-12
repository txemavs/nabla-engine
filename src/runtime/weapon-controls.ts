import { GameToolbar } from './game-toolbar.js'
/** On-screen weapon controls, available with mouse and touch. */
export class WeaponControls {
  readonly root = document.createElement('div')
  aiming = false
  private readonly lifetime = new AbortController()
  constructor(
    host: HTMLElement,
    action: (code: string) => void,
    private readonly aim: (held: boolean) => void,
    toolbar?: GameToolbar,
  ) {
    this.root.className = 'weapon-controls'
    this.root.style.cssText =
      'position:absolute;right:8px;top:220px;z-index:48;display:flex;flex-direction:column;gap:8px;pointer-events:auto;max-width:260px'
    const options = { signal: this.lifetime.signal }
    const aiming = (held: boolean) => {
      this.aiming = held
      aim(held)
    }
    for (const [label, code] of [
      ['Apuntar', 'aim'],
      ['Cargador · R', 'KeyR'],
      ['Corredera · F', 'KeyF'],
    ]) {
      const button = document.createElement('button')
      button.type = 'button'
      button.title = label
      button.setAttribute('aria-label', label)
      const icon =
        code === 'aim'
          ? '<circle cx="12" cy="12" r="6"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>'
          : code === 'KeyR'
            ? '<path d="M8 3h8v17H8zM10 7h4m-4 4h4m-4 4h4"/>'
            : '<path d="M4 8h16v7H4zM8 4L4 8l4 4m8 0l4 4-4 4"/>'
      button.innerHTML =
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        icon +
        '</svg>'
      button.style.cssText =
        'width:44px;height:44px;display:grid;place-items:center;padding:0;border:2px solid #395e79;border-radius:12px;background:#142735;color:#c6e6ff;touch-action:none;cursor:pointer'
      button.addEventListener(
        'pointerdown',
        (event) => {
          event.preventDefault()
          event.stopPropagation()
          button.setPointerCapture(event.pointerId)
          if (code === 'aim') aiming(true)
          else action(code)
        },
        options,
      )
      if (code === 'aim') {
        for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
          button.addEventListener(event, () => aiming(false), options)
      }
      button.addEventListener(
        'click',
        (event) => {
          if (event.detail === 0) {
            if (code === 'aim') aiming(!this.aiming)
            else action(code)
          }
        },
        options,
      )
      this.root.append(button)
    }
    if (toolbar) toolbar.mount(this.root, 20)
    else host.append(this.root)
    window.addEventListener('blur', () => aiming(false), options)
    this.setActive(false)
  }
  setActive(active: boolean): void {
    this.root.style.display = active ? 'flex' : 'none'
    if (!active && this.aiming) {
      this.aiming = false
      this.aim(false)
    }
  }
  dispose(): void {
    this.lifetime.abort()
    this.root.remove()
  }
}
