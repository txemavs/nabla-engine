import { MathUtils, Vector3, type Object3D, type Quaternion } from 'three'

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

/**
 * Rotate the spin group about the column axis only, never about the model origin's axes.
 * `pivot` is a point on that axis in the model's space (see `steeringPivot`); the default is the
 * model origin. The spin group is translated so that point stays put while the wheel turns.
 */
export function poseSteeringWheel(
  spin: Object3D,
  axis: Vector3,
  steer: number,
  pivot?: Vector3,
): void {
  spin.quaternion.setFromAxisAngle(axis, steeringWheelAngle(steer))
  if (pivot) spin.position.copy(pivot).sub(pivot.clone().applyQuaternion(spin.quaternion))
  else spin.position.set(0, 0, 0)
}

/**
 * The point a steering GLB spins about, in the GLB scene's own space (the space the engine turns
 * it in), read from `extras.nabla.spinPivot` (`[x, y, z]`, metres) on any of its nodes; GLTFLoader
 * keeps node extras in `userData`. Without it the wheel spins about the scene origin. A rim that
 * was moved across its column inside the file (e.g. the S3 height bake) declares the moved
 * pivot, so it still turns about its own centre line.
 */
export function steeringPivot(model: Object3D): Vector3 | undefined {
  let pivot: Vector3 | undefined
  model.traverse((node) => {
    const value = (node.userData as { nabla?: { spinPivot?: unknown } }).nabla?.spinPivot
    if (pivot || !Array.isArray(value)) return
    if (value.length !== 3 || !value.every((v) => typeof v === 'number' && Number.isFinite(v)))
      throw new Error('Invalid steering spinPivot')
    pivot = new Vector3(value[0], value[1], value[2])
  })
  return pivot
}

/**
 * Driver adjustment of a steering wheel, metres, applied on top of the pose baked into the GLB
 * and its `steering` anchor. `distance` slides the rim along the steering column (the spin axis):
 * positive moves it away from the driver, toward the instrument cluster. `height` moves it along
 * the vehicle's vertical (chassis +Y): positive raises it.
 */
export interface SteeringWheelOffset {
  distance: number
  height: number
}

/** Neutral adjustment: the wheel exactly where the GLB puts it. */
export const steeringWheelCentred: Readonly<SteeringWheelOffset> = Object.freeze({
  distance: 0,
  height: 0,
})

/** Limits and step of each adjustment axis, metres (±8 cm in 0.5 cm steps). */
export const steeringWheelOffsetRange = Object.freeze({ min: -0.08, max: 0.08, step: 0.005 })

/** Clamp to `steeringWheelOffsetRange` and snap to its step; non-finite values become 0. */
export function clampSteeringWheelOffset(
  offset: Partial<SteeringWheelOffset> | undefined,
): SteeringWheelOffset {
  const { min, max, step } = steeringWheelOffsetRange
  const axis = (value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0
    const snapped = Math.round(MathUtils.clamp(value, min, max) / step) * step
    // Keep values like 0.015 exact enough to print and compare (no 0.015000000000000001).
    return Number(snapped.toFixed(4)) || 0
  }
  return { distance: axis(offset?.distance), height: axis(offset?.height) }
}

/**
 * Translation, in the steering mount's frame, that applies `offset` to a wheel whose spin axis
 * is `axis` (model space, see `steeringAxis`). `mount` is the mount's rotation relative to the
 * chassis, used to express the chassis vertical in that frame. The spin group is translated as a
 * whole, so the rim keeps turning about its own column: the pivot moves with the wheel.
 */
export function steeringWheelOffsetPosition(
  axis: Vector3,
  mount: Quaternion,
  offset: SteeringWheelOffset,
  target = new Vector3(),
): Vector3 {
  const up = new Vector3(0, 1, 0).applyQuaternion(mount.clone().invert())
  return target.copy(axis).multiplyScalar(offset.distance).addScaledVector(up, offset.height)
}
