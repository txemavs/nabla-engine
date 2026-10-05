import { createRuntimeText, type RuntimeText } from './messages.js'
import { resolveControlProfile, type ControlProfileVehicle } from './control-profiles.js'

export interface TouchDrivingActions {
  play?: () => void
  interact: () => void
  camera: () => void
  /** Host acquires gameplay focus and may unlock audio before reading commands. */
  engage?: () => void
}

export type TouchDrivingVisibility = 'auto' | 'always' | 'hidden'

/** Authored vehicle fields that decide whether the Studio road drive rig applies. */
export type TouchDrivingVehicleSpec = ControlProfileVehicle

/**
 * True when the resolved control profile uses the road rig (cars and trucks).
 * False on foot, in trailers, boats, planes, carriers, or while a flyable vehicle is in flight.
 * Prefer `resolveControlProfile` from `control-profiles.ts` for new code.
 */
export function isRoadTouchDriving(
  vehicle: TouchDrivingVehicleSpec | null | undefined,
  flightMode = false,
): boolean {
  return !!vehicle && resolveControlProfile(vehicle, { flightMode }).touch === 'road'
}

export interface TouchDrivingInput {
  forward: number
  right: number
  brake: boolean
  sprint: boolean
}

/** RC slider: ny −1 at the top (gas), +1 at the bottom (brake). Ported from agency-ui `drive.ts`. */
export function driveSliderThrottle(ny: number): number {
  if (!Number.isFinite(ny)) return 0
  return Math.max(-1, Math.min(1, -ny)) || 0
}

/** Handbrake lever: 0 rest (down) … 1 pulled up. ny −1 is the top of the travel. */
export function driveHandbrakePull(ny: number): number {
  if (!Number.isFinite(ny)) return 0
  return Math.max(0, Math.min(1, 0.5 - ny / 2))
}

/** RC wheel: nx −1 left / +1 right. */
export function driveWheelSteer(nx: number): number {
  if (!Number.isFinite(nx)) return 0
  return Math.max(-1, Math.min(1, nx))
}

/** Polar angle of a wheel gesture. 0 = up, +x = right. */
export function drivePilotAngle(dx: number, dy: number): number {
  if (!dx && !dy) return 0
  return Math.atan2(dx, -dy)
}

/** Twist from a grab: ~135° of rim is full lock. */
export function drivePilotSteer(
  ang: number,
  ang0: number,
  steer0: number,
  span = Math.PI * 0.75,
): number {
  if (!(span > 0)) return Math.max(-1, Math.min(1, steer0))
  let d = ang - ang0
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return Math.max(-1, Math.min(1, steer0 + d / span))
}

function clampUnit(n: number) {
  return Math.max(-1, Math.min(1, n))
}

function unitFromEvent(e: PointerEvent, el: HTMLElement, axis: 'x' | 'y') {
  const r = el.getBoundingClientRect()
  return axis === 'x'
    ? clampUnit((e.clientX - (r.left + r.width / 2)) / (r.width / 2 || 1))
    : clampUnit((e.clientY - (r.top + r.height / 2)) / (r.height / 2 || 1))
}

/**
 * Visual contract ported from agency-ui `AgencyStageDriveRig.vue` (CSS wheel,
 * accelerator rail/knob, red handbrake, turbo). Mapping from `drive.ts`.
 */
