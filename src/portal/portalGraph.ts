/**
 * Portal graph — the transition layer between CSS office and GL world.
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/portal/portalGraph.ts
 *
 * Core model:
 *   Place      — entity with optional dual render (GL hull + CSS office)
 *   Portal     — hole on a face that connects modes (in/out)
 *   Crossing   — stepping through flips StageMode and places camera
 *
 * Types:
 *   EntityPortal   — one hole on an entity AABB face
 *   LivePortal     — resolved portal with world pose
 *   PortalArrive   — where you land after crossing
 */
import type { StageCamera } from '../pose.js'
import type { Aabb3, EntityFace } from '../kind/entityAabb.js'
import { aabbFaceCenter, aabbFaceInYaw, isEntityFace } from '../kind/entityAabb.js'
import { entityYawDeg } from '../world.js'

export { isEntityFace, type EntityFace }

export type PortalArriveKind = 'sit' | 'walk'
/** `in` = +Z walks into the box. `out` = +Z walks toward the pair. */
export type PortalToward = 'in' | 'out'

/** One hole on an entity AABB face. Several per entity; one typical per face. */
export interface EntityPortal {
  face: EntityFace
  id?: string
  pairId?: string
  arrive?: PortalArriveKind
  toward?: PortalToward
}

export type PortalPose = { x: number; y: number; z: number; yaw: number }

export interface LivePortal {
  id: string
  pose: PortalPose
  pairId?: string
  arrive?: PortalArriveKind
  hostId?: string
  hostPose?: PortalPose
  face?: EntityFace
  toward?: PortalToward
}

export interface PortalHost {
  id: string
  pose: PortalPose
  portals?: EntityPortal[]
}

export type PortalLane = 'proa' | 'popa'
export type PortalSide = 'hull' | 'yard'

/** Default ship portal opening. */
export const SHIP_PORTAL_OPEN_W_M = 4.71
export const SHIP_PORTAL_OPEN_H_M = 2.91
const SHIP_OPENING_HALF_M = SHIP_PORTAL_OPEN_W_M / 2
const SHIP_DEPTH_M = 10

/** Shipped container mesh AABB (midship). */
export const CONTAINER_MESH_AABB: Aabb3 = {
  min: [-2.5, 0, -5],
  max: [2.5, 3.2, 5],
}

/** CSS nave / sit holes: z=0 proa. */
export const SHIP_HULL_AABB: Aabb3 = {
  min: [-2.5, 0, 0],
  max: [2.5, 3.2, SHIP_DEPTH_M],
}

export type BoxFace = 'front' | 'back' | 'left' | 'right' | 'floor' | 'top'

const FACE_TO_BOX: Record<EntityFace, BoxFace> = {
  '-z': 'front',
  '+z': 'back',
  '-x': 'left',
  '+x': 'right',
  '-y': 'floor',
  '+y': 'top',
}

export type PortalArrive =
  | { kind: 'sit'; hostId: string }
  | { kind: 'walk'; camera: StageCamera; hostId?: string }

function yawRad(yaw: number): number {
  return (entityYawDeg(yaw) * Math.PI) / 180
}

function worldFromLocal(
  pose: { x: number; z: number; yaw: number },
  lx: number,
  lz: number,
): { x: number; z: number } {
  const yaw = yawRad(pose.yaw)
  return {
    x: pose.x + lx * Math.cos(yaw) + lz * Math.sin(yaw),
    z: pose.z - lx * Math.sin(yaw) + lz * Math.cos(yaw),
  }
}

/** Local XZ of a CSS-mm camera on a metre pose. +Z is through the hole. */
export function portalLocal(
  cam: { x: number; z: number },
  pose: { x: number; z: number; yaw: number },
): { x: number; z: number } {
  const yaw = yawRad(pose.yaw)
  const dx = cam.x / 1000 - pose.x
  const dz = cam.z / 1000 - pose.z
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return { x: dx * c - dz * s, z: dx * s + dz * c }
}

/**
 * Did the camera cross a portal?
 * Returns true when moving from −Z to +Z in portal local coords
 * (walking through in the +Z direction).
 */
export function portalCrossing(
  prev: { x: number; z: number },
  next: { x: number; z: number },
  pose: { x: number; z: number; yaw: number },
  halfW = SHIP_OPENING_HALF_M,
): boolean {
  const a = portalLocal(prev, pose)
  const b = portalLocal(next, pose)
  if (Math.abs(a.x) > halfW || Math.abs(b.x) > halfW) return false
  return a.z < 0 && b.z >= 0
}

/** Stand on the approach side, looking through. */
export function approachCamera(
  pose: { x: number; y: number; z: number; yaw: number },
  eyeY: number,
  back = 2.4,
): StageCamera {
  const yaw = entityYawDeg(pose.yaw)
  const look = yaw + 180
  const p = worldFromLocal(pose, 0, -back)
  return {
    x: p.x * 1000,
    y: eyeY,
    z: p.z * 1000,
    rx: 8,
    ry: look > 180 ? look - 360 : look,
  }
}

