/**
 * Engine frame: metres, Y-up, −Z forward.
 * Rotations persist as unit quaternions [x, y, z, w]. UI angles are degrees, applied YXZ.
 */
import { Euler, Quaternion } from 'three'

export type Vec3Tuple = [number, number, number]
export type QuatTuple = [number, number, number, number]
export type Transform = { position: Vec3Tuple; rotation: QuatTuple }

export function rotationDegrees(x: number, y: number, z: number): QuatTuple {
  return new Quaternion()
    .setFromEuler(new Euler((x * Math.PI) / 180, (y * Math.PI) / 180, (z * Math.PI) / 180, 'YXZ'))
    .toArray() as QuatTuple
}

export function toDegrees(q: QuatTuple): Vec3Tuple {
  const e = new Euler().setFromQuaternion(new Quaternion(...q), 'YXZ')
  return [e.x, e.y, e.z].map((n) => (n * 180) / Math.PI) as Vec3Tuple
}