const styles = `
.touch-driving { display: none; position: absolute; inset: auto 8px 8px; z-index: 45;
 width: calc(100% - 16px); pointer-events: none; justify-content: space-between;
 align-items: flex-end; }
.touch-driving > style { display: none; }
.touch-driving-bar { display: flex; flex-direction: row; justify-content: center; gap: 8px;
 align-self: end; margin-bottom: 8px; }
.touch-driving-stack, .touch-driving-gas, .touch-driving-lever, .touch-driving-turbo,
.touch-driving-wheel, .touch-driving-pilot { pointer-events: auto; touch-action: none;
 user-select: none; -webkit-user-select: none; }
.touch-driving-stack { display: flex; flex-direction: column; align-items: center; }
.touch-driving-lever { position: relative; width: 56px; height: 72px; margin-bottom: 6px; }
.touch-driving-hb { position: absolute; left: 50%; width: 40px; height: 40px;
 margin: 0 0 0 -20px; border-radius: 50%; display: flex; align-items: center;
 justify-content: center; }
.touch-driving-hb-dot { width: 18px; height: 18px; border-radius: 50%;
 background: radial-gradient(circle at 35% 30%, #ff6a48, #c41810 72%);
 box-shadow: inset 0 1px 0 rgba(255, 220, 200, 0.45); }
.touch-driving-lever.is-on .touch-driving-hb-dot {
 background: radial-gradient(circle at 35% 30%, #ff8a60, #ff2a12 72%);
 box-shadow: 0 0 10px rgba(255, 60, 20, 0.55), inset 0 1px 0 rgba(255, 220, 200, 0.55); }
.touch-driving-turbo { width: 36px; height: 36px; margin: 0 0 8px; padding: 0; border: none;
 border-radius: 50%; cursor: pointer;
 background: radial-gradient(circle at 35% 30%, #6ec8ff, #1568d8 72%);
 box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(200, 230, 255, 0.55); }
.touch-driving-turbo.is-on {
 background: radial-gradient(circle at 35% 30%, #b8e4ff, #1a7cff 68%);
 box-shadow: 0 0 14px rgba(40, 160, 255, 0.75), inset 0 1px 0 rgba(230, 245, 255, 0.7); }
.touch-driving-gas { position: relative; width: 48px; height: 140px; }
.touch-driving-rail { position: absolute; left: 50%; top: 16px; bottom: 16px; width: 4px;
 margin-left: -2px; border-radius: 2px; background: rgba(220, 232, 244, 0.16); }
.touch-driving-knob { position: absolute; left: 50%; width: 40px; height: 40px;
 margin: -20px 0 0 -20px; border-radius: 50%;
 background: radial-gradient(circle at 35% 30%, #f4f7fb, #b8c4d0 70%);
 box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.7);
 transition: top 40ms linear; }
.touch-driving-pilot { position: absolute; left: 50%; top: auto; bottom: 52%; width: 180px;
 height: 180px; margin: 0 0 0 -90px; display: none; }
.touch-driving.is-pilot .touch-driving-pilot { display: block; }
.touch-driving-pilot-ring { display: block; width: 100%; height: 100%; border-radius: 50%;
 border: 2px solid rgba(220, 232, 244, 0.16);
 box-shadow: inset 0 0 0 48px rgba(8, 12, 16, 0.04); pointer-events: none; }
.touch-driving-wheel { width: 148px; height: 148px; }
.touch-driving-rim { display: block; width: 100%; height: 100%; border-radius: 50%;
 border: 14px solid #2a3036;
 box-shadow: inset 0 0 0 6px #0c0e10, 0 4px 16px rgba(0, 0, 0, 0.55);
 background: linear-gradient(90deg, transparent 46%, #1c2024 46%, #1c2024 54%, transparent 54%),
  radial-gradient(circle at 50% 50%, #121518 0 38%, transparent 39%);
 opacity: 0.72; transition: transform 40ms linear; }
.touch-driving button.touch-driving-action { pointer-events: auto; touch-action: none;
 user-select: none; min-height: 52px; min-width: 52px; background: #111827dd; color: #fff;
 border: 1px solid #66758d; border-radius: 10px; font: 14px system-ui, sans-serif; }
.touch-driving button.touch-driving-action:active { background: #2563eb; }
.touch-driving.is-idle { opacity: .72; }
.touch-driving[data-visibility="always"] { display: flex; }
.touch-driving[data-visibility="hidden"] { display: none; }
@media (pointer: coarse) { .touch-driving[data-visibility="auto"] { display: flex; } }
/* Wheel / accel / handbrake / pilot only while seated in a road vehicle (car/truck). */
.touch-driving:not(.is-driving) .touch-driving-stack,
.touch-driving:not(.is-driving) .touch-driving-wheel,
.touch-driving:not(.is-driving) .touch-driving-pilot { display: none; }
:has(> .touch-driving[data-visibility="always"]) > .nabla-game-hud { bottom: auto; top: 16px; }
@media (pointer: coarse) {
  :has(> .touch-driving[data-visibility="auto"]) > .nabla-game-hud { bottom: auto; top: 16px; }
}
`

