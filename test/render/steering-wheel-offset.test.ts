import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Group, Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import {
  clampSteeringWheelOffset,
  poseSteeringWheel,
  steeringAxis,
  steeringPivot,
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

  it('spins about a declared pivot, which stays put', () => {
    const axis = steeringAxis(undefined)
    const pivot = new Vector3(0, 0.023, -0.009)
    const spin = new Group()
    const rim = new Vector3(0.18, 0.05, -0.02)
    for (const steer of [0, 0.35, -0.8]) {
      poseSteeringWheel(spin, axis, steer, pivot)
      spin.updateMatrix()
      expect(pivot.clone().applyMatrix4(spin.matrix).distanceTo(pivot)).toBeLessThan(1e-12)
      // Same as rotating the rim about the origin after moving it by -pivot, then back.
      const about = new Group()
      poseSteeringWheel(about, axis, steer)
      about.updateMatrix()
      const expected = rim.clone().sub(pivot).applyMatrix4(about.matrix).add(pivot)
      expect(rim.clone().applyMatrix4(spin.matrix).distanceTo(expected)).toBeLessThan(1e-12)
    }
    poseSteeringWheel(spin, axis, 0.4)
    expect(spin.position.toArray()).toEqual([0, 0, 0])
  })

  it('reads extras.nabla.spinPivot from any node of the steering model', () => {
    const model = new Group()
    const node = new Object3D()
    model.add(node)
    expect(steeringPivot(model)).toBeUndefined()
    node.userData = { nabla: { spinPivot: [0, 0.02, -0.01] } }
    expect(steeringPivot(model)?.toArray()).toEqual([0, 0.02, -0.01])
    node.userData = { nabla: { spinPivot: [0, 'x', 1] } }
    expect(() => steeringPivot(model)).toThrow('Invalid steering spinPivot')
  })

  it('S3: the baked wheel matches the slider at +1.0 cm / +2.5 cm on the previous GLB', () => {
    // s3.steering.glb on main cb8ce09: alignment root at [0, -0.0275568, 0.03], columnForward 0.03.
    const previous = [0, -0.0275568, 0.03]
    const bytes = readFileSync('assets/library/cars/a3/s3.steering.glb')
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString())
    const root = json.nodes[json.scenes[json.scene ?? 0].nodes[0]]
    expect(root.name).toBe('S3 steering mesh alignment')
    expect(root.extras.nabla.columnForward).toBe(0.04)
    expect(root.extras.nabla.height).toBe(0.025)
    const steering = presetVehicle('car', 'S3').visual!.steering!
    expect(steering.url).toBe('/library/cars/a3/s3.steering.glb')
    const axis = steeringAxis(steering.axis)
    const rootPose = (translation: number[]) =>
      new Matrix4().compose(
        new Vector3(...translation),
        new Quaternion(...root.rotation),
        new Vector3(1, 1, 1),
      )
    const chassis = (
      translation: number[],
      offset: { distance: number; height: number },
      pivot: Vector3 | undefined,
      steer: number,
    ) => {
      const mount = new Group()
      mount.quaternion.fromArray(steering.transform.rotation)
      mount.position.fromArray(steering.transform.position)
      const adjust = new Group()
      const spin = new Group()
      mount.add(adjust)
      adjust.add(spin)
      steeringWheelOffsetPosition(axis, mount.quaternion, offset, adjust.position)
      poseSteeringWheel(spin, axis, steer, pivot)
      mount.updateMatrixWorld(true)
      return spin.matrixWorld.clone().multiply(rootPose(translation))
    }
    const model = new Group()
    model.userData = root.extras
    const pivot = steeringPivot(model)
    expect(pivot).toBeDefined()
    const points = [
      new Vector3(0.18, 0.05, -0.02),
      new Vector3(-0.17, -0.06, 0.03),
      new Vector3(0, 0.19, 0),
      new Vector3(0, 0, 0),
    ]
    for (const steer of [0, 0.3, -0.7, 1]) {
      const slider = chassis(previous, { distance: 0.01, height: 0.025 }, undefined, steer)
      const baked = chassis(root.translation, { distance: 0, height: 0 }, pivot, steer)
      for (const p of points)
        expect(
          p.clone().applyMatrix4(baked).distanceTo(p.clone().applyMatrix4(slider)),
        ).toBeLessThan(1e-9)
    }
  })
})
