/**
 * HomeCarrier — parent transform between room frame and lot frame.
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/portal/homeCarrier.ts
 *
 * Two frames, one owner:
 *   Room — sit camera, CSS office, helmInside. Authored drawing.
 *   Lot  — pin, photo, Esri, outdoor φ. `desktop.world` ENU.
 *
 * Forward ride: room → lot (walk-GL hull, walk camera, ghosts).
 * Inverse ride: lot → room (sit / edit ground: the photo as seen
 *   from the house). Do not move the photo with the ship.
 */
import type { StageCamera } from '../pose.js'
import type { RoomMeshPose } from '../gl/glbMesh.js'
import { entityYawDeg } from '../world.js'

export interface HomeCarrier {
  /** Metres east of the pin. */
  x: number
  /** Metres above the lot. */
  y: number
  /** Metres north of the pin. */
  z: number
  /** Heading degrees. 0 = north. */
  yaw: number
}

export const IDENTITY_CARRIER: HomeCarrier = { x: 0, y: 0, z: 0, yaw: 0 }

const EPS = 1e-9

export function isIdentityCarrier(c: HomeCarrier): boolean {
  return (
    Math.abs(c.x) < EPS && Math.abs(c.y) < EPS && Math.abs(c.z) < EPS && Math.abs(c.yaw) < EPS
  )
}

/** Local pose in the parent frame → metres (Y-up, yaw 0 = +Z). */
export function composeAnchoredPose(
  parent: { x: number; y: number; z: number; yaw: number },
  local: { x: number; y: number; z: number; yaw: number },
): { x: number; y: number; z: number; yaw: number } {
  const yaw = (entityYawDeg(parent.yaw) * Math.PI) / 180
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return {
    x: parent.x + local.x * c + local.z * s,
    y: parent.y + local.y,
    z: parent.z - local.x * s + local.z * c,
    yaw: entityYawDeg(parent.yaw) + entityYawDeg(local.yaw),
  }
}

/** Lot metres as seen from the house (inverse of `composeAnchoredPose`). */
export function inverseRideHomeCarrier(
  world: { x: number; y: number; z: number; yaw: number },
  carrier: HomeCarrier,
): { x: number; y: number; z: number; yaw: number } {
  const yaw = (entityYawDeg(carrier.yaw) * Math.PI) / 180
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const dx = world.x - carrier.x
  const dz = world.z - carrier.z
  return {
    x: dx * c - dz * s,
    y: world.y - carrier.y,
    z: dx * s + dz * c,
    yaw: entityYawDeg(world.yaw) - entityYawDeg(carrier.yaw),
  }
}

export function rideHomeCarrier(
  local: { x: number; y: number; z: number; yaw: number },
  carrier: HomeCarrier,
): { x: number; y: number; z: number; yaw: number } {
  return composeAnchoredPose(carrier, local)
}

/**
 * Who rides the house when it parks.
 * Lot-fixed φ (edge / host / photo / ruler) stay on the pin.
 * Fleet cars / drones stay unless `parent_id` is the house (cargo).
 */
export function ridesHomeCarrier(id: string): boolean {
  if (!id) return false
  if (id.startsWith('world.phi.edge.')) return false
  if (id.startsWith('world.phi.host.')) return false
  if (id === 'world.phi.lot' || id === 'world.phi.road' || id === 'world.phi.green') return false
  if (id.startsWith('world.car.') || id.startsWith('world.drone.')) return false
  if (id.startsWith('world.yard.')) return false
  if (id.startsWith('world.wormhole.')) return false
  return true
}

/** Ride the house, or ride because `parent_id` is the house. */
export function meshRidesHomeCarrier(id: string, parentId?: string | null): boolean {
  if (ridesHomeCarrier(id)) return true
  if (!parentId || parentId === 'desktop.world') return false
  return ridesHomeCarrier(parentId)
}

export function rideMeshPose(pose: RoomMeshPose, carrier: HomeCarrier): RoomMeshPose {
  if (isIdentityCarrier(carrier)) return pose
  const w = rideHomeCarrier(
    { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw },
    carrier,
  )
  return { ...pose, x: w.x, y: w.y, z: w.z, yaw: w.yaw }
}

/** CSS mm (Y-down) → lot CSS mm. */
export function rideCssMm(
  p: { x: number; y: number; z: number },
  carrier: HomeCarrier,
): { x: number; y: number; z: number } {
  if (isIdentityCarrier(carrier)) return p
  const w = rideHomeCarrier(
    { x: p.x / 1000, y: -p.y / 1000, z: p.z / 1000, yaw: 0 },
    carrier,
  )
  return { x: w.x * 1000, y: -w.y * 1000, z: w.z * 1000 }
}

/** GL mm (Y-up) → lot GL mm. */
export function rideGlMm(
  p: [number, number, number],
  carrier: HomeCarrier,
): [number, number, number] {
  if (isIdentityCarrier(carrier)) return p
  const w = rideHomeCarrier(
    { x: p[0] / 1000, y: p[1] / 1000, z: p[2] / 1000, yaw: 0 },
    carrier,
  )
  return [w.x * 1000, w.y * 1000, w.z * 1000]
}

export function rideCamera(cam: StageCamera, carrier: HomeCarrier): StageCamera {
  if (isIdentityCarrier(carrier)) return cam
  const p = rideCssMm({ x: cam.x, y: cam.y, z: cam.z }, carrier)
  return { ...cam, x: p.x, y: p.y, z: p.z, ry: cam.ry + entityYawDeg(carrier.yaw) }
}

/** Inverse of `rideCamera` — lot CSS mm → room camera. */
export function inverseRideCamera(cam: StageCamera, carrier: HomeCarrier): StageCamera {
  if (isIdentityCarrier(carrier)) return cam
  const w = inverseRideHomeCarrier(
    { x: cam.x / 1000, y: -cam.y / 1000, z: cam.z / 1000, yaw: cam.ry },
    carrier,
  )
  return { ...cam, x: w.x * 1000, y: -w.y * 1000, z: w.z * 1000, ry: w.yaw }
}
