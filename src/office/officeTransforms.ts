/**
 * CSS 3D transforms for the office room box.
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   schema/pose.ts (office subset)
 *
 * These compute CSS transform strings for floor, walls, ceiling, etc.
 */
import type { OfficeWorld } from './roomPaint.js'
import type { StageCamera } from '../pose.js'

/** Half-width of the room in px at viewport width 100vw. */
export function roomHalfPx(office: OfficeWorld, viewportW: number): number {
  return (office.roomHalfVw * viewportW) / 100
}

/** Floor plane — rotated about the near edge, sits at y = floorY. */
export function officeFloorTransform(office: OfficeWorld): string {
  const z = office.floorNearZ
  return `translate3d(0, ${office.floorY}px, ${z}px) rotateX(-90deg)`
}

/** Ceiling plane — rotated about the back edge, sits at y = ceilY. */
export function officeCeilTransform(office: OfficeWorld): string {
  const z = office.floorNearZ
  return `translate3d(0, ${office.ceilY}px, ${z}px) rotateX(90deg)`
}

/** Left wall (−X side). Rotate about the floor edge, then rotate −90° about Y. */
export function officeLeftWallTransform(office: OfficeWorld): string {
  const y = (office.ceilY + office.floorY) / 2
  const z = (office.floorFarZ + office.floorNearZ) / 2
  return `translate3d(0, ${y}px, ${z}px) rotateY(90deg)`
}

/** Right wall (+X side). */
export function officeRightWallTransform(office: OfficeWorld): string {
  const y = (office.ceilY + office.floorY) / 2
  const z = (office.floorFarZ + office.floorNearZ) / 2
  return `translate3d(0, ${y}px, ${z}px) rotateY(-90deg)`
}

/** Back wall (+Z). */
export function officeBackWallTransform(office: OfficeWorld): string {
  const y = (office.ceilY + office.floorY) / 2
  const z = office.floorNearZ
  return `translate3d(0, ${y}px, ${z}px) rotateY(180deg)`
}

/** Sky / port (front glass at z = skyZ, centered at glassY). */
export function officeSkyTransform(office: OfficeWorld): string {
  const y = office.skyY + office.skyH / 2
  return `translate3d(0, ${y}px, ${office.skyZ}px)`
}

/** Console deck. */
export function officeDeckTransform(office: OfficeWorld): string {
  return `translate3d(0, ${office.consoleY}px, ${office.consoleZ}px) rotateX(${office.consoleRx}deg)`
}

export const HELM_WALL_MARGIN_MM = 380
export const HELM_FLOOR_MARGIN_MM = 200
export const HELM_CEIL_MARGIN_MM = 180

/** Is the camera inside the room box (sit pose, not walk)? */
export function helmInside(
  cam: StageCamera,
  office: OfficeWorld,
  viewportW: number,
): boolean {
  const hw = roomHalfPx(office, viewportW) - HELM_WALL_MARGIN_MM
  if (cam.x < -hw || cam.x > hw) return false
  const top = office.ceilY + HELM_CEIL_MARGIN_MM
  const bot = office.floorY - HELM_FLOOR_MARGIN_MM
  if (cam.y < top || cam.y > bot) return false
  if (cam.z < office.floorFarZ + 100 || cam.z > office.floorNearZ - 100) return false
  return true
}

export const WALK_MARGIN_MM = 300

/** Clamp a walk camera to the room AABB. */
export function clampRoomWalk(
  x: number,
  y: number,
  z: number,
  office: OfficeWorld,
  viewportW: number,
): { x: number; y: number; z: number } {
  const hw = roomHalfPx(office, viewportW) - WALK_MARGIN_MM
  const cx = Math.max(-hw, Math.min(hw, x))
  const topY = office.ceilY + WALK_MARGIN_MM
  const cy = Math.max(topY, Math.min(office.floorY, y))
  const cz = Math.max(office.floorFarZ + WALK_MARGIN_MM, Math.min(office.floorNearZ - WALK_MARGIN_MM, z))
  return { x: cx, y: cy, z: cz }
}

/** AABB for the CSS office in mm, suitable for GL world. */
export function officeAabbMm(
  office: OfficeWorld,
  viewportW: number,
): { min: [number, number, number]; max: [number, number, number] } {
  const hw = roomHalfPx(office, viewportW)
  return {
    min: [-hw, office.ceilY, office.floorFarZ],
    max: [hw, office.floorY, office.floorNearZ],
  }
}