/** Analog Studio drive rig: wheel, accelerator, red handbrake. Pointer capture always releases. */
export class TouchDriving {
  readonly root = document.createElement('div')
  private held = new Map<number, string>()
  private enabled = false
  private driving = false
  private disposed = false
  private pad = { throttle: 0, steer: 0, handbrake: false, turbo: false }
  private leverPull = 0
  private grab: { ang0: number; steer0: number } | null = null
  private readonly lifetime = new AbortController()
  private readonly knob: HTMLElement
  private readonly rim: HTMLElement
  private readonly lever: HTMLElement
  private readonly hb: HTMLElement
  private readonly turbo: HTMLButtonElement
  constructor(
    host: HTMLElement,
    private readonly actions: TouchDrivingActions,
    visibility: TouchDrivingVisibility = 'auto',
    private readonly text: RuntimeText = createRuntimeText(),
  ) {
    this.root.className = 'touch-driving'
    this.root.dataset.visibility = visibility
    const style = document.createElement('style')
    style.textContent = styles
    this.root.append(style)
    this.root.setAttribute('aria-label', this.text('Touch controls'))

    const stack = document.createElement('div')
    stack.className = 'touch-driving-stack'
    this.lever = document.createElement('div')
    this.lever.className = 'touch-driving-lever'
    this.lever.dataset.drive = 'handbrake'
    this.lever.setAttribute('aria-label', this.text('Handbrake'))
    this.hb = document.createElement('i')
    this.hb.className = 'touch-driving-hb'
    const dot = document.createElement('i')
    dot.className = 'touch-driving-hb-dot'
    this.hb.append(dot)
    this.lever.append(this.hb)
    this.bindPointer(
      this.lever,
      'handbrake',
      (e) => this.applyLever(e),
      () => this.releaseLever(),
    )

    this.turbo = document.createElement('button')
    this.turbo.type = 'button'
    this.turbo.className = 'touch-driving-turbo'
    this.turbo.dataset.drive = 'turbo'
    this.turbo.setAttribute('aria-label', this.text('Turbo'))
    this.turbo.setAttribute('aria-pressed', 'false')
    this.bindPointer(
      this.turbo,
      'turbo',
      () => this.setPad({ turbo: true }),
      () => this.setPad({ turbo: false }),
    )

    const gas = document.createElement('div')
    gas.className = 'touch-driving-gas'
    gas.dataset.drive = 'gas'
    gas.setAttribute('aria-label', this.text('Accelerator'))
    const rail = document.createElement('i')
    rail.className = 'touch-driving-rail'
    this.knob = document.createElement('i')
    this.knob.className = 'touch-driving-knob'
    gas.append(rail, this.knob)
    this.bindPointer(
      gas,
      'gas',
      (e) => this.applyGas(e),
      () => this.setPad({ throttle: 0 }),
    )

    stack.append(this.lever, this.turbo, gas)

    const bar = document.createElement('div')
    bar.className = 'touch-driving-bar'
    for (const [action, label] of [
      ['play', this.text('Play')],
      ['interact', this.text('Enter / exit')],
      ['camera', this.text('Camera')],
    ] as const) {
      if (action === 'play' && !actions.play) continue
      const button = document.createElement('button')
      button.textContent = label
      button.dataset.drive = action
      button.type = 'button'
      button.className = 'touch-driving-action'
      button.setAttribute('aria-label', label)
      button.onpointerdown = (e) => {
        if (this.disposed) return
        e.preventDefault()
        e.stopPropagation()
        actions.engage?.()
        if (!this.enabled && action !== 'play') return
        button.setPointerCapture(e.pointerId)
        this.held.set(e.pointerId, action)
        actions[action]?.()
      }
      const release = (e: PointerEvent) => this.held.delete(e.pointerId)
      button.onpointerup = release
      button.onpointercancel = release
      button.onlostpointercapture = release
      bar.append(button)
    }

    const pilot = document.createElement('div')
    pilot.className = 'touch-driving-pilot'
    pilot.dataset.drive = 'pilot'
    pilot.setAttribute('aria-label', this.text('Steering wheel'))
    const ring = document.createElement('i')
    ring.className = 'touch-driving-pilot-ring'
    pilot.append(ring)
    this.bindPointer(
      pilot,
      'pilot',
      (e) => this.applyPilot(e, pilot),
      () => this.releaseSteer(),
    )

    const wheel = document.createElement('div')
    wheel.className = 'touch-driving-wheel'
    wheel.dataset.drive = 'wheel'
    wheel.setAttribute('aria-label', this.text('Steering wheel'))
    this.rim = document.createElement('i')
    this.rim.className = 'touch-driving-rim'
    wheel.append(this.rim)
    this.bindPointer(
      wheel,
      'wheel',
      (e) => this.applySteer(e),
      () => this.releaseSteer(),
    )

    this.root.append(stack, bar, pilot, wheel)
    host.append(this.root)
    const options = { signal: this.lifetime.signal }
    window.addEventListener('blur', () => this.clear(), options)
    window.addEventListener('pagehide', () => this.clear(), options)
    document.addEventListener('visibilitychange', () => this.clear(), options)
    this.paint()
    this.setActive(false)
  }

  private bindPointer(
    el: HTMLElement,
    key: string,
    apply: (e: PointerEvent) => void,
    release: () => void,
  ) {
    el.onpointerdown = (e) => {
      if (this.disposed) return
      e.preventDefault()
      e.stopPropagation()
      this.actions.engage?.()
      if (!this.enabled) return
      el.setPointerCapture(e.pointerId)
      this.held.set(e.pointerId, key)
      apply(e)
    }
    el.onpointermove = (e) => {
      if (this.held.get(e.pointerId) !== key) return
      apply(e)
    }
    const up = (e: PointerEvent) => {
      if (this.held.get(e.pointerId) !== key) return
      this.held.delete(e.pointerId)
      release()
    }
    el.onpointerup = up
    el.onpointercancel = up
    el.onlostpointercapture = up
  }

