/**
 * Drive — enter/exit vehicles, cameras, and state contracts.
 *
 * Clean rewrite from Agency drive.ts. Provides:
 * - DriveState: current vehicle state for rendering
 * - DriveInput: throttle/steer/handbrake from input system
 * - Enter/exit logic (nearest driveable, exit position)
 * - Chase/pilot/top cameras
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
 * Vehicle forward: -Z in local space (nose points -Z at yaw=0)
 *
 * FPS mouse (standard):
 * - Mouse right (dx > 0) → yaw decreases → view turns right
 * - Mouse up (dy < 0) → pitch increases → view looks up
 */
import type { CarPackMounts } from './carPack.js'

export const DRIVE_NEAR_M = 4
export const DRIVE_CABIN_Y_M = 0.9
export const DRIVE_CHASE_BACK_M = 6
export const DRIVE_CHASE_UP_M = 2.5
export const DRIVE_FAR_BACK_M = 12
export const DRIVE_FAR_UP_M = 4
export const DRIVE_TOP_H_M = 25
export const DRIVE_TOP_H_MIN = 8
export const DRIVE_TOP_H_MAX = 80
export const DRIVE_TOP_WHEEL = 0.002
export const DRIVE_TOP_MOUSE_CLIMB = 0.003
export const DRIVE_TOP_TILT_MAX = 10
export const DRIVE_TOP_TILT_SENS = 0.08
export const DRIVE_TOP_NADIR_DEG = 0.5
export const DRIVE_LOOK_SENS = 0.15
export const DRIVE_PITCH_MIN = -25
export const DRIVE_PITCH_MAX = 45

export type DriveView = 'chase' | 'pilot' | 'far' | 'top'
export const DRIVE_VIEWS: DriveView[] = ['chase', 'pilot', 'far', 'top']

export interface DriveInput {
  throttle: number
  steer: number
  recover?: boolean
  handbrake?: boolean
  turbo?: boolean
}

export interface DriveState {
  id: string
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  roll: number
  qx: number
  qy: number
  qz: number
  qw: number
  vx: number
  vz: number
  focusHeight: number
  headingDeg: number
  isHull: boolean
}

export interface DriveLook {
  yaw: number
  pitch: number
  topH: number
}

export interface DriveCamera {
  x: number
  y: number
  z: number
  rx: number
  ry: number
}

export function identityDriveLook(): DriveLook {
  return { yaw: 0, pitch: 0, topH: DRIVE_TOP_H_M }
}

function clampTopH(h: number): number {
  return Math.max(DRIVE_TOP_H_MIN, Math.min(DRIVE_TOP_H_MAX, h))
}

function scaleTopH(h: number, dy: number, k: number): number {
  return clampTopH(h * Math.exp(dy * k))
}

/**
 * Update DriveLook from mouse delta.
 *
 * Standard FPS mouse:
 * - dx > 0 (mouse right) → yaw decreases → view turns right
 * - dy > 0 (mouse down on screen, typical browser) → pitch decreases → view looks down
 */
export function driveLookDelta(
  look: DriveLook,
  dx: number,
  dy: number,
  view: DriveView = 'chase',
): DriveLook {
  if (view === 'top') {
    // Top view: mouse controls tilt and zoom
    let pitch = look.pitch - dy * DRIVE_TOP_TILT_SENS  // mouse up = more tilt
    let topH = look.topH
    if (pitch > DRIVE_TOP_TILT_MAX) {
      const extra = (pitch - DRIVE_TOP_TILT_MAX) / DRIVE_TOP_TILT_SENS
      pitch = DRIVE_TOP_TILT_MAX
      topH = scaleTopH(topH, extra, DRIVE_TOP_MOUSE_CLIMB)
    } else if (pitch < 0) {
      const extra = pitch / DRIVE_TOP_TILT_SENS
      pitch = 0
      topH = scaleTopH(topH, extra, DRIVE_TOP_MOUSE_CLIMB)
    }
    return { yaw: 0, pitch, topH }
  }
  // dx > 0 = mouse right = turn view right = yaw decreases
  let yaw = look.yaw - dx * DRIVE_LOOK_SENS
  if (yaw <= -180) yaw += 360
  if (yaw > 180) yaw -= 360
  // dy > 0 = mouse down = look down = pitch decreases
  const newPitch = Math.max(DRIVE_PITCH_MIN, Math.min(DRIVE_PITCH_MAX, look.pitch - dy * DRIVE_LOOK_SENS))
  return { ...look, yaw, pitch: newPitch }
}

