import { expect, it } from 'vitest'
import * as THREE from 'three'
import { ARRCControls } from '../../src/runtime/xr-rc-controls.js'

it('steers with a held wheel, uses triggers only while held and releases safely', () => {
  const controls = new ARRCControls(new THREE.Scene())
  controls.kind = 's3'
  controls.enabled = true
  const camera = new THREE.PerspectiveCamera()
  controls.place(camera)
  const grip = new THREE.Group()
  grip.position.copy(controls.root.position).add(new THREE.Vector3(0.19, 0, 0))
  const buttons = [{ value: 0.8 }, { pressed: false }]
  const hand = {
    grip,
    mount: grip,
    source: { handedness: 'right', gamepad: { buttons } } as unknown as XRInputSource,
  }
  expect(controls.update([hand]).throttle).toBe(0)
  buttons[1].pressed = true
  expect(controls.update([hand]).throttle).toBe(0.8)
  grip.position.copy(controls.root.position).add(new THREE.Vector3(0, 0.19, 0))
  expect(controls.update([hand]).steering).toBeCloseTo(-1)
  buttons[1].pressed = false
  expect(controls.update([hand])).toEqual({
    throttle: 0,
    steering: 0,
    brake: 0,
    frontBrake: 0,
    rearBrake: 0,
    forklift: [0, 0, 0],
  })
  expect(controls.owns(grip, hand.source)).toBe(false)
  controls.enabled = false
  controls.update([])
  expect(controls.root.visible).toBe(false)
})

it('follows the body without pitch/roll and keeps each AR station offset independent', async () => {
  const { XRCalibration } = await import('../../src/runtime/xr-calibration.js')
  const calibration = new XRCalibration()
  calibration.set('ar-rc-s3', { x: 10, y: 5, z: -8, ry: 12 }, false)
  calibration.set('ar-rc-truck', { x: -15 }, false)
  const controls = new ARRCControls(new THREE.Scene(), calibration)
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(1, 1.6, 2)
  controls.kind = 's3'
  controls.enabled = true
  controls.place(camera)
  expect(controls.root.position.toArray()).toEqual([0.1, -0.3, -0.53])
  camera.position.set(3, 1.7, 4)
  camera.rotation.set(0.4, 0.7, 0.2, 'YXZ')
  controls.update([])
  expect(controls.body.position.toArray()).toEqual([3, 1.7, 4])
  expect(controls.body.rotation.x).toBe(0)
  expect(controls.body.rotation.z).toBe(0)
  expect(Math.abs(controls.body.rotation.y)).toBeLessThan(0.1)
  expect(
    controls.root.quaternion.angleTo(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        THREE.MathUtils.degToRad(192),
      ),
    ),
  ).toBeCloseTo(0)
  controls.kind = 'truck'
  controls.update([])
  expect(controls.root.position.toArray()).toEqual([-0.15, -0.35, -0.45])
  controls.kind = 'vfr'
  controls.update([])
  expect(controls.root.position.toArray()).toEqual([0, -0.35, -0.45])
  expect(calibration.get('bike-left')).toEqual({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 })
})

it('retains the wheel grip when the user moves with the station', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera()
  const controls = new ARRCControls(scene)
  controls.kind = 's3'
  controls.enabled = true
  controls.place(camera)
  const grip = new THREE.Group()
  scene.add(grip)
  grip.position.copy(controls.root.localToWorld(new THREE.Vector3(0.19, 0, 0)))
  const source = {
    handedness: 'right',
    gamepad: { buttons: [{ value: 0.5 }, { pressed: true }] },
  } as unknown as XRInputSource
  const hand = { grip, source }
  controls.update([hand])
  camera.position.x += 1
  grip.position.x += 1
  const input = controls.update([hand])
  expect(controls.owns(grip, source)).toBe(true)
  expect(input.throttle).toBe(0.5)
  expect(input.steering).toBeCloseTo(0)
})

