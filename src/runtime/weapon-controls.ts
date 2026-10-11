/** On-screen weapon controls, available with mouse and touch. */
export class WeaponControls {
  readonly root = document.createElement('div')
  aiming = false
  private readonly lifetime = new AbortController()
  constructor(
    host: HTMLElement,
    action: (code: string) => void,
    private readonly aim: (held: boolean) => void,
  ) {
    this.root.className = 'weapon-controls'
    this.root.style.cssText =
      'position:absolute;right:16px;top:36%;z-index:48;display:flex;flex-direction:column;gap:8px;pointer-events:auto;max-width:260px'
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
      button.textContent = label
      button.style.cssText =
        'min-height:44px;padding:10px 16px;border:1px solid #72818c;border-radius:8px;background:#101b28dd;color:white;touch-action:none;font:14px sans-serif'
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
    const tips = document.createElement('details'),
      title = document.createElement('summary')
    title.textContent = 'Consejos del arma'
    tips.style.cssText =
      'padding:10px;background:#101b28ee;color:white;border-radius:8px;font:13px/1.5 sans-serif'
    const text = document.createElement('div')
    text.textContent =
      'R: sacar / meter cargador normal. M: cargador largo y automático. F: accionar corredera o cerrarla con su botón si está abierta. Z + clic: activar / desactivar seguro. X: mirar recámara. Mantén botón derecho o Apuntar para apuntar. G: láser. H: linterna.'
    tips.append(title, text)
    this.root.append(tips)
    host.append(this.root)
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
