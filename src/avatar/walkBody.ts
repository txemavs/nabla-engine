/**
 * Walk body physics: jump, gravity, rocket thrust curve.
 *
 * Clean port from Agency walkBody.ts. CSS Y is down in Agency,
 * but we use Y-up metres here for consistency with vehicle physics.
 *
 * Rocket thrust: hold key → burn accumulates → thrust increases quadratically
 * until escape velocity. Release → burn decays → gravity returns.
 */

export const WALK_GRAVITY = 22000
export const WALK_JUMP_VY = -8500
export const WALK_MAX_VY = 18000
export const WALK_COYOTE_S = 0.12
export const WALK_JUMP_BUFFER_S = 0.15
export const WALK_GROUND_SLACK = 50

export const WALK_SPEED = 4800
export const WALK_SPRINT_MULT = 1.8
export const WALK_ACCEL = 32000
export const WALK_DECEL = 24000

export const WALK_EYE_HEIGHT_MM = 1650
export const WALK_BODY_HEIGHT_MM = 1800
export const WALK_BODY_RADIUS_MM = 300

export const ROCKET_ESCAPE_S = 20
export const ROCKET_HOVER = WALK_GRAVITY * 1.25
export const ROCKET_ESCAPE_THRUST = 96_000_000
export const ROCKET_COOL_S = 0.55
export const ROCKET_Y_MAX_M = 11_000_000

export const WALK_CHASE_BACK_MM = 2400
export const WALK_CHASE_LIFT_MM = 800

export type WalkView = 'first' | 'chase'
export const WALK_VIEWS: WalkView[] = ['first', 'chase']

export function nextWalkView(view: WalkView): WalkView {
  return view === 'first' ? 'chase' : 'first'
}

export function rocketBurnStep(held: boolean, burnS: number, dt: number): number {
  if (held) return Math.min(ROCKET_ESCAPE_S, burnS + dt)
  return Math.max(0, burnS - dt / ROCKET_COOL_S)
}

export function rocketThrust(burnS: number): number {
  const p = Math.min(1, Math.max(0, burnS / ROCKET_ESCAPE_S))
  return ROCKET_HOVER + (ROCKET_ESCAPE_THRUST - ROCKET_HOVER) * p * p
}

export function rocketGravity(_altMm: number, burnS: number): number {
  if (burnS >= ROCKET_ESCAPE_S) return 0
  const fade = 1 - Math.min(1, burnS / ROCKET_ESCAPE_S)
  return WALK_GRAVITY * fade * fade
}

export function rocketAccel(held: boolean, altMm: number, burnS: number): number {
  const g = rocketGravity(altMm, burnS)
  const thrust = held ? rocketThrust(burnS) : 0
  return g - thrust
}

export function walkGrounded(y: number, floorY: number, slack = WALK_GROUND_SLACK): boolean {
  return y <= floorY + slack / 1000
}

export interface WalkCamera {
  x: number
  y: number
  z: number
  rx: number
  ry: number
}

export function walkChaseCamera(eye: WalkCamera): WalkCamera {
  const yaw = (-eye.ry * Math.PI) / 180
  const pr = (eye.rx * Math.PI) / 180
  const cp = Math.cos(pr)
  const fwdX = Math.sin(yaw) * cp
  const fwdZ = -Math.cos(yaw) * cp
  const backM = WALK_CHASE_BACK_MM / 1000
  const liftM = WALK_CHASE_LIFT_MM / 1000
  return {
    x: eye.x - fwdX * backM,
    y: eye.y + liftM + backM * Math.sin(pr),
    z: eye.z - fwdZ * backM,
    rx: eye.rx,
    ry: eye.ry,
  }
}

export function approachVelocity(
  current: number,
  target: number,
  accel: number,
  decel: number,
  dt: number,
): number {
  if (Math.abs(target) < 0.001 && Math.abs(current) < 0.001) return 0
  const diff = target - current
  const rate = Math.abs(target) >= Math.abs(current) ? accel : decel
  const step = rate * dt
  if (Math.abs(diff) <= step) return target
  return current + Math.sign(diff) * step
}
