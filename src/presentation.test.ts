import { describe, expect, it } from 'vitest'
import { Group, Vector3 } from 'three'
import { followDrivingHeading } from '../playground/driving-camera.js'
import { MonitorMotion } from '../playground/avatar.js'

describe('driving and monitor presentation', () => {
  it('respects manual look, follows a cockpit turn and takes the short path across ±pi', () => {
    expect(followDrivingHeading(1, 0, 0, 20, 1 / 60, 500, true)).toBe(1)
    let yaw = 0
    for (let i = 0; i < 30; i++) yaw = followDrivingHeading(yaw, 1, 0, 20, 1 / 60, 2000, true)
    expect(yaw).toBeGreaterThan(0.99)
    expect(followDrivingHeading(3.12, -3.12, 0, 20, 1 / 60, 2000, false)).toBeGreaterThan(3.12)
  })
  it('follows equally at 30 and 120 fps', () => {
    const advance = (fps: number) => {
      let yaw = 0
      for (let i = 0; i < fps; i++)
        yaw = followDrivingHeading(yaw, 1, 0.4, 25, 1 / fps, 2000, false)
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
