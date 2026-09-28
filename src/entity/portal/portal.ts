import { Matrix4, Quaternion, Vector3 } from 'three'
import { createEntity, type Entity } from '../schema.js'
import { rotationDegrees, type Transform, type Vec3Tuple } from '../../math/frame/vectors.js'

export const PORTAL_BAR = 0.145
export function portalMatrix(pose: Transform): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...pose.position),
    new Quaternion(...pose.rotation),
    new Vector3(1, 1, 1),
  )
}
/** Front (+Z) to front (+Z): an isometry, never a reflection or a scale. */
export function portalMapping(source: Transform, destination: Transform): Matrix4 {
  return portalMatrix(destination)
    .multiply(new Matrix4().makeRotationY(Math.PI))
    .multiply(portalMatrix(source).invert())
}
export function portalLocal(point: Vec3Tuple, mouth: Transform): Vector3 {
  return new Vector3(...point).applyMatrix4(portalMatrix(mouth).invert())
}
/** Swept centre crossing. Full-body clearance is a separate simulation check. */
export function portalCrossing(
  previous: Vec3Tuple,
  next: Vec3Tuple,
  mouth: Transform,
): number | null {
  const a = portalLocal(previous, mouth),
    b = portalLocal(next, mouth)
  return a.z > 0 && b.z <= 0 ? a.z / (a.z - b.z) : null
}
export function portalColliders(entity: Entity): { size: Vec3Tuple; transform: Transform }[] {
  const [w, h, depth] = entity.size,
    b = PORTAL_BAR
  const part = (size: Vec3Tuple, position: Vec3Tuple) => ({
    size,
    transform: { position, rotation: [0, 0, 0, 1] as [number, number, number, number] },
  })
  const parts = [
    part([b, h + 2 * b, depth], [-(w + b) / 2, 0, 0]),
    part([b, h + 2 * b, depth], [(w + b) / 2, 0, 0]),
    part([w, b, depth], [0, (h + b) / 2, 0]),
    part([w, b, depth], [0, -(h + b) / 2, 0]),
  ]
  if (entity.portal?.mode !== 'open' && !(entity.parentId && entity.portal?.mode === 'closed'))
    parts.push(part([w, h, depth], [0, 0, 0]))
  return parts
}
export function validatePortal(
  entity: Entity,
  byId: Map<string, Entity>,
  planetary: boolean,
): void {
  if (!entity.portal) return
  if (entity.kind !== 'group' || entity.motion !== 'none')
    throw new Error('Portals must be nonphysical groups')
  if (entity.parentId && byId.get(entity.parentId)?.kind !== 'vehicle')
    throw new Error('Hosted portals require a vehicle parent')
  if (
    entity.portal.clearsRamp &&
    (!entity.parentId || !byId.get(entity.parentId)?.vehicle?.garage?.ramp)
  )
    throw new Error('Ramp clearance requires a carrier ramp')
  const up = new Vector3(0, 1, 0).applyQuaternion(new Quaternion(...entity.transform.rotation))
  if (!planetary && !entity.parentId && up.distanceTo(new Vector3(0, 1, 0)) > 1e-5)
    throw new Error('This portal release requires upright fixed mouths')
  if (entity.portal.pairId === null) {
    if (entity.portal.mode !== 'closed') throw new Error('An unlinked portal must be closed')
    return
  }
  const pair = byId.get(entity.portal.pairId)
  if (!pair?.portal || pair.id === entity.id || pair.portal.pairId !== entity.id)
    throw new Error('Portal links must be reciprocal between distinct mouths')
  if (
    pair.portal.mode !== entity.portal.mode ||
    pair.size.some((n, i) => Math.abs(n - entity.size[i]) > 1e-6)
  )
    throw new Error('Paired portals must have equal apertures and modes')
}

/** One independent, closed mouth. Its transform origin is the aperture centre. */
export function createPortal(id: string, position: Vec3Tuple = [0, 0, 0]): Entity {
  return {
    ...createEntity(id, 'group', position),
    name: 'Portal',
    size: [4.71, 2.91, 0.145],
    color: '#11151a',
    portal: { pairId: null, mode: 'closed' },
  }
}
export function createPortalPair(
  firstId: string,
  secondId: string,
  first: Vec3Tuple = [4, 1.455, 0],
  second: Vec3Tuple = [-4, 1.455, 24],
): Entity[] {
  return [first, second].map((position, i) => ({
    ...createEntity(i ? secondId : firstId, 'group', position),
    name: i ? 'Stargate · destino' : 'Stargate · origen',
    transform: { position, rotation: rotationDegrees(0, i ? 180 : 0, 0) },
    size: [4.71, 2.91, 0.145],
    color: '#11151a',
    portal: { pairId: i ? firstId : secondId, mode: 'open' as const },
  }))
}

/** The stern is the only stock carrier portal; the bow is an armoured window. */
export function createCarrierPortal(hostId: string, sternId: string): Entity {
  return {
    ...createEntity(sternId, 'group', [0, 0.55, 5.05]),
    name: 'Nave · popa',
    parentId: hostId,
    transform: { position: [0, 0.55, 5.05], rotation: rotationDegrees(0, 180, 0) },
    size: [4.71, 2.91, 0.145],
    portal: { pairId: null, mode: 'closed', clearsRamp: true },
  }
}

/** @deprecated Use createCarrierPortal(hostId, sternId). Kept for older consumers. */
export function createCarrierPortals(hostId: string, _bowId: string, sternId: string): Entity[] {
  return [createCarrierPortal(hostId, sternId)]
}
