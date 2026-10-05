import { createRuntimeText, type RuntimeText } from './messages.js'

export interface TouchFlightActions {
  play?: () => void
  interact: () => void
  camera: () => void
  engage?: () => void
}

export type TouchFlightVisibility = 'auto' | 'always' | 'hidden'

export interface TouchFlightInput {
  forward: number
  right: number
  lift: number
  turn: number
  brake: boolean
}

/** Mode 2 stick to flight axes. Throttle 0..1 (0.5 hover) becomes signed lift. */
export function flightFromMode2(pad: {
  yaw: number
  throttle: number
  roll: number
  pitch: number
}): Omit<TouchFlightInput, 'brake'> {
  const clamp = (n: number) => Math.max(-1, Math.min(1, n))
  return {
    turn: clamp(pad.yaw),
    lift: clamp((pad.throttle - 0.5) * 2),
    right: clamp(pad.roll),
    forward: clamp(pad.pitch),
  }
}

const styles = `
.touch-flight { display: none; position: absolute; inset: auto 8px 8px; z-index: 45;
 width: calc(100% - 16px); pointer-events: none; justify-content: space-between;
 align-items: flex-end; }
.touch-flight > style { display: none; }
.touch-flight-bar { position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%);
 display: flex; flex-direction: row; justify-content: center; gap: 8px; pointer-events: none; }
.touch-flight-col { pointer-events: auto; touch-action: none; user-select: none;
 display: flex; flex-direction: column; gap: 6px; align-items: center; }
.touch-flight-label { font: 10px/1 system-ui, sans-serif; letter-spacing: 0.08em;
 text-transform: uppercase; color: rgba(255, 187, 0, 0.75); }
.touch-flight-stick { position: relative; width: min(28vw, 112px); height: min(28vw, 112px);
 border: 2px solid rgba(255, 187, 0, 0.35); border-radius: 50%;
 background: #111827aa; box-sizing: border-box; }
.touch-flight-knob { position: absolute; width: 28px; height: 28px; margin: -14px 0 0 -14px;
 border-radius: 50%; background: #ffbb00; pointer-events: none;
 box-shadow: 0 0 10px rgba(255, 187, 0, 0.45); left: 50%; top: 50%; }
.touch-flight button { pointer-events: auto; touch-action: none; user-select: none;
 min-height: 48px; min-width: 52px; background: #111827dd; color: #fff;
 border: 1px solid #66758d; border-radius: 10px; font: 14px system-ui, sans-serif; }
.touch-flight button:active { background: #2563eb; }
.touch-flight.is-idle button, .touch-flight.is-idle .touch-flight-stick { opacity: .55; }
.touch-flight[data-visibility="always"] { display: flex; }
.touch-flight[data-visibility="hidden"] { display: none; }
@media (pointer: coarse) { .touch-flight[data-visibility="auto"] { display: flex; } }
/* The visibility rules above beat the UA [hidden] style, so hiding needs its own rule. */
.touch-flight[hidden] { display: none !important; }
`

/**
 * Agency-style Mode 2 fly rig for the 10x5 carrier: left yaw/throttle, right pitch/roll.
 * Car wheel/accel HUD stays in TouchDriving and is hidden while this is active.
 */
export class TouchFlight {
  readonly root = document.createElement('div')
  private enabled = false
  private disposed = false
  private readonly lifetime = new AbortController()
  private leftId: number | null = null
  private rightId: number | null = null
  private brakeHeld = false
  private pad = { yaw: 0, throttle: 0.5, roll: 0, pitch: 0 }
  private readonly leftKnob: HTMLElement
  private readonly rightKnob: HTMLElement