export function driveLookDolly(look: DriveLook, deltaY: number): DriveLook {
  return { ...look, topH: scaleTopH(look.topH, deltaY, DRIVE_TOP_WHEEL) }
}

export function nextDriveView(view: DriveView): DriveView {
  return DRIVE_VIEWS[(DRIVE_VIEWS.indexOf(view) + 1) % DRIVE_VIEWS.length] ?? 'chase'
}

export function resetDriveLook(look: DriveLook = identityDriveLook()): DriveLook {
  return { ...identityDriveLook(), topH: look.topH }
}

/**
 * Vehicle forward direction on XZ plane.
 * At yaw=0, forward is -Z: returns (0, -1).
 * Positive yaw = turn left (CCW from above).
 */
export function driveForward(yawDeg: number): { x: number; z: number } {
  const t = (yawDeg * Math.PI) / 180
  return { x: -Math.sin(t), z: -Math.cos(t) }
}

/**
 * Vehicle right direction on XZ plane.
 * At yaw=0, right is +X: returns (1, 0).
 */
export function driveRight(yawDeg: number): { x: number; z: number } {
  const t = (yawDeg * Math.PI) / 180
  return { x: Math.cos(t), z: -Math.sin(t) }
}

function rotateYpr(
  yawDeg: number,
  pitchDeg: number,
  rollDeg: number,
  local: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const y = (yawDeg * Math.PI) / 180
  const p = (pitchDeg * Math.PI) / 180
  const r = (rollDeg * Math.PI) / 180
  const cy = Math.cos(y), sy = Math.sin(y)
  const cp = Math.cos(p), sp = Math.sin(p)
  const cr = Math.cos(r), sr = Math.sin(r)
  const m00 = cy * cp
  const m01 = cy * sp * sr - sy * cr
  const m02 = cy * sp * cr + sy * sr
  const m10 = sy * cp
  const m11 = sy * sp * sr + cy * cr
  const m12 = sy * sp * cr - cy * sr
  const m20 = -sp
  const m21 = cp * sr
  const m22 = cp * cr
  return {
    x: m00 * local.x + m01 * local.y + m02 * local.z,
    y: m10 * local.x + m11 * local.y + m12 * local.z,
    z: m20 * local.x + m21 * local.y + m22 * local.z,
  }
}

export function driveLookYaw(state: Pick<DriveState, 'yaw' | 'headingDeg'>): number {
  return state.yaw + state.headingDeg
}

export function driveChaseFocus(state: DriveState): { x: number; y: number; z: number } {
  return { x: state.x, y: state.y + state.focusHeight, z: state.z }
}

/**
 * Compute camera angles to look from eye (ex,ey,ez) toward look-at (lx,ly,lz).
 *
 * Returns yaw (ry) and pitch (rx) in our convention:
 * - yaw=0 → looking -Z
 * - positive pitch → looking up
 */
function lookCam(
  ex: number, ey: number, ez: number,
  lx: number, ly: number, lz: number,
): DriveCamera {
  const dx = lx - ex
  const dy = ly - ey
  const dz = lz - ez
  const horiz = Math.hypot(dx, dz) || 1
  // yaw: atan2 of forward vector. At yaw=0 we look toward -Z.
  // Forward = (dx, dz). If dx=0, dz<0, we're looking -Z → yaw=0.
  // atan2(-dx, -dz) gives 0 when looking toward -Z.
  let ry = (Math.atan2(-dx, -dz) * 180) / Math.PI
  if (ry <= -180) ry += 360
  if (ry > 180) ry -= 360
  // pitch: positive = looking up. atan2(dy, horiz).
  const rx = (Math.atan2(dy, horiz) * 180) / Math.PI
  return { x: ex, y: ey, z: ez, rx, ry }
}

