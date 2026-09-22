import { describe, expect, it } from 'vitest'
import { Euler, Group, Quaternion, Vector3 } from 'three'
import {
  driverHeadPose,
  followDrivingHeading,
  DrivingTelemetry,
} from '../playground/driving-camera.js'
import { MonitorMotion } from '../playground/avatar.js'

describe('driving and monitor presentation', () => {
  it('respects manual look, follows a chase turn and takes the short path across ±pi', () => {
    expect(followDrivingHeading(1, 0, 0, 20, 1 / 60, 500)).toBe(1)
    let yaw = 0
    for (let i = 0; i < 30; i++) yaw = followDrivingHeading(yaw, 1, 0, 20, 1 / 60, 2000)
    expect(yaw).toBeGreaterThan(0.99)
    expect(followDrivingHeading(3.12, -3.12, 0, 20, 1 / 60, 2000)).toBeGreaterThan(3.12)
  })
  it('follows equally at 30 and 120 fps', () => {
    const advance = (fps: number) => {
      let yaw = 0
      for (let i = 0; i < fps; i++) yaw = followDrivingHeading(yaw, 1, 0.4, 25, 1 / fps, 2000)
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
      expect(offset.distanceTo(new Vector3(0, -0.15, -0.26))).toBeLessThan(1e-10)
    }
  })
  it('looks forward with the car by default and keeps the carrier eye anchor', () => {
    const body = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
    const head = driverHeadPose([1, 2, 3], body.toArray(), true, 0, 0)
    expect(head.position.toArray()).toEqual([1, 2, 3])
    expect(head.quaternion.angleTo(body)).toBeLessThan(1e-7)
  })
})
