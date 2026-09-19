/**
 * Pose types and camera utilities.
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   schema/pose.ts
 *
 * This file extracts only the 3D/camera/helm-relevant portions.
 * 2D chrome, carousel, shelf, and Vue-specific helpers are left for Desktop.
 *
 * Coordinates:
 *   1 px = 1 mm.  +X right.  +Y down (CSS).  +Z toward the seat.
 */
import { SCREEN_BASE_Y, defaultEyeY, NOMINAL_VIEWPORT_H } from './world.js'

/**
 * Structured transform. Numbers only — Vue writes the CSS.
 */
export interface Pose {
  x?: number
  y?: number
  z?: number
  rx?: number
  ry?: number
  rz?: number
  scale?: number
}

export type DesktopProjection = 'flat' | 'perspective'

export const IDENTITY_POSE: Required<Pose> = {
  x: 0,
  y: 0,
  z: 0,
  rx: 0,
  ry: 0,
  rz: 0,
  scale: 1,
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function parsePose(raw: unknown): Pose {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const o = raw as Record<string, unknown>
  const pose: Pose = {}
  if ('x' in o) pose.x = finite(o.x, 0)
  if ('y' in o) pose.y = finite(o.y, 0)
  if ('z' in o) pose.z = finite(o.z, 0)
  if ('rx' in o) pose.rx = finite(o.rx, 0)
  if ('ry' in o) pose.ry = finite(o.ry, 0)
  if ('rz' in o) pose.rz = finite(o.rz, 0)
  if ('scale' in o) pose.scale = finite(o.scale, 1)
  return pose
}

export function isIdentityPose(pose: Pose): boolean {
  return (
    (pose.x ?? 0) === 0 &&
    (pose.y ?? 0) === 0 &&
    (pose.z ?? 0) === 0 &&
    (pose.rx ?? 0) === 0 &&
    (pose.ry ?? 0) === 0 &&
    (pose.rz ?? 0) === 0 &&
    (pose.scale ?? 1) === 1
  )
}

/** Helm = FPS seat. Edit = orbit the floor origin, no head. */
export type StageMode = 'helm' | 'edit'

export function parseStageMode(raw: unknown): StageMode {
  return raw === 'edit' ? 'edit' : 'helm'
}

/** Stage orbit camera state. */
export interface StageOrbit {
  yaw: number
  pitch: number
  distance: number
}

/** Outside the hull, slightly off-axis, looking at the floor origin. */
export const IDENTITY_STAGE_ORBIT: StageOrbit = { yaw: 38, pitch: 20, distance: 10800 }

/**
 * Operator FPS camera in the office. Position + look (pitch/yaw).
 * Bot does not write this. Legacy orbit snapshots (ox / distance) → identity.
 */
export interface StageCamera {
  x: number
  y: number
  z: number
  rx: number
  ry: number
}

/** CSS perspective distance. */
export const STAGE_PERSPECTIVE = 1200

/** Match CSS `perspective` so the GL walk cut does not pop FOV. */
export function stageFovY(viewportH: number): number {
  const h = Math.max(1, viewportH)
  return (2 * Math.atan(h / 2 / STAGE_PERSPECTIVE) * 180) / Math.PI
}

/** Walk / look constants. */
export const STAGE_WALK_SPEED = 3600
export const STAGE_WALK_SPRINT = 2.5
export const STAGE_WALK_ACCEL = 14000
export const STAGE_WALK_DECEL = 22000
export const STAGE_WALK_SPRINT_MAG = 0.88
export const STAGE_WALK_LOOK_MS = 1000
export const STAGE_LOOK_SENS = 0.22
export const STAGE_STICK_DEAD = 14
export const STAGE_STICK_RANGE = 72
export const STAGE_TOUCH_WALK_SPLIT = 0.42
export const STAGE_LOOK_ARROW = 140
export const STAGE_LOOK_STICK = 220
export const STAGE_CAMERA_RX_MAX = 89.5
export const STAGE_CAMERA_RY_MAX = 180
export const STAGE_CAMERA_Y_MIN = -11_000_000_000
export const STAGE_CAMERA_Y_MAX = 0
export const STAGE_HEAD_WHEEL = 0.45
export const STAGE_EDGE_ZOOM_DEFAULT = 100
export const STAGE_EDGE_ZOOM_MAX = 100
export const STAGE_EDGE_ZOOM_PER_PX = 0.01

function wrapDeg(value: number): number {
  let a = value % 360
  if (a > 180) a -= 360
  if (a < -180) a += 360
  return a
}

export function clampStageCamera(raw: Partial<StageCamera>, identity?: StageCamera): StageCamera {
  const id = identity ?? IDENTITY_STAGE_CAMERA
  const n = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
  return {
    x: n(raw.x, id.x),
    y: clamp(n(raw.y, id.y), STAGE_CAMERA_Y_MIN, STAGE_CAMERA_Y_MAX),
    z: n(raw.z, id.z),
    rx: clamp(n(raw.rx, id.rx), -STAGE_CAMERA_RX_MAX, STAGE_CAMERA_RX_MAX),
    ry: wrapDeg(n(raw.ry, id.ry)),
  }
}

export function parseStageCamera(raw: unknown): StageCamera {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...IDENTITY_STAGE_CAMERA }
  }
  const o = raw as Record<string, unknown>
  const legacy = ('distance' in o || 'ox' in o) && !('x' in o) && !('z' in o)
  if (legacy) return { ...IDENTITY_STAGE_CAMERA }
  return clampStageCamera(o as Partial<StageCamera>)
}