export function drivePilotEye(
  state: DriveState,
  mounts: CarPackMounts,
): { x: number; y: number; z: number } {
  const local = mounts.eye1p
  const r = rotateYpr(state.yaw, state.pitch, state.roll, local)
  return { x: state.x + r.x, y: state.y + r.y, z: state.z + r.z }
}

export function driveCamera(
  state: DriveState,
  mounts: CarPackMounts,
  view: DriveView = 'chase',
  look: DriveLook = identityDriveLook(),
): DriveCamera {
  const heading = driveLookYaw(state)
  const fwd = driveForward(heading)
  const focus = driveChaseFocus(state)
  const orbit = driveForward(heading + look.yaw)

  if (view === 'top') {
    const tilt = Math.max(0, Math.min(DRIVE_TOP_TILT_MAX, look.pitch))
    const deg = Math.max(tilt, DRIVE_TOP_NADIR_DEG)
    const span = look.topH * Math.tan((deg * Math.PI) / 180)
    return lookCam(
      focus.x,
      focus.y + look.topH,
      focus.z,
      focus.x + fwd.x * span,
      focus.y,
      focus.z + fwd.z * span,
    )
  }

  if (view === 'pilot') {
    const eye = drivePilotEye(state, mounts)
    // Look forward (local -Z) with additional look offset
    if (state.isHull) {
      const ahead = rotateYpr(
        state.yaw + look.yaw,
        state.pitch + look.pitch,
        state.roll,
        { x: 0, y: 0, z: -8 },  // forward is -Z
      )
      return lookCam(eye.x, eye.y, eye.z, state.x + ahead.x, state.y + ahead.y, state.z + ahead.z)
    }
    // For non-hull vehicles, look along heading direction
    const lookDir = rotateYpr(heading + look.yaw, look.pitch, 0, { x: 0, y: 0, z: -8 })
    return lookCam(eye.x, eye.y, eye.z, eye.x + lookDir.x, eye.y + lookDir.y, eye.z + lookDir.z)
  }

  const back = view === 'far' ? DRIVE_FAR_BACK_M : DRIVE_CHASE_BACK_M
  const up = view === 'far' ? DRIVE_FAR_UP_M : DRIVE_CHASE_UP_M
  const base = Math.atan2(up, back)
  const pitch = base + (look.pitch * Math.PI) / 180
  const dist = Math.hypot(back, up)
  const horiz = Math.cos(pitch) * dist

  return lookCam(
    focus.x - orbit.x * horiz,
    focus.y + Math.sin(pitch) * dist,
    focus.z - orbit.z * horiz,
    focus.x,
    focus.y,
    focus.z,
  )
}

export function driveExitPosition(
  state: DriveState,
  mounts: CarPackMounts,
): { x: number; y: number; z: number; yaw: number } {
  const heading = driveLookYaw(state)
  const right = driveRight(heading)
  const avatarWorld = rotateYpr(state.yaw, state.pitch, state.roll, mounts.avatar)
  return {
    x: state.x + avatarWorld.x + right.x * 2,
    y: 0,
    z: state.z + avatarWorld.z + right.z * 2,
    yaw: heading + 180,
  }
}

export function driveMoving(state: DriveState): boolean {
  return Math.hypot(state.vx, state.vz) > 0.04
}

export interface DriveableEntity {
  id: string
  x: number
  z: number
  isDriveable: boolean
  isHull: boolean
}

export function nearestDriveable(
  camX: number,
  camZ: number,
  entities: DriveableEntity[],
  maxM = DRIVE_NEAR_M,
): DriveableEntity | null {
  let best: DriveableEntity | null = null
  let bestD = Infinity
  for (const e of entities) {
    if (!e.isDriveable) continue
    const reach = e.isHull ? 12 : maxM
    const d = Math.hypot(e.x - camX, e.z - camZ)
    if (d <= reach && d < bestD) {
      best = e
      bestD = d
    }
  }
  return best
}