  constructor(
    host: HTMLElement,
    actions: TouchFlightActions,
    visibility: TouchFlightVisibility = 'auto',
    private readonly text: RuntimeText = createRuntimeText(),
  ) {
    this.root.className = 'touch-flight'
    this.root.dataset.visibility = visibility
    const style = document.createElement('style')
    style.textContent = styles
    this.root.append(style)
    this.root.setAttribute('aria-label', this.text('Flight controls'))

    const bar = document.createElement('div')
    bar.className = 'touch-flight-bar'
    for (const [action, label] of [
      ['play', this.text('Play')],
      ['interact', this.text('Enter / exit')],
      ['camera', this.text('Camera')],
      ['brake', this.text('Brake')],
    ] as const) {
      if (action === 'play' && !actions.play) continue
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.dataset.flight = action
      button.setAttribute('aria-label', label)
      button.onpointerdown = (e) => {
        if (this.disposed) return
        e.preventDefault()
        e.stopPropagation()
        actions.engage?.()
        if (!this.enabled && action !== 'play') return
        if (action === 'brake') {
          button.setPointerCapture(e.pointerId)
          this.brakeHeld = true
          return
        }
        if (action in actions) actions[action as keyof TouchFlightActions]?.()
      }
      const release = () => {
        if (action === 'brake') this.brakeHeld = false
      }
      button.onpointerup = release
      button.onpointercancel = release
      button.onlostpointercapture = release
      bar.append(button)
    }

    const left = this.stick('left', this.text('Climb / yaw'))
    const right = this.stick('right', this.text('Pitch / roll'))
    this.leftKnob = left.knob
    this.rightKnob = right.knob
    this.bindStick(left.el, 'left')
    this.bindStick(right.el, 'right')
    this.root.append(left.col, bar, right.col)
    host.append(this.root)
    const options = { signal: this.lifetime.signal }
    window.addEventListener('blur', () => this.clear(), options)
    window.addEventListener('pagehide', () => this.clear(), options)
    document.addEventListener('visibilitychange', () => this.clear(), options)
    this.paint()
    this.setActive(false)
  }

  private stick(hand: 'left' | 'right', label: string) {
    const col = document.createElement('div')
    col.className = 'touch-flight-col'
    col.dataset.hand = hand
    const caption = document.createElement('div')
    caption.className = 'touch-flight-label'
    caption.textContent = label
    const el = document.createElement('div')
    el.className = 'touch-flight-stick'
    el.setAttribute('aria-label', label)
    const knob = document.createElement('i')
    knob.className = 'touch-flight-knob'
    el.append(knob)
    col.append(caption, el)
    return { col, el, knob }
  }

  private bindStick(el: HTMLElement, hand: 'left' | 'right') {
    const apply = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const nx = Math.max(
        -1,
        Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2 || 1)),
      )
      const ny = Math.max(
        -1,
        Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2 || 1)),
      )
      if (hand === 'left') {
        this.pad.yaw = nx
        this.pad.throttle = Math.max(0, Math.min(1, 0.5 - ny / 2))
      } else {
        this.pad.roll = nx
        this.pad.pitch = -ny
      }
      this.paint()
    }
    el.onpointerdown = (e) => {
      if (this.disposed) return
      e.preventDefault()
      e.stopPropagation()
      if (!this.enabled) return
      el.setPointerCapture(e.pointerId)
      if (hand === 'left') this.leftId = e.pointerId
      else this.rightId = e.pointerId
      apply(e)
    }
    el.onpointermove = (e) => {
      if (!el.hasPointerCapture(e.pointerId)) return
      apply(e)
    }
    const release = (e: PointerEvent) => {
      if (hand === 'left' && this.leftId === e.pointerId) {
        this.leftId = null
        this.pad.yaw = 0
        this.pad.throttle = 0.5
      }
      if (hand === 'right' && this.rightId === e.pointerId) {
        this.rightId = null
        this.pad.roll = 0
        this.pad.pitch = 0
      }
      this.paint()
    }
    el.onpointerup = release
    el.onpointercancel = release
    el.onlostpointercapture = release
  }

  private paint(): void {
    const place = (knob: HTMLElement, x: number, y: number) => {
      knob.style.left = `${50 + x * 38}%`
      knob.style.top = `${50 - y * 38}%`
    }
    place(this.leftKnob, this.pad.yaw, this.pad.throttle * 2 - 1)
    place(this.rightKnob, this.pad.roll, this.pad.pitch)
  }

  clear(): void {
    this.leftId = this.rightId = null
    this.brakeHeld = false
    this.pad = { yaw: 0, throttle: 0.5, roll: 0, pitch: 0 }
    this.paint()
  }

  busy(): boolean {
    return this.enabled && (this.leftId !== null || this.rightId !== null || this.brakeHeld)
  }

  setActive(active: boolean): void {
    this.enabled = active && !this.disposed
    this.root.classList.toggle('is-idle', !this.enabled)
    this.root.hidden = !active
    if (!active) this.clear()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.setActive(false)
    this.lifetime.abort()
    this.root.remove()
  }

  input(): TouchFlightInput {
    const axes = this.enabled
      ? flightFromMode2(this.pad)
      : { forward: 0, right: 0, lift: 0, turn: 0 }
    return { ...axes, brake: this.enabled && this.brakeHeld }
  }
}