export function isIdentityCamera(camera: StageCamera): boolean {
  return (
    camera.x === IDENTITY_STAGE_CAMERA.x &&
    camera.y === IDENTITY_STAGE_CAMERA.y &&
    camera.z === IDENTITY_STAGE_CAMERA.z &&
    camera.rx === IDENTITY_STAGE_CAMERA.rx &&
    camera.ry === IDENTITY_STAGE_CAMERA.ry
  )
}

/**
 * Pivot at the CSS eye (``perspective`` in front of the screen), not at
 * z=0 — otherwise yaw/pitch orbit the glass like a PTZ.
 */
export function stageViewOrigin(): string {
  return `50% 50% ${STAGE_PERSPECTIVE}px`
}

/** View: translate world, then yaw/pitch on the head. ``edgeZoom`` dollies +Z. */
export function stageViewTransform(camera: StageCamera, edgeZoom = 1): string {
  const z = camera.z * (edgeZoom || 1)
  return `rotateX(${-camera.rx}deg) rotateY(${-camera.ry}deg) translate3d(${-camera.x}px, ${-camera.y}px, ${-z}px)`
}

/** Monitor slide, millimetres, on the glass plane. */
export const SCREEN_X_STEP = 200

export interface StageScreens {
  left: number
  center: number
  right: number
}

export const IDENTITY_STAGE_SCREENS: StageScreens = {
  left: 0,
  center: 0,
  right: 0,
}

export function parseScreenX(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function parseStageScreens(raw: unknown): StageScreens {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...IDENTITY_STAGE_SCREENS }
  }
  const o = raw as Record<string, unknown>
  return {
    left: parseScreenX(o.left),
    center: parseScreenX(o.center),
    right: parseScreenX(o.right),
  }
}

export function isIdentityScreens(screens: StageScreens): boolean {
  return (
    screens.left === IDENTITY_STAGE_SCREENS.left &&
    screens.center === IDENTITY_STAGE_SCREENS.center &&
    screens.right === IDENTITY_STAGE_SCREENS.right
  )
}

/** Same base for every pane. Hinge yaw is gone; origin is the grow-from-base edge. */
export function stageScreenOrigin(): string {
  return '50% 100%'
}

/**
 * Glass sits on the screen base (−900 mm). ``translateY(-100%)`` grows the
 * pane upward so resize changes the top / sides, never the base.
 */
export function stageScreenTransform(
  _side: -1 | 0 | 1,
  x = 0,
  glassY = SCREEN_BASE_Y,
  glassZ = 0,
): string {
  const dx = parseScreenX(x)
  return `translate3d(${dx}px, ${glassY}px, ${glassZ}px) translateY(-100%)`
}

export function walkLookEngaged(
  walking: boolean,
  lastWalkAt: number,
  now: number,
  holdMs = STAGE_WALK_LOOK_MS,
): boolean {
  if (walking) return true
  if (lastWalkAt <= 0) return false
  return now - lastWalkAt < holdMs
}

export function stageLookDelta(
  dx: number,
  dy: number,
  sensitivity = STAGE_LOOK_SENS,
): Pick<StageCamera, 'rx' | 'ry'> {
  return {
    ry: -dx * sensitivity,
    rx: dy * sensitivity,
  }
}

