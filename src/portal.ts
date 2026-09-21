import { Matrix4, Quaternion, Vector3 } from 'three'
import {
  createEntity,
  rotationDegrees,
  type Entity,
  type Transform,
  type Vec3Tuple,
} from './scene.js'

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
  if (entity.portal?.mode !== 'open') parts.push(part([w, h, depth], [0, 0, 0]))
  return parts
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
