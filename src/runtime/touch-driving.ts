import { createRuntimeText, type RuntimeText } from './messages.js'
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
 width: calc(100% - 20px); pointer-events: none; gap: 10px; align-items: end;
 grid-template-columns: 1fr auto 1fr; }
.touch-driving > style { display: none; }
.touch-driving-bar { grid-column: 2; display: flex; flex-direction: row;
 justify-content: center; gap: 8px; }
.touch-dpad[data-hand="left"] { grid-column: 1; }
.touch-dpad[data-hand="right"] { grid-column: 3; }
.touch-dpad { width: min(42vw, 148px); height: min(42vw, 148px); justify-self: start;
 border: 2px solid #66758d; border-radius: 50%; display: grid; place-items: center;
 grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); gap: 4px;
 padding: 10px; box-sizing: border-box; background: #111827aa; }
.touch-dpad[data-hand="right"] { justify-self: end; }
.touch-dpad span { grid-area: 2 / 2; font: 11px system-ui, sans-serif; color: #89a7bb;
 text-align: center; pointer-events: none; }
.touch-dpad .up { grid-area: 1 / 2; } .touch-dpad .left { grid-area: 2 / 1; }
.touch-dpad .right { grid-area: 2 / 3; } .touch-dpad .down { grid-area: 3 / 2; }
.touch-driving button { pointer-events: auto; touch-action: none; user-select: none;
 min-height: 52px; min-width: 52px; background: #111827dd; color: #fff; border: 1px solid #66758d;
 border-radius: 10px; font: 14px system-ui, sans-serif; }
.touch-dpad button { border-radius: 12px; min-width: 0; padding: 0; font-size: 18px; }
.touch-driving button:active { background: #2563eb; }
.touch-driving.is-idle button { opacity: .55; }
.touch-driving[data-visibility="always"] { display: grid; }
.touch-driving[data-visibility="hidden"] { display: none; }
@media (pointer: coarse) { .touch-driving[data-visibility="auto"] { display: grid; } }
:has(> .touch-driving[data-visibility="always"]) > .nabla-game-hud { bottom: auto; top: 16px; }
@media (pointer: coarse) {
  :has(> .touch-driving[data-visibility="auto"]) > .nabla-game-hud { bottom: auto; top: 16px; }
}
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
    private readonly text: RuntimeText = createRuntimeText(),
  ) {
    this.root.className = 'touch-driving'
    this.root.dataset.visibility = visibility
    const style = document.createElement('style')
    style.textContent = styles
    this.root.append(style)
    this.root.setAttribute('aria-label', this.text('Touch controls'))
    const bar = document.createElement('div')
    bar.className = 'touch-driving-bar'
    const steer = this.pad('left', this.text('Steer'))
    const pedals = this.pad('right', this.text('Pedals'))
    const controls: [string, string, HTMLElement, string?][] = [
      ['play', this.text('Play'), bar],
      ['interact', this.text('Enter / exit'), bar],
      ['camera', this.text('Camera'), bar],
      ['brake', this.text('Brake'), bar],
      ['left', '◀', steer, 'left'],
      ['right', '▶', steer, 'right'],
      ['forward', '▲', pedals, 'up'],
      ['reverse', '▼', pedals, 'down'],
    ]
    for (const [action, label, parent, position] of controls) {
      if (action === 'play' && !actions.play) continue
      const button = document.createElement('button')
      button.textContent = label
      button.dataset.drive = action
      button.type = 'button'
      button.setAttribute('aria-label', label)
      if (position) button.className = position
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
      parent.append(button)
    }
    this.root.append(bar, steer, pedals)
    host.append(this.root)
    const options = { signal: this.lifetime.signal }
    window.addEventListener('blur', () => this.clear(), options)
    window.addEventListener('pagehide', () => this.clear(), options)
    document.addEventListener('visibilitychange', () => this.clear(), options)
    this.setActive(false)
  }
  private pad(hand: 'left' | 'right', label: string): HTMLDivElement {
    const pad = document.createElement('div')
    pad.className = 'touch-dpad'
    pad.dataset.hand = hand
    pad.setAttribute('aria-label', label)
    const caption = document.createElement('span')
    caption.textContent = label
    pad.append(caption)
    return pad
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
  /** True while a steer/pedal/brake pointer is captured. */
  busy(): boolean {
    return this.enabled && this.held.size > 0
  }
  setActive(active: boolean): void {
    this.enabled = active && !this.disposed
    this.root.classList.toggle('is-idle', !this.enabled)
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
