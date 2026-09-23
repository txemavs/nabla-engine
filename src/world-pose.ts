import { Quaternion, Vector3 } from 'three'
import { ecef, localFrame, localToGeo, type GeoPoint } from './geography.js'
import type { Transform, Vec3Tuple } from './scene.js'

/** Planet-fixed doubles, in Nabla's spherical axes (+Y north, longitude zero +X).
 * This is NOT standard WGS84 ECEF; adapters must explicitly convert axes/model.
 * Local scene frames and GPU floats are derived views, not world addresses.
 */
export interface WorldPose extends Transform {
  frame: 'nabla-earth-sphere-v1'
}
export function toWorldPose(origin: GeoPoint, local: Transform): WorldPose {
  const basis = localFrame(origin)
  return {
    frame: 'nabla-earth-sphere-v1',
    position: new Vector3(...local.position).applyQuaternion(basis).add(ecef(origin)).toArray(),
    rotation: basis
      .multiply(new Quaternion(...local.rotation))
      .normalize()
      .toArray(),
  }
}
export function fromWorldPose(origin: GeoPoint, world: WorldPose): Transform {
  if (world.frame !== 'nabla-earth-sphere-v1') throw Error('Unsupported planet frame')
  const inverse = localFrame(origin).invert()
  return {
    position: new Vector3(...world.position).sub(ecef(origin)).applyQuaternion(inverse).toArray(),
    rotation: inverse
      .multiply(new Quaternion(...world.rotation))
      .normalize()
      .toArray(),
  }
}
/** Coordinates for display/editing; orientation remains planet-fixed in WorldPose. */
export function worldPoseGeography(world: WorldPose): GeoPoint {
  const origin: GeoPoint = { latitude: 0, longitude: 0, altitude: 0 }
  return localToGeo(origin, fromWorldPose(origin, world).position)
}
/** Translation-free basis conversion for linear/angular velocity and directions. */
export function reframeVector(value: Vec3Tuple, from: GeoPoint, to: GeoPoint): Vec3Tuple {
  return new Vector3(...value)
    .applyQuaternion(localFrame(from))
    .applyQuaternion(localFrame(to).invert())
    .toArray()
}
