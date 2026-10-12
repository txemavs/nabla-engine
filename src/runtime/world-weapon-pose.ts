import { Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import { weaponViewTuning } from '../config/gameplay-tuning.js'

/** Extend from the avatar's shoulder toward the camera target, independently of viewmodel offsets. */
export function extendedWeaponPose(
  weapon: Object3D,
  avatar: Object3D,
  target: Vector3,
  up: Vector3,
): void {
  avatar.updateWorldMatrix(true, false)
  const tuning = weaponViewTuning.thirdPerson
  const shoulder = avatar.localToWorld(new Vector3(...tuning.shoulder))
  const direction = target.clone().sub(shoulder)
  const distance = direction.length()
  if (distance < 0.001) return
  direction.divideScalar(distance)
  const hand = shoulder.addScaledVector(direction, Math.min(tuning.reachMetres, distance * 0.5))
  weapon.position.copy(avatar.worldToLocal(hand.clone()))
  const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(hand, target, up))
  weapon.quaternion.copy(avatar.getWorldQuaternion(new Quaternion()).invert()).multiply(rotation)
}
