import { expect, it } from 'vitest'
import * as THREE from 'three'
import { XRGrab, type GrabHand } from '../../src/runtime/xr-grab.js'
import type { Sidearm } from '../../src/runtime/sidearm.js'
function hand(): GrabHand {
  const grip = new THREE.Group(),
    mount = new THREE.Group()
  grip.add(mount)
  return {
    grip,
    mount,
    source: {
      gamepad: { buttons: [{ pressed: false }, { pressed: false }] },
    } as unknown as XRInputSource,
  }
}
function squeeze(h: GrabHand, pressed: boolean) {
  ;(h.source!.gamepad!.buttons[1] as { pressed: boolean }).pressed = pressed
}
it('grabs from the chest with either hand, returns to the chest on release', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera()
  camera.position.y = 1.6
  scene.add(camera)
  const controls = new XRGrab(scene),
    left = hand(),
    right = hand()
  scene.add(left.grip, right.grip)
  const model = new THREE.Group(),
    socket = new THREE.Group()
  socket.name = 'GripSocket'
  model.add(socket)
  const weapon = {
    model,
    state: { slide: 0 },
    syncTracked(parent: THREE.Group) {
      parent.add(model)
      model.position.set(0, 0, 0)
    },
  } as unknown as Sidearm
  const tick = () =>
    controls.pistol(
      weapon,
      [left, right],
      camera,
      new THREE.Vector3(),
      1,
      0.01,
      true,
      100,
      () => null,
    )
  tick()
  expect(controls.holder).toBeNull()
  left.grip.position.copy(controls.chest.position)
  squeeze(left, true)
  tick()
  expect(controls.holder).toBe(left)
  left.grip.position.x += 0.5
  tick()
  squeeze(left, false)
  tick()
  expect(controls.holder).toBeNull()
  expect(model.parent).toBe(controls.chest)
  right.grip.position.copy(socket.getWorldPosition(new THREE.Vector3()))
  squeeze(right, true)
  tick()
  expect(controls.holder).toBe(right)
  controls.pistol(weapon, [], camera, new THREE.Vector3(), 2, 0, false, 100, () => null)
  expect(controls.holder).toBeNull()
})
it('turns the wheel while squeezed and releases it without applying the brake', () => {
  const scene = new THREE.Scene(),
    parent = new THREE.Group(),
    spin = new THREE.Group()
  spin.add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02), new THREE.MeshBasicMaterial()))
  parent.add(spin)
  scene.add(parent)
  const h = hand()
  scene.add(h.grip)
  h.grip.position.set(0.2, 0, 0)
  const controls = new XRGrab(scene),
    wheel = { spin, axis: new THREE.Vector3(0, 0, 1), pivot: new THREE.Vector3() }
  expect(controls.wheel([h], wheel, 0)).toBeNull()
  squeeze(h, true)
  expect(controls.wheel([h], wheel, 0)).toBeCloseTo(0)
  h.grip.position.set(0, 0.2, 0)
  expect(controls.wheel([h], wheel, 0)).toBeCloseTo(1)
  squeeze(h, false)
  expect(controls.wheel([h], wheel, 0)).toBeNull()
})

it('moves the slide with the free hand and returns it on release', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera()
  camera.position.y = 1.6
  scene.add(camera)
  const controls = new XRGrab(scene),
    left = hand(),
    right = hand()
  scene.add(left.grip, right.grip)
  const model = new THREE.Group(),
    slide = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.1), new THREE.MeshBasicMaterial())
  model.add(slide)
  const moves: number[] = []
  const weapon = {
    model,
    state: { slide: 0 },
    trackedSlide: { object: slide, axis: new THREE.Vector3(0, 0, 1), travel: 0.012 },
    release() {},
    moveSlide(travel: number) {
      moves.push(travel)
      return {}
    },
    syncTracked(parent: THREE.Group) {
      parent.add(model)
      model.position.set(0, 0, 0)
    },
  } as unknown as Sidearm
  const tick = () =>
    controls.pistol(
      weapon,
      [left, right],
      camera,
      new THREE.Vector3(),
      1,
      0.01,
      true,
      100,
      () => null,
    )
  tick()
  right.grip.position.copy(controls.chest.position)
  squeeze(right, true)
  tick()
  left.grip.position.copy(slide.getWorldPosition(new THREE.Vector3()))
  squeeze(left, true)
  tick()
  expect(controls.slideHeld).toBe(true)
  left.grip.position.z += 0.012
  tick()
  expect(moves.at(-1)).toBeCloseTo(1)
  squeeze(left, false)
  tick()
  expect(moves.at(-1)).toBe(0)
  expect(controls.holder).toBe(right)
})
