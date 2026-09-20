/**
 * Avatar controller — walk / rocket / driving state machine.
 *
 * Clean design for Engine. Provides Agency-compatible behavior:
 * - Walk on ground with WASD
 * - Jump (Space when grounded)
 * - Rocket thrust (hold F/Shift → Iron Man flight)
 * - Mount/dismount vehicles (E key)
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
 * FPS mouse (standard):
 * - Mouse right (dx > 0) → yaw decreases → view turns right
 * - Mouse up (dy < 0, typical browser) → pitch increases → view looks up
 *
 * WASD:
 * - W = move in camera forward direction (-Z at yaw=0)
 */
import {
  WALK_JUMP_VY,
  WALK_MAX_VY,
  WALK_COYOTE_S,
  WALK_JUMP_BUFFER_S,
  WALK_SPEED,
  WALK_SPRINT_MULT,
  WALK_ACCEL,
  WALK_DECEL,
  WALK_EYE_HEIGHT_MM,
  ROCKET_Y_MAX_M,
  rocketBurnStep,
  rocketAccel,
  walkGrounded,
  approachVelocity,
  walkChaseCamera,
  nextWalkView,
  type WalkView,
  type WalkCamera,
} from './walkBody.js'

export type AvatarMode = 'walk' | 'rocket' | 'driving'

export interface AvatarInput {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  jump: boolean
  sprint: boolean
  rocket: boolean
  mount: boolean
  /** Mouse movement X (positive = rightward on screen) */
  lookDx: number
  /** Mouse movement Y (positive = downward on screen, typical browser convention) */
  lookDy: number
}

export interface AvatarState {
  mode: AvatarMode
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  vx: number
  vy: number
  vz: number
  rocketBurn: number
  coyoteS: number
  jumpBufferS: number
  grounded: boolean
  view: WalkView
}

export function createAvatarState(spawn?: { x?: number; y?: number; z?: number; yaw?: number }): AvatarState {
  return {
    mode: 'walk',
    x: spawn?.x ?? 0,
    y: spawn?.y ?? WALK_EYE_HEIGHT_MM / 1000,
    z: spawn?.z ?? 0,
    yaw: spawn?.yaw ?? 0,
    pitch: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    rocketBurn: 0,
    coyoteS: 0,
    jumpBufferS: 0,
    grounded: true,
    view: 'first',
  }
}

export function emptyAvatarInput(): AvatarInput {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    rocket: false,
    mount: false,
    lookDx: 0,
    lookDy: 0,
  }
}

export const LOOK_SENS = 0.15
export const PITCH_MIN = -89
export const PITCH_MAX = 89

