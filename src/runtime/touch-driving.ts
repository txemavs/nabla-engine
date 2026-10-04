export interface TouchDrivingActions {
  play?: () => void
  interact: () => void
  camera: () => void
  /** Host acquires gameplay focus and may unlock audio before reading commands. */
  engage?: () => void
}
export type TouchDrivingVisibility = 'auto' | 'always' | 'hidden'
const styles = `
.touch-driving { display: none; position: absolute; inset: auto 10px 16px; z-index: 45;
 grid-template-columns: repeat(4, 1fr); gap: 8px; pointer-events: none; }
.touch-driving button { pointer-events: auto; touch-action: none; user-select: none;
 min-height: 52px; background: #111827dd; color: #fff; border: 1px solid #66758d;
 border-radius: 10px; font: 14px system-ui, sans-serif; }
.touch-driving button:active { background: #2563eb; }
.touch-driving button:disabled { opacity: .35; pointer-events: none; }
.touch-driving[data-visibility="always"] { display: grid; }
.touch-driving[data-visibility="hidden"] { display: none; }
@media (pointer: coarse) { .touch-driving[data-visibility="auto"] { display: grid; } }
`
/** Pointer capture supports simultaneous steering/pedals and always releases cancelled input. */
export class TouchDriving {
  readonly root = document.createElement('div')
  private held = new Map<number, string>()
  private enabled = false
  private disposed = false
  private readonly lifetime = new AbortController()
  constructor(
    host: HTMLElement,
    actions: TouchDrivingActions,
    visibility: TouchDrivingVisibility = 'auto',
  ) {
    this.root.className = 'touch-driving'
    this.root.dataset.visibility = visibility
    const style = document.createElement('style')
    style.textContent = styles
    this.root.append(style)
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
      if (action === 'play' && !actions.play) continue
      const button = document.createElement('button')
      button.textContent = label
      button.dataset.drive = action
      button.type = 'button'
      button.setAttribute('aria-label', label)
      button.onpointerdown = (e) => {
        if (this.disposed) return
        e.preventDefault()
        e.stopPropagation()
        actions.engage?.()
        if (!this.enabled && action !== 'play') return
        button.setPointerCapture(e.pointerId)
        if (action in actions) {
          actions[action as keyof typeof actions]?.()
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
    const options = { signal: this.lifetime.signal }
    window.addEventListener('blur', () => this.clear(), options)
    window.addEventListener('pagehide', () => this.clear(), options)
    document.addEventListener('visibilitychange', () => this.clear(), options)
    this.setActive(false)
  }
  clear(): void {
    const pointers = [...this.held.keys()]
    this.held.clear()
    for (const button of this.root.querySelectorAll('button')) {
      for (const pointer of pointers) {
        if (button.hasPointerCapture(pointer)) button.releasePointerCapture(pointer)
      }
    }
  }
  setActive(active: boolean): void {
    this.enabled = active && !this.disposed
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button'))
      button.disabled = button.dataset.drive !== 'play' && !this.enabled
    if (!active) this.clear()
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.setActive(false)
    this.lifetime.abort()
    this.root.remove()
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
