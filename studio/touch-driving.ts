/** Pointer capture supports simultaneous steering/pedals and always releases cancelled input. */
export class TouchDriving {
  readonly root = document.createElement('div')
  private held = new Map<number, string>()
  private enabled = false
  constructor(
    host: HTMLElement,
    actions: { play: () => void; interact: () => void; camera: () => void },
  ) {
    this.root.className = 'touch-driving'
    this.root.setAttribute('aria-label', 'Controles táctiles')
    const controls = [
      ['play', 'Jugar'],
      ['interact', 'Entrar / salir'],
      ['camera', 'Cámara'],
      ['brake', 'Freno'],
      ['left', '◀'],
      ['right', '▶'],
      ['reverse', 'Atrás'],
      ['forward', 'Acelerar'],
    ]
    for (const [action, label] of controls) {
      const button = document.createElement('button')
      button.textContent = label
      button.dataset.drive = action
      button.type = 'button'
      button.setAttribute('aria-label', label)
      button.onpointerdown = (e) => {
        e.preventDefault()
        e.stopPropagation()
        button.setPointerCapture(e.pointerId)
        if (action in actions) {
          actions[action as keyof typeof actions]()
          return
        }
        this.held.set(e.pointerId, action)
      }
      const release = (e: PointerEvent) => {
        this.held.delete(e.pointerId)
      }
      button.onpointerup = release
      button.onpointercancel = release
      button.onlostpointercapture = release
      this.root.append(button)
    }
    host.append(this.root)
    window.addEventListener('blur', () => this.clear())
    document.addEventListener('visibilitychange', () => this.clear())
  }
  clear(): void {
    this.held.clear()
  }
  setActive(active: boolean): void {
    this.enabled = active
    if (!active) this.clear()
  }
  input(): { forward: number; right: number; brake: boolean } {
    const held = new Set(this.enabled ? this.held.values() : [])
    return {
      forward: Number(held.has('forward')) - Number(held.has('reverse')),
      right: Number(held.has('right')) - Number(held.has('left')),
      brake: held.has('brake'),
    }
  }
}