function lookDeg(ix: number, iz: number): number {
  const look = (Math.atan2(ix, iz) * 180) / Math.PI
  return look > 180 ? look - 360 : look
}

/** Step through an outward hull hole into the nave. +Z of the hole is out. */
export function enterNaveCamera(
  pose: { x: number; y: number; z: number; yaw: number },
  eyeY: number,
  inward = 1.8,
): StageCamera {
  const yaw = entityYawDeg(pose.yaw)
  const look = yaw + 180
  const p = worldFromLocal(pose, 0, -inward)
  return {
    x: p.x * 1000,
    y: eyeY,
    z: p.z * 1000,
    rx: 8,
    ry: look > 180 ? look - 360 : look,
  }
}

/**
 * Stand inside the host, just past the hole, looking toward midship.
 * Uses the hull centre so sit-yaw (π) and mesh-yaw (0) both land in the garage.
 */
export function enterHostCamera(
  hole: PortalPose,
  host: PortalPose,
  eyeY: number,
  inward = 2.6,
): StageCamera {
  let ix = host.x - hole.x
  let iz = host.z - hole.z
  const len = Math.hypot(ix, iz)
  if (len < 0.25) return enterNaveCamera(hole, eyeY, inward)
  ix /= len
  iz /= len
  return {
    x: (hole.x + ix * inward) * 1000,
    y: eyeY,
    z: (hole.z + iz * inward) * 1000,
    rx: 8,
    ry: lookDeg(ix, iz),
  }
}

/** Just inside, looking through toward the far end. */
export function insideCamera(
  pose: { x: number; y: number; z: number; yaw: number },
  eyeY: number,
  inward = 1.4,
): StageCamera {
  const yaw = entityYawDeg(pose.yaw)
  const look = yaw + 180
  const p = worldFromLocal(pose, 0, inward)
  return {
    x: p.x * 1000,
    y: eyeY,
    z: p.z * 1000,
    rx: 8,
    ry: look > 180 ? look - 360 : look,
  }
}

export function portalPoseOnFace(
  pose: PortalPose,
  aabb: Aabb3,
  face: EntityFace,
  toward: PortalToward = 'in',
): PortalPose {
  const c = aabbFaceCenter(aabb, face)
  const yaw = yawRad(pose.yaw) + aabbFaceInYaw(face) + (toward === 'out' ? Math.PI : 0)
  const p = worldFromLocal({ x: pose.x, z: pose.z, yaw: pose.yaw }, c.x, c.z)
  return { x: p.x, y: pose.y, z: p.z, yaw }
}

export function outsidePose(pose: PortalPose, backM: number): PortalPose {
  const p = worldFromLocal(pose, 0, -backM)
  return { x: p.x, y: pose.y, z: p.z, yaw: pose.yaw }
}

export function parseEntityPortals(raw: unknown): EntityPortal[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: EntityPortal[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    if (!isEntityFace(o.face)) continue
    const next: EntityPortal = { face: o.face }
    if (typeof o.id === 'string' && o.id.trim()) next.id = o.id.trim()
    if (typeof o.pairId === 'string' && o.pairId.trim()) next.pairId = o.pairId.trim()
    if (o.arrive === 'sit' || o.arrive === 'walk') next.arrive = o.arrive
    if (o.toward === 'in' || o.toward === 'out') next.toward = o.toward
    out.push(next)
  }
  return out.length ? out : undefined
}

/** Portal ID from host + portal config. */
export function portalIdOn(hostId: string, portal: EntityPortal): string {
  if (portal.id) return portal.id
  return `${hostId}.${portal.face}`
}

/** Hull faces that carry a portal — those liners stay off (the hole). */
export function portalBoxFaces(host: PortalHost): BoxFace[] {
  const portals = host.portals ?? []
  return portals.map((hole) => FACE_TO_BOX[hole.face])
}

/** Overlay caption — drop the world.* prefix so the plate stays readable. */
export function portalShortName(id: string): string {
  return id
    .replace(/^world\.portal\./, '')
    .replace(/^world\.ship\./, '')
    .replace(/^world\.yard\./, '')
    .replace(/^world\./, '')
}

export function portalCaption(id: string, pairId?: string): string {
  return `${portalShortName(id)}\n${pairId ? portalShortName(pairId) : '—'}`
}

/** Map a CSS-mm point from one portal pose onto its pair (see-through). */
export function mapThroughPortals(
  css: [number, number, number],
  from: { x: number; z: number; yaw: number },
  to: { x: number; z: number; yaw: number },
): [number, number, number] {
  const loc = portalLocal({ x: css[0], z: css[2] }, from)
  const w = worldFromLocal(to, loc.x, loc.z)
  return [w.x * 1000, css[1], w.z * 1000]
}
