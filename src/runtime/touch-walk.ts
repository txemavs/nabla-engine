import { createRuntimeText, type RuntimeText } from './messages.js'

export type TouchWalkVisibility = 'auto' | 'always' | 'hidden'

/** One stick, -1..1 per axis: x right, y down (screen). */
export interface TouchStick {
  x: number
  y: number
}

export interface TouchWalkInput {
  /** Walk forward (+) / back (−), -1..1. */
  forward: number
  /** Strafe right (+) / left (−), -1..1. */
  right: number
  /** Look stick: x turns (right +), y pitches (down +). */
  look: TouchStick
}

/** Look-stick turn rate at full deflection, radians per second. */
export const touchLookRate = 2.4
/** Look-stick pitch rate at full deflection, radians per second. */
export const touchLookPitchRate = 1.4

/** Pointer offset from the well centre to a unit stick, clamped to the circle. */
export function stickFromOffset(dx: number, dy: number, radius: number): TouchStick {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !(radius > 0)) return { x: 0, y: 0 }
  const len = Math.hypot(dx, dy)
  const s = len > radius ? radius / len : 1
  return { x: (dx * s) / radius, y: (dy * s) / radius }
}

/** Walking axes from the move stick (screen up = forward). */
export function walkFromStick(stick: TouchStick): { forward: number; right: number } {
  return { forward: -stick.y || 0, right: stick.x || 0 }
}

/**
 * Agency-style on-foot touch rig (agency-ui `AgencyStageWalkRig.vue`): two soft round pads,
 * left moves, right looks. Knob styled like the drive rig's throttle knob. Shown on touch /
 * no-hover devices (`auto`) and only while the host marks it active (walking).
 */
const styles = `
.touch-walk { display: none; position: absolute; inset: auto 0 0; z-index: 44;
 justify-content: space-between; align-items: flex-end; padding: 0 20px 20px;
 pointer-events: none; }
.touch-walk > style { display: none; }
.touch-walk-well { position: relative; width: 132px; height: 132px; border-radius: 50%;
 pointer-events: auto; touch-action: none; user-select: none; -webkit-user-select: none;
 border: 2px solid rgba(220, 232, 244, 0.16); background: rgba(8, 12, 16, 0.12);
 box-shadow: inset 0 0 18px rgba(220, 232, 244, 0.06); box-sizing: border-box; }
.touch-walk-knob { position: absolute; left: 50%; top: 50%; width: 40px; height: 40px;
 margin: -20px 0 0 -20px; border-radius: 50%;
 background: radial-gradient(circle at 35% 30%, #f4f7fb, #b8c4d0 70%);
 box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.7);
 pointer-events: none; }
.touch-walk[data-visibility="always"] { display: flex; }
.touch-walk[data-visibility="hidden"] { display: none; }
@media (pointer: coarse), (hover: none) { .touch-walk[data-visibility="auto"] { display: flex; } }
/* The visibility rules above beat the UA [hidden] style, so hiding needs its own rule. */
.touch-walk[hidden] { display: none !important; }
`

/** Twin walking sticks ("setas"). Pointer capture always releases. */
export class TouchWalk {
  readonly root = document.createElement('div')
  private readonly knobs: Record<'move' | 'look', HTMLElement>
  private readonly sticks: Record<'move' | 'look', TouchStick> = {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
  }
  private readonly held: Record<'move' | 'look', number | null> = { move: null, look: null }
  private readonly lifetime = new AbortController()
  private enabled = false
  private disposed = false

  constructor(
    host: HTMLElement,
    visibility: TouchWalkVisibility = 'auto',
    private readonly text: RuntimeText = createRuntimeText(),
  ) {
    this.root.className = 'touch-walk'
    this.root.dataset.visibility = visibility
    const style = document.createElement('style')
    style.textContent = styles
    this.root.append(style)
    const well = (side: 'move' | 'look', label: string) => {
      const el = document.createElement('div')
      el.className = 'touch-walk-well'
      el.dataset.stick = side
      el.setAttribute('aria-label', this.text(label))
      const knob = document.createElement('i')
      knob.className = 'touch-walk-knob'
      el.append(knob)
      this.bind(el, side)
      this.root.append(el)
      return knob
    }
    this.knobs = { move: well('move', 'Move'), look: well('look', 'Look') }
    host.append(this.root)
    const options = { signal: this.lifetime.signal }
    window.addEventListener('blur', () => this.clear(), options)
    window.addEventListener('pagehide', () => this.clear(), options)
    document.addEventListener('visibilitychange', () => this.clear(), options)
    this.setActive(false)
  }

  private bind(el: HTMLElement, side: 'move' | 'look'): void {
    const options = { signal: this.lifetime.signal }
    const apply = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const radius = Math.max(24, Math.min(r.width, r.height) / 2 - 20)
      this.sticks[side] = stickFromOffset(
        e.clientX - (r.left + r.width / 2),
        e.clientY - (r.top + r.height / 2),
        radius,
      )
      this.paint()
    }
    el.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.enabled) return
        e.preventDefault()
        e.stopPropagation()
        this.held[side] = e.pointerId
        el.setPointerCapture?.(e.pointerId)
        apply(e)
      },
      options,
    )
    el.addEventListener(
      'pointermove',
      (e) => {
        if (this.held[side] === e.pointerId) apply(e)
      },
      options,
    )
    const release = (e: PointerEvent) => {
      if (this.held[side] !== e.pointerId) return
      this.held[side] = null
      this.sticks[side] = { x: 0, y: 0 }
      this.paint()
    }
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
      el.addEventListener(type, release, options)
  }

  private paint(): void {
    for (const side of ['move', 'look'] as const) {
      const { x, y } = this.sticks[side]
      this.knobs[side].style.transform = `translate(${x * 42}px, ${y * 42}px)`
    }
  }

  clear(): void {
    this.held.move = this.held.look = null
    this.sticks.move = { x: 0, y: 0 }
    this.sticks.look = { x: 0, y: 0 }
    this.paint()
  }

  busy(): boolean {
    return this.enabled && (this.held.move !== null || this.held.look !== null)
  }

  setActive(active: boolean): void {
    this.enabled = active && !this.disposed
    this.root.hidden = !this.enabled
    if (!this.enabled) this.clear()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.setActive(false)
    this.lifetime.abort()
    this.root.remove()
  }

  input(): TouchWalkInput {
    if (!this.enabled) return { forward: 0, right: 0, look: { x: 0, y: 0 } }
    return { ...walkFromStick(this.sticks.move), look: { ...this.sticks.look } }
  }
}