  private setPad(partial: Partial<typeof this.pad>) {
    Object.assign(this.pad, partial)
    this.paint()
  }

  private applyGas(e: PointerEvent) {
    this.setPad({
      throttle: driveSliderThrottle(unitFromEvent(e, e.currentTarget as HTMLElement, 'y')),
    })
  }

  private applySteer(e: PointerEvent) {
    this.grab = null
    this.setPad({ steer: driveWheelSteer(unitFromEvent(e, e.currentTarget as HTMLElement, 'x')) })
  }

  private applyPilot(e: PointerEvent, el: HTMLElement) {
    const r = el.getBoundingClientRect()
    const ang = drivePilotAngle(
      e.clientX - (r.left + r.width / 2),
      e.clientY - (r.top + r.height / 2),
    )
    if (!this.grab) this.grab = { ang0: ang, steer0: this.pad.steer }
    this.setPad({ steer: drivePilotSteer(ang, this.grab.ang0, this.grab.steer0) })
  }

  private applyLever(e: PointerEvent) {
    const pull = driveHandbrakePull(unitFromEvent(e, e.currentTarget as HTMLElement, 'y'))
    this.leverPull = pull
    this.setPad({ handbrake: pull > 0.28 })
    this.paint()
  }

  private releaseLever() {
    const latch = this.leverPull >= 0.5
    this.leverPull = latch ? 1 : 0
    this.setPad({ handbrake: latch })
  }

  private releaseSteer() {
    this.grab = null
    this.setPad({ steer: 0 })
  }

  private paint(view: TouchDrivingInput = this.input()) {
    const throttle = clampUnit(view.forward)
    const steer = clampUnit(view.right)
    const pull = Math.max(this.leverPull, view.brake ? 1 : 0)
    this.knob.style.top = `${50 - throttle * 42}%`
    this.rim.style.transform = `rotate(${90 + steer * 75}deg)`
    this.hb.style.bottom = `${4 + pull * 28}px`
    this.lever.classList.toggle('is-on', pull > 0.35)
    this.turbo.classList.toggle('is-on', view.sprint)
    this.turbo.setAttribute('aria-pressed', String(view.sprint))
  }

  /** Follow mixed keyboard/gamepad axes so the knobs move like Studio's driveHud. */
  reflect(axes: Partial<TouchDrivingInput>): void {
    const captured = new Set(this.held.values())
    this.paint({
      forward: captured.has('gas') ? this.pad.throttle : clampUnit(axes.forward ?? 0),
      right:
        captured.has('wheel') || captured.has('pilot')
          ? this.pad.steer
          : clampUnit(axes.right ?? 0),
      brake: captured.has('handbrake') ? this.pad.handbrake : !!(axes.brake || this.pad.handbrake),
      sprint: captured.has('turbo') ? this.pad.turbo : !!(axes.sprint || this.pad.turbo),
    })
  }

  /** Show the cockpit twist ring used in Studio pilot view. */
  setPilot(pilot: boolean): void {
    this.root.classList.toggle('is-pilot', pilot)
  }

  /**
   * Show wheel / accelerator / handbrake only while seated in a road vehicle.
   * Enter / Camera stay available on foot and in ships so touch hosts can board.
   */
  setDriving(driving: boolean): void {
    const next = driving && !this.disposed
    if (this.driving === next) return
    this.driving = next
    this.root.classList.toggle('is-driving', next)
    if (!next) this.clear()
  }

  clear(): void {
    const pointers = [...this.held.keys()]
    this.held.clear()
    this.grab = null
    this.leverPull = 0
    this.pad = { throttle: 0, steer: 0, handbrake: false, turbo: false }
    for (const node of this.root.querySelectorAll<HTMLElement>('[data-drive]')) {
      for (const pointer of pointers) {
        if (node.hasPointerCapture?.(pointer)) node.releasePointerCapture(pointer)
      }
    }
    this.paint()
  }

  /** True while a rig pointer is captured or a latched/held axis is still commanding. */
  busy(): boolean {
    return (
      this.enabled &&
      this.driving &&
      (this.held.size > 0 ||
        this.pad.handbrake ||
        this.pad.turbo ||
        this.pad.throttle !== 0 ||
        this.pad.steer !== 0)
    )
  }

  setActive(active: boolean): void {
    this.enabled = active && !this.disposed
    this.root.classList.toggle('is-idle', !this.enabled)
    if (!active) {
      this.setDriving(false)
      this.clear()
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.setActive(false)
    this.lifetime.abort()
    this.root.remove()
  }

  input(): TouchDrivingInput {
    if (!this.enabled || !this.driving) return { forward: 0, right: 0, brake: false, sprint: false }
    return {
      forward: this.pad.throttle,
      right: this.pad.steer,
      brake: this.pad.handbrake,
      sprint: this.pad.turbo,
    }
  }
}
