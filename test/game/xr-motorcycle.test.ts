import { expect, it } from 'vitest'
import * as THREE from 'three'
import { XRMotorcycle, type MotorcycleGrab } from '../../src/runtime/xr-motorcycle.js'
import { XRCalibration } from '../../src/runtime/xr-calibration.js'
function fixture() {
  const calibration = new XRCalibration(),
    control = new XRMotorcycle(calibration)
  const frame = new THREE.Group(),
    bar = new THREE.Group()
  frame.add(bar)
  const rig: MotorcycleGrab = {
    frame,
    bar,
    pivot: new THREE.Vector3(),
    axis: new THREE.Vector3(0, 1, 0),
    left: new THREE.Vector3(-0.3, 0, 0),
    right: new THREE.Vector3(0.3, 0, 0),
    steerLimit: 0.6,
  }
  const hand = (side: 'left' | 'right') => {
    const grip = new THREE.Group(),
      mount = new THREE.Group()
    frame.add(grip)
    grip.position.copy(rig[side])
    const buttons = [
      { value: 0, pressed: false },
      { value: 0, pressed: false },
    ]
    return {
      grip,
      mount,
      source: { handedness: side, gamepad: { buttons } } as unknown as XRInputSource,
      buttons,
    }
  }
  const left = hand('left'),
    right = hand('right'),
    hands = [left, right]
  const tick = () => control.update(hands, rig, 0, true)
  return { control, calibration, rig, frame, left, right, hands, tick }
}
it('requires grip for each analog brake and opens throttle only by twisting the held right wrist', () => {
  const f = fixture()
  f.left.buttons[0].value = 0.4
  f.right.buttons[0].value = 0.7
  expect(f.tick()).toEqual({ throttle: 0, steering: 0, frontBrake: 0, rearBrake: 0 })
  f.left.buttons[1].value = 1
  f.right.buttons[1].value = 1
  expect(f.tick()).toMatchObject({ throttle: 0, frontBrake: 0.7, rearBrake: 0.4 })
  f.right.grip.rotation.x = Math.PI / 4
  expect(f.tick().throttle).toBeCloseTo(1)
  f.right.buttons[1].value = 0
  expect(f.tick()).toMatchObject({ throttle: 0, frontBrake: 0, rearBrake: 0.4 })
  f.right.buttons[1].value = 1
  expect(f.tick().throttle).toBe(0) // regrip defines a new closed wrist
})
it('steers one-handed, ignores vehicle motion and clears control when tracking or visibility is lost', () => {
  const f = fixture()
  f.right.buttons[1].value = 1
  f.tick()
  f.right.grip.position.applyAxisAngle(f.rig.axis, -Math.PI / 12)
  expect(f.tick().steering).toBeCloseTo(0.5)
  f.frame.position.set(100, 30, -200)
  f.frame.rotation.set(0.3, 1, 0.2)
  expect(f.tick().steering).toBeCloseTo(0.5)
  expect(f.tick().throttle).toBeCloseTo(0)
  expect(f.control.update([], f.rig, 0, true).throttle).toBe(0)
  expect(f.control.owns(f.right.source)).toBe(false)
  f.tick()
  expect(f.control.update(f.hands, f.rig, 0, false)).toEqual({
    throttle: 0,
    steering: 0,
    frontBrake: 0,
    rearBrake: 0,
  })
})
it('calibrates throttle direction, travel and brake gain, with immediate release for an occupied hand', () => {
  const f = fixture()
  f.calibration.set('bike-controls', { x: 60, y: 0, rz: -1, rx: 50 }, false)
  f.right.buttons[1].value = 1
  f.right.buttons[0].value = 0.6
  f.tick()
  f.right.grip.rotation.x = -Math.PI / 6
  expect(f.tick()).toMatchObject({ frontBrake: 0.3 })
  expect(f.tick().throttle).toBeCloseTo(0.5)
  expect(f.control.update([f.left], f.rig, 0, true).throttle).toBe(0)
})
