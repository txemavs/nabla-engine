import { describe, expect, it } from 'vitest'
import { Group, Quaternion, Vector3 } from 'three'
import {
  clampSteeringWheelOffset,
  poseSteeringWheel,
  steeringAxis,
  steeringWheelOffsetPosition,
  steeringWheelOffsetRange,
} from '../../src/render/entity/steering-wheel.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'

describe('steering wheel offset', () => {
  it('clamps to ±8 cm and snaps to 0.5 cm', () => {
    expect(steeringWheelOffsetRange).toEqual({ min: -0.08, max: 0.08, step: 0.005 })
    expect(clampSteeringWheelOffset({ distance: 0.2, height: -0.3 })).toEqual({
      distance: 0.08,
      height: -0.08,
    })
    expect(clampSteeringWheelOffset({ distance: 0.0149, height: -0.0026 })).toEqual({
      distance: 0.015,
      height: -0.005,
    })
    expect(clampSteeringWheelOffset({ distance: Number.NaN })).toEqual({ distance: 0, height: 0 })
    expect(clampSteeringWheelOffset(undefined)).toEqual({ distance: 0, height: 0 })
    expect(Object.is(clampSteeringWheelOffset({ height: -0.001 }).height, -0)).toBe(false)
  })

  for (const [catalog, id] of [
    ['car', 'S3'],
    ['a3', 'A3'],
    ['white-truck', 'tractor'],
  ] as const) {
    it(`${id}: moves the rim along its column and the chassis vertical, pivot included`, () => {
      const steering = presetVehicle(catalog, id).visual!.steering!
      const axis = steeringAxis(steering.axis)
      const mount = new Group()
      mount.quaternion.fromArray(steering.transform.rotation)
      mount.position.fromArray(steering.transform.position)
      const adjust = new Group()
      const spin = new Group()
      mount.add(adjust)
      adjust.add(spin)
      const rim = new Vector3(0.18, 0.05, -0.02)
      const world = (steer: number, offset: { distance: number; height: number }) => {
        steeringWheelOffsetPosition(axis, mount.quaternion, offset, adjust.position)
        poseSteeringWheel(spin, axis, steer)
        mount.updateMatrixWorld(true)
        return rim.clone().applyMatrix4(spin.matrixWorld)
      }
      const column = axis
        .clone()
        .applyQuaternion(new Quaternion().fromArray(mount.quaternion.toArray()))
      const expected = column.multiplyScalar(0.03).add(new Vector3(0, -0.02, 0))
      for (const steer of [0, 0.2, -0.45]) {
        const shift = world(steer, { distance: 0.03, height: -0.02 }).sub(
          world(steer, { distance: 0, height: 0 }),
        )
        expect(shift.distanceTo(expected)).toBeLessThan(1e-9)
      }
    })
  }
})
