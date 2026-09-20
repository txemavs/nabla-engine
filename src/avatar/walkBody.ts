/**
 * Walk body physics: jump, gravity, rocket thrust curve.
 *
 * ## Coordinate System (glTF/Blender standard)
 *
 * Right-handed, Y-up, metres:
 * - +X right
 * - +Y up
 * - -Z forward (camera looks -Z at yaw=0, pitch=0)
 *
 * Camera angles (degrees):
 * - yaw (ry): rotation around Y. yaw=0 → look -Z. Positive → turn left (CCW from above)
 * - pitch (rx): rotation around X. Positive → look up
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

export const WALK_CHASE_BACK_MM = 5000  // 5m back for clearer 3rd person view
export const WALK_CHASE_LIFT_MM = 2000  // 2m lift

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

/**
 * Chase camera: positioned behind and above the avatar.
 *
 * At yaw=0, pitch=0: avatar looks -Z, camera is at +Z relative to avatar.
 * Forward direction = (-sin(yaw), 0, -cos(yaw)) at pitch=0
 * Camera goes backward = opposite of forward = (+sin(yaw), 0, +cos(yaw))
 */
export function walkChaseCamera(eye: WalkCamera): WalkCamera {
  const yawRad = (eye.ry * Math.PI) / 180
  const pitchRad = (eye.rx * Math.PI) / 180
  
  // Forward direction at this yaw (ignoring pitch for horizontal back offset)
  const fwdX = -Math.sin(yawRad)
  const fwdZ = -Math.cos(yawRad)
  
  const backM = WALK_CHASE_BACK_MM / 1000
  const liftM = WALK_CHASE_LIFT_MM / 1000
  
  // Camera positioned behind (opposite of forward) and lifted
  return {
    x: eye.x - fwdX * backM,  // subtract forward = go backward
    y: eye.y + liftM + backM * Math.sin(pitchRad),
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