it('pins with the lower button, follows the chest again and ignores the two-trigger chord', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera()
  const controls = new ARRCControls(scene)
  controls.enabled = true
  controls.kind = 's3'
  controls.place(camera)
  const hands = ['left', 'right'].map((handedness) => ({
    grip: new THREE.Group(),
    source: {
      handedness,
      gamepad: { buttons: [{ pressed: true, value: 1 }, { pressed: false }] },
    } as unknown as XRInputSource,
  }))
  controls.update(hands)
  expect(controls.fixed).toBe(false)
  const h = hands[0]
  scene.add(h.grip)
  h.grip.position.copy(controls.pinButton.getWorldPosition(new THREE.Vector3()))
  controls.update([h])
  expect(controls.fixed).toBe(true)
  const p = controls.body.position.clone()
  camera.position.x = 2
  controls.update([h])
  expect(controls.body.position.equals(p)).toBe(true)
  ;(h.source.gamepad!.buttons[0] as { pressed: boolean; value: number }).pressed = false
  ;(h.source.gamepad!.buttons[0] as { value: number }).value = 0
  controls.update([h])
  ;(h.source.gamepad!.buttons[0] as { pressed: boolean }).pressed = true
  controls.update([h])
  controls.update([])
  expect(controls.fixed).toBe(false)
  expect(controls.body.position.x).toBe(2)
  controls.dispose()
})

it('grabs the lower base and pins the station at its moved pose', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera()
  const controls = new ARRCControls(scene)
  controls.enabled = true
  controls.kind = 'vfr'
  controls.place(camera)
  const grip = new THREE.Group()
  scene.add(grip)
  grip.position.copy(controls.pinButton.getWorldPosition(new THREE.Vector3()))
  const buttons = [
    { pressed: false, value: 0 },
    { pressed: true, value: 1 },
  ]
  const hand = {
    grip,
    source: { handedness: 'left', gamepad: { buttons } } as unknown as XRInputSource,
  }
  controls.update([hand])
  expect(controls.owns(grip, hand.source)).toBe(true)
  grip.position.x += 0.5
  controls.update([hand])
  expect(controls.body.position.x).toBeCloseTo(0.5)
  buttons[0].pressed = true
  controls.update([hand])
  expect(controls.fixed).toBe(true)
  buttons[1].pressed = false
  buttons[1].value = 0
  controls.update([])
  camera.position.x = 3
  controls.update([])
  expect(controls.body.position.x).toBeCloseTo(0.5)
  controls.dispose()
})

it('uses the engine signed drive command for braking and reverse while the wheel is held', () => {
  const controls = new ARRCControls(new THREE.Scene())
  controls.kind = 's3'
  controls.enabled = true
  const grip = new THREE.Group()
  grip.position.set(-0.19, 0, 0)
  const hand = {
    grip,
    source: {
      handedness: 'left',
      gamepad: { buttons: [{ value: 0.7 }, { pressed: true }] },
    } as unknown as XRInputSource,
  }
  const command = controls.update([hand])
  expect(command.throttle).toBe(-0.7)
  expect(command.brake).toBe(0)
  controls.dispose()
})

it('calibrates the forklift wheel and lever console independently while pinning them as one station', async () => {
  const { XRCalibration } = await import('../../src/runtime/xr-calibration.js')
  const calibration = new XRCalibration()
  const controls = new ARRCControls(new THREE.Scene(), calibration)
  controls.kind = 'forklift'
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(1, 1.6, 2)
  controls.place(camera)
  const knob = new THREE.Object3D()
  knob.position.set(0.45, -0.07, 0)
  controls.equipment.add(knob)
  const before = knob.getWorldPosition(new THREE.Vector3())
  calibration.set('ar-rc-forklift', { rx: -30, x: 8 }, false)
  controls.update([])
  expect(knob.getWorldPosition(new THREE.Vector3()).distanceTo(before)).toBeLessThan(1e-9)
  expect(controls.root.rotation.x).toBeCloseTo(-Math.PI / 6)
  const wheel = controls.root.matrixWorld.clone()
  calibration.set('ar-rc-forklift-levers', { rx: 15, z: 5 }, false)
  controls.update([])
  expect(controls.root.matrixWorld.equals(wheel)).toBe(true)
  expect(controls.equipment.rotation.x).toBeCloseTo(Math.PI / 12)
  expect(controls.equipment.position.z).toBeCloseTo(-0.4)
  controls.fixed = true
  const fixed = controls.equipment.matrixWorld.clone()
  camera.position.set(8, 2, 9)
  controls.update([], 1 / 60)
  expect(controls.equipment.matrixWorld.equals(fixed)).toBe(true)
  controls.enabled = false
  controls.update([])
  expect(controls.equipment.visible).toBe(false)
  controls.dispose()
})
