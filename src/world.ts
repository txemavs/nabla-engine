/**
 * World units for the 3D helm. No layout, no camera — only the metre stick.
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/world.ts
 *
 *   1 CSS px = 1 mm.  +X right.  +Y down (CSS).  +Z toward the seat.
 *   Glass origin (0,0,0) = base of ``world.monitor.main`` (entity pose).
 */

export const PX_PER_MM = 1
export const MM_PER_M = 1000

/** |yaw| ≤ π → radians (A3 shipped as ``π/2``); else degrees. */
export function entityYawDeg(yaw: number): number {
  if (!Number.isFinite(yaw)) return 0
  return Math.abs(yaw) <= Math.PI + 1e-6 ? (yaw * 180) / Math.PI : yaw
}

/** CSS Y for a height above the floor (mm). */
export function altitudeY(mm: number): number {
  return -mm * PX_PER_MM
}

/** Stable keys on the selected ship (prefs.shipId, default world.home). */
export const HOME_SHIP_KEY = 'world.home'
export const DESKTOP_KEY = 'world.desktop'
export const MONITOR_MAIN_KEY = 'world.monitor.main'

/** Bottom edge of the triple glass when the monitor is at the factory pose. */
export const SCREEN_BASE_MM = 900

/** Ship-local metres (Y-up) → sit CSS mm (Y-down). Monitor base = (0,0,0). */
export function metresToCssMm(pose: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  return { x: pose.x * MM_PER_M, y: -pose.y * MM_PER_M, z: pose.z * MM_PER_M }
}

/** Table top is 6 cm below the glass base. Cabinet rises from the floor. */
export const CONSOLE_GAP_MM = 60
export const CONSOLE_DEPTH_MM = 300
export const CONSOLE_TOP_MM = SCREEN_BASE_MM - CONSOLE_GAP_MM
export const CONSOLE_Z = CONSOLE_DEPTH_MM / 2
export const CONSOLE_RX = 90

/** Deck / table surface — 840 mm above the floor. */
export const DECK_HEIGHT_MM = CONSOLE_TOP_MM

export const DECK_Y = altitudeY(DECK_HEIGHT_MM)
export const SCREEN_BASE_Y = altitudeY(SCREEN_BASE_MM)

export const NOMINAL_VIEWPORT_H = 1080

/** Default eye / ``centro`` of the main glass. */
export function defaultEyeY(viewportH = NOMINAL_VIEWPORT_H): number {
  return SCREEN_BASE_Y - viewportH / 2
}

/**
 * Entity in a Room: pose in mm / deg / scale ratio.
 * Not a Stage — a Stage is scenery; an Entity is a thing placed in a Room.
 */
export interface EntityPose {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
  sx: number
  sy: number
  sz: number
}

export const IDENTITY_ENTITY: EntityPose = {
  x: 0,
  y: 0,
  z: 0,
  rx: 0,
  ry: 0,
  rz: 0,
  sx: 1,
  sy: 1,
  sz: 1,
}

/**
 * Desk under the helm. Not painted yet — reserved so later furniture
 * sits on the deck height, centred on the room, just in front of the glass.
 */
export const TABLE_ENTITY: EntityPose = {
  x: 0,
  y: DECK_Y,
  z: CONSOLE_Z,
  rx: 0,
  ry: 0,
  rz: 0,
  sx: 1,
  sy: 1,
  sz: 1,
}

export function entityTransform(e: EntityPose): string {
  return (
    `translate3d(${e.x}px, ${e.y}px, ${e.z}px)`
    + ` rotateX(${e.rx}deg) rotateY(${e.ry}deg) rotateZ(${e.rz}deg)`
    + ` scale3d(${e.sx}, ${e.sy}, ${e.sz})`
  )
}
