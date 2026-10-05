import { MathUtils, Vector3, type Object3D } from 'three'

/** Wheel angle (radians) at which the physical steering wheel reaches full lock. */
export const steeringFullLockSteer = 0.45
/** Steering-wheel rotation at full lock, radians in either direction. */
export const steeringWheelLock = Math.PI / 2

/**
 * Unit rotation axis of a steering wheel model, in the model's own space, pointing away from
 * the driver along the column. The default is the model's +Z, as authored in the S3 steering
 * GLB; a model whose rim is tilted inside its file declares the tilted axis instead.
 */
export function steeringAxis(axis?: readonly number[]): Vector3 {
  if (!axis) return new Vector3(0, 0, 1)
  const v = new Vector3(axis[0], axis[1], axis[2])
  if (!Number.isFinite(v.length()) || v.length() < 1e-6) throw new Error('Invalid steering axis')
  return v.normalize()
}

/**
 * Physical wheel angle about `axis`. `steer` is the road-wheel angle (positive turns left, as in
 * the physics); a left turn moves the top of the rim to the driver's left, i.e. counter-clockwise
 * seen from the driver, which is a negative rotation about the away-from-driver axis.
 */
export function steeringWheelAngle(steer: number): number {
  return -MathUtils.clamp(steer / steeringFullLockSteer, -1, 1) * steeringWheelLock
}

/** Rotate the spin group about the column axis only, never about the model origin's axes. */
export function poseSteeringWheel(spin: Object3D, axis: Vector3, steer: number): void {
  spin.quaternion.setFromAxisAngle(axis, steeringWheelAngle(steer))
}