/** Held arrows: deg/s on the head. Same axes as mouse look. */
export function stageArrowLookDelta(
  keys: { left?: boolean; right?: boolean; up?: boolean; down?: boolean },
  dt: number,
  speed = STAGE_LOOK_ARROW,
): Pick<StageCamera, 'rx' | 'ry'> {
  let yaw = 0
  let pitch = 0
  if (keys.left) yaw += 1
  if (keys.right) yaw -= 1
  if (keys.up) pitch -= 1
  if (keys.down) pitch += 1
  if ((!yaw && !pitch) || dt <= 0) return { rx: 0, ry: 0 }
  return { rx: pitch * speed * dt, ry: yaw * speed * dt }
}

/** Finger offset → analog walk. ``x`` right, ``z`` forward (screen up). */
export function stageStickVector(
  dx: number,
  dy: number,
  dead = STAGE_STICK_DEAD,
  range = STAGE_STICK_RANGE,
): { x: number; z: number } {
  const x = dx
  const z = -dy
  const len = Math.hypot(x, z)
  if (len < dead || range <= dead) return { x: 0, z: 0 }
  const scale = Math.min(1, (len - dead) / (range - dead))
  return { x: (x / len) * scale, z: (z / len) * scale }
}

export function stageWalkDelta(
  camera: StageCamera,
  keys: { w?: boolean; a?: boolean; s?: boolean; d?: boolean },
  dt: number,
  speed = STAGE_WALK_SPEED,
  analog?: { x: number; z: number },
): Pick<StageCamera, 'x' | 'z'> {
  const yaw = (-camera.ry * Math.PI) / 180
  const fwdX = Math.sin(yaw)
  const fwdZ = -Math.cos(yaw)
  const rightX = Math.cos(yaw)
  const rightZ = Math.sin(yaw)
  let dx = 0
  let dz = 0
  if (analog && (analog.x || analog.z)) {
    dx = analog.z * fwdX + analog.x * rightX
    dz = analog.z * fwdZ + analog.x * rightZ
  } else {
    if (keys.w) { dx += fwdX; dz += fwdZ }
    if (keys.s) { dx -= fwdX; dz -= fwdZ }
    if (keys.d) { dx += rightX; dz += rightZ }
    if (keys.a) { dx -= rightX; dz -= rightZ }
  }
  const len = Math.hypot(dx, dz)
  if (!len || dt <= 0) return { x: 0, z: 0 }
  const scale = analog && (analog.x || analog.z) ? Math.min(1, Math.hypot(analog.x, analog.z)) : 1
  const step = speed * dt * scale
  return { x: (dx / len) * step, z: (dz / len) * step }
}

/** Accelerate ``vel`` toward wish (mm/s). Zero wish dumps speed. */
export function approachVel2(
  vel: { x: number; z: number },
  wish: { x: number; z: number },
  dt: number,
  accel = STAGE_WALK_ACCEL,
  decel = STAGE_WALK_DECEL,
): { x: number; z: number } {
  if (dt <= 0) return { x: vel.x, z: vel.z }
  const wlen = Math.hypot(wish.x, wish.z)
  if (wlen < 1e-3) {
    const vlen = Math.hypot(vel.x, vel.z)
    if (vlen < 1e-3) return { x: 0, z: 0 }
    const drop = decel * dt
    if (drop >= vlen) return { x: 0, z: 0 }
    const s = (vlen - drop) / vlen
    return { x: vel.x * s, z: vel.z * s }
  }
  const ex = wish.x - vel.x
  const ez = wish.z - vel.z
  const elen = Math.hypot(ex, ez)
  if (elen < 1e-3) return { x: wish.x, z: wish.z }
  const opposite = vel.x * wish.x + vel.z * wish.z < 0
  const rate = (opposite ? decel : accel) * dt
  if (rate >= elen) return { x: wish.x, z: wish.z }
  const s = rate / elen
  return { x: vel.x + ex * s, z: vel.z + ez * s }
}

/** Analog look stick → deg this frame. ``x`` right, ``y`` down. */
export function stageStickLookDelta(
  pad: { x: number; y: number },
  dt: number,
  speed = STAGE_LOOK_STICK,
): Pick<StageCamera, 'rx' | 'ry'> {
  if (dt <= 0 || (!pad.x && !pad.y)) return { rx: 0, ry: 0 }
  return { rx: pad.y * speed * dt, ry: -pad.x * speed * dt }
}

/** Default helm camera identity (seated at the glass). */
export const IDENTITY_STAGE_CAMERA: StageCamera = {
  x: 0,
  y: defaultEyeY(NOMINAL_VIEWPORT_H),
  z: 1100,
  rx: 0,
  ry: 0,
}