export function stepAvatar(
  state: AvatarState,
  input: AvatarInput,
  dt: number,
  floorY = 0,
): AvatarState {
  if (state.mode === 'driving') {
    return state
  }

  let { x, y, z, yaw, pitch, vx, vy, vz, rocketBurn, coyoteS, jumpBufferS, grounded, mode, view } = state

  // FPS mouse: mouse up (dy < 0) → look up → pitch increases
  // mouse right (dx > 0) → look right → yaw decreases
  pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch - input.lookDy * LOOK_SENS))
  yaw = yaw - input.lookDx * LOOK_SENS
  if (yaw < -180) yaw += 360
  if (yaw > 180) yaw -= 360

  const eyeFloor = floorY + WALK_EYE_HEIGHT_MM / 1000
  grounded = walkGrounded(y, eyeFloor)

  if (grounded) {
    coyoteS = WALK_COYOTE_S
  } else {
    coyoteS = Math.max(0, coyoteS - dt)
  }

  if (input.jump) {
    jumpBufferS = WALK_JUMP_BUFFER_S
  } else {
    jumpBufferS = Math.max(0, jumpBufferS - dt)
  }

  if (jumpBufferS > 0 && coyoteS > 0 && !input.rocket) {
    vy = -WALK_JUMP_VY / 1000  // WALK_JUMP_VY is negative (CSS convention), negate for Y-up
    coyoteS = 0
    jumpBufferS = 0
  }

  if (input.rocket) {
    mode = 'rocket'
  } else if (grounded && rocketBurn <= 0) {
    mode = 'walk'
  }

  rocketBurn = rocketBurnStep(input.rocket, rocketBurn, dt)

  // Apply gravity and rocket thrust
  // rocketAccel returns positive value for gravity (downward force)
  // In Y-up: positive accel should decrease vy (accelerate downward = vy becomes more negative)
  const altMm = Math.max(0, (y - eyeFloor) * 1000)
  if (input.rocket || rocketBurn > 0 || !grounded || vy !== 0) {
    const accel = rocketAccel(input.rocket, altMm, rocketBurn)
    // accel > 0 means gravity pulls down, so subtract from vy
    vy -= (accel / 1000) * dt
    // Terminal velocity clamp: vy can't go below -WALK_MAX_VY (falling too fast)
    if (!input.rocket && rocketBurn <= 0 && vy < -WALK_MAX_VY / 1000) {
      vy = -WALK_MAX_VY / 1000
    }
  }

  // Movement input in camera-local coordinates:
  // forward (W) = -Z direction at yaw=0
  // right (D) = +X direction at yaw=0
  let inputForward = 0, inputRight = 0
  if (input.forward) inputForward += 1
  if (input.backward) inputForward -= 1
  if (input.right) inputRight += 1
  if (input.left) inputRight -= 1
  const inputLen = Math.hypot(inputForward, inputRight)
  if (inputLen > 1) {
    inputForward /= inputLen
    inputRight /= inputLen
  }

  // Convert to world coordinates
  // At yaw=0: forward=-Z, right=+X
  // Yaw rotation around Y axis (positive = CCW from above = turn left)
  const yawRad = (yaw * Math.PI) / 180
  const cos = Math.cos(yawRad)
  const sin = Math.sin(yawRad)
  // forward direction: (-sin(yaw), 0, -cos(yaw))
  // right direction: (cos(yaw), 0, -sin(yaw))
  const worldVx = inputRight * cos - inputForward * sin
  const worldVz = -inputRight * sin - inputForward * cos

  const speed = (WALK_SPEED / 1000) * (input.sprint ? WALK_SPRINT_MULT : 1)
  const targetVx = worldVx * speed
  const targetVz = worldVz * speed

  vx = approachVelocity(vx, targetVx, WALK_ACCEL / 1000, WALK_DECEL / 1000, dt)
  vz = approachVelocity(vz, targetVz, WALK_ACCEL / 1000, WALK_DECEL / 1000, dt)

  x += vx * dt
  z += vz * dt
  y += vy * dt  // positive vy = upward = +Y

  if (y < eyeFloor) {
    y = eyeFloor
    vy = 0
    grounded = true
    if (!input.rocket) {
      mode = 'walk'
    }
  }

  if (y > ROCKET_Y_MAX_M) {
    y = ROCKET_Y_MAX_M
    vy = 0
  }

  return {
    mode,
    x, y, z,
    yaw, pitch,
    vx, vy, vz,
    rocketBurn,
    coyoteS,
    jumpBufferS,
    grounded,
    view,
  }
}

export function avatarCamera(state: AvatarState): WalkCamera {
  const eye: WalkCamera = {
    x: state.x,
    y: state.y,
    z: state.z,
    rx: state.pitch,
    ry: state.yaw,
  }
  if (state.view === 'chase') {
    return walkChaseCamera(eye)
  }
  return eye
}

export function avatarBodyPose(state: AvatarState): { x: number; y: number; z: number; yaw: number } {
  return {
    x: state.x,
    y: state.y - WALK_EYE_HEIGHT_MM / 1000 + 0.9,
    z: state.z,
    yaw: state.yaw,
  }
}

export function cycleAvatarView(state: AvatarState): AvatarState {
  return { ...state, view: nextWalkView(state.view) }
}

export function setAvatarDriving(state: AvatarState, driving: boolean): AvatarState {
  return {
    ...state,
    mode: driving ? 'driving' : 'walk',
    vy: 0,
    rocketBurn: 0,
    coyoteS: 0,
    jumpBufferS: 0,
  }
}

export function teleportAvatar(
  state: AvatarState,
  pos: { x: number; y: number; z: number; yaw?: number },
): AvatarState {
  return {
    ...state,
    x: pos.x,
    y: pos.y,
    z: pos.z,
    yaw: pos.yaw ?? state.yaw,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: true,
  }
}
