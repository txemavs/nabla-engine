import { describe, expect, it } from 'vitest'
import { Euler, Group, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import {
  driverHeadPose,
  overheadDrivingPose,
  overheadDrivingHeight,
  followDrivingHeading,
  DrivingTelemetry,
} from '../../src/render/entity/driving-camera.js'
import { MonitorMotion } from '../../src/render/entity/avatar.js'

describe('driving and monitor presentation', () => {
  it('respects manual look, follows a chase turn and takes the short path across ±pi', () => {
    expect(followDrivingHeading(1, 0, 0, 20, 1 / 60, 500)).toBe(1)
    let yaw = 0
    for (let i = 0; i < 30; i++) yaw = followDrivingHeading(yaw, 1, 0, 20, 1 / 60, 11000)
    expect(yaw).toBeGreaterThan(0.99)
    expect(followDrivingHeading(3.12, -3.12, 0, 20, 1 / 60, 11000)).toBeGreaterThan(3.12)
  })
  it('follows equally at 30 and 120 fps', () => {
    const advance = (fps: number) => {
      let yaw = 0
      for (let i = 0; i < fps; i++) yaw = followDrivingHeading(yaw, 1, 0.4, 25, 1 / fps, 11000)
      return yaw
    }
    expect(advance(30)).toBeCloseTo(advance(120), 6)
  })
  it('leans into travel, levels after stopping and resets across a teleport', () => {
    const motion = new MonitorMotion(),
      model = new Group(),
      position = new Vector3()
    motion.update(model, position, 0, 1 / 60)
    for (let i = 0; i < 60; i++) {
      position.z -= 4 / 60
      motion.update(model, position, 0, 1 / 60)
    }
    expect(model.rotation.x).toBeLessThan(-0.15)
    for (let i = 0; i < 120; i++) motion.update(model, position, 0, 1 / 60)
    expect(Math.abs(model.rotation.x)).toBeLessThan(0.01)
    position.x += 100
    motion.update(model, position, 0, 1 / 60)
    expect(Math.abs(model.rotation.z)).toBeLessThan(0.01)
  })
})

it('filters alternating physics noise instead of pumping the camera framing', () => {
  const filter = new DrivingTelemetry()
  filter.update('car', 20, 0, 1 / 120)
  const speeds: number[] = [],
    turns: number[] = []
  for (let i = 0; i < 120; i++) {
    filter.update('car', 20 + (i % 2 ? 1 : -1), i % 2 ? 0.5 : -0.5, 1 / 120)
    speeds.push(filter.speed)
    turns.push(filter.turnRate)
  }
  expect(Math.max(...speeds) - Math.min(...speeds)).toBeLessThan(0.1)
  expect(Math.max(...turns) - Math.min(...turns)).toBeLessThan(0.05)
})

describe('rigid driver head', () => {
  it('keeps the same local gaze through chassis yaw, pitch, roll and portal rotations', () => {
    const local = driverHeadPose([0, 0, 0], [0, 0, 0, 1], false, 0.6, 0.2)
    for (const angles of [
      [0, 1.2, 0],
      [0.2, -2.9, 0.3],
      [-0.4, Math.PI, -0.2],
    ]) {
      const body = new Quaternion().setFromEuler(
        new Euler(...(angles as [number, number, number]), 'YXZ'),
      )
      const driver = new Vector3(20, 4, -10)
      const head = driverHeadPose(driver.toArray(), body.toArray(), false, 0.6, 0.2)
      expect(
        head.quaternion.clone().premultiply(body.clone().invert()).angleTo(local.quaternion),
      ).toBeLessThan(1e-7)
      const offset = head.position.sub(driver).applyQuaternion(body.clone().invert())
      expect(offset.distanceTo(new Vector3(0, -0.15, -0.36))).toBeLessThan(1e-10)
    }
  })
  it('looks forward with the car by default and offsets the carrier eye down and back', () => {
    const body = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
    const head = driverHeadPose([1, 2, 3], body.toArray(), true, 0, 0)
    const expected = new Vector3(0, -0.1, 0.2).applyQuaternion(body).add(new Vector3(1, 2, 3))
    expect(head.position.distanceTo(expected)).toBeLessThan(1e-7)
    expect(head.quaternion.angleTo(body)).toBeLessThan(1e-7)
  })
})

describe('vehicle-up overhead camera', () => {
  it('keeps the nose at screen top through turns and on a tilted planet frame', () => {
    for (const tilt of [0, 0.7]) {
      const frame = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), tilt)
      const normal = new Vector3(0, 1, 0).applyQuaternion(frame)
      for (const yaw of [0, 0.8, Math.PI, -2.9]) {
        const rotation = frame
          .clone()
          .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw))
        const pose = overheadDrivingPose([10, 20, 30], rotation.toArray(), 80, normal)
        const forward = new Vector3(0, 0, -1).applyQuaternion(rotation)
        expect(pose.up.dot(forward)).toBeCloseTo(1, 8)
        expect(
          pose.position
            .clone()
            .sub(new Vector3(10, 20, 30))
            .distanceTo(normal.clone().multiplyScalar(80)),
        ).toBeLessThan(1e-8)
      }
    }
  })
  it('has a finite heading even when an aircraft points straight upward', () => {
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)
    const pose = overheadDrivingPose([0, 0, 0], rotation.toArray(), 50)
    expect(pose.up.length()).toBeCloseTo(1)
    expect(pose.up.y).toBeCloseTo(0)
  })
})

it('frames the car at the lower quarter with a useful stopped view and speed-dependent range', () => {
  const stopped = overheadDrivingHeight(0)
  expect(stopped).toBe(45)
  expect(overheadDrivingHeight(0, 0.75)).toBe(45)
  expect(overheadDrivingHeight(250 / 3.6)).toBeGreaterThan(180)
  expect(overheadDrivingHeight(30, 2)).toBeGreaterThan(overheadDrivingHeight(30))
  for (const speed of [0, 30, 70]) {
    const height = overheadDrivingHeight(speed)
    const ahead = height * Math.tan((48 * Math.PI) / 360) * 0.5
    const pose = overheadDrivingPose([0, 0, 0], [0, 0, 0, 1], height, undefined, ahead)
    const camera = new PerspectiveCamera(48, 16 / 9, 0.1, 2000)
    camera.position.copy(pose.position)
    camera.up.copy(pose.up)
    camera.lookAt(pose.target)
    camera.updateMatrixWorld(true)
    const screen = new Vector3().project(camera)
    expect(screen.x).toBeCloseTo(0)
    expect(screen.y).toBeCloseTo(-0.5)
    if (!speed) expect(ahead * 3).toBeCloseTo(30, 0)
  }
})
