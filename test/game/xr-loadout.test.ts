import { expect, it } from 'vitest'
import * as THREE from 'three'
import { XRLoadout } from '../../src/runtime/xr-loadout.js'
import type { Sidearm } from '../../src/runtime/sidearm.js'
import type { GrabHand } from '../../src/runtime/xr-grab.js'
import {
  freshFirearm,
  takeMagazine,
  seatMagazine,
  moveSlide,
} from '../../src/simulation/weapons/firearm.js'

const spec = {
  magazineCapacity: 13,
  chamber: 1,
  cycleMs: 100,
  reloadMs: { magazineOut: 100, magazineIn: 100, slideRelease: 100 },
}
function weapon(): Sidearm {
  const model = new THREE.Group()
  const grip = new THREE.Group()
  grip.name = 'GripSocket'
  const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.025))
  magazine.position.y = -0.08
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.03, 0.1))
  slide.position.y = 0.05
  model.add(grip, magazine, slide)
  const state = freshFirearm(spec)
  return {
    model,
    state,
    visible: true,
    trackedMagazine: magazine,
    trackedSlide: { object: slide, axis: new THREE.Vector3(0, 0, 1), travel: 0.02 },
    magazineClone: () => magazine.clone(),
    syncTracked(parent: THREE.Group) {
      parent.add(model)
      model.position.set(0, 0, 0)
      model.updateWorldMatrix(true, true)
    },
    release() {},
    takeMagazine: () => takeMagazine(state),
    seatMagazine: (m: Parameters<typeof seatMagazine>[1]) => seatMagazine(state, m),
    moveSlide: (travel: number, now: number) => moveSlide(state, spec, travel, now),
    worldMagazineDropView: () => ({
      position: magazine.getWorldPosition(new THREE.Vector3()),
      quaternion: magazine.getWorldQuaternion(new THREE.Quaternion()),
      direction: new THREE.Vector3(0, -1, 0),
    }),
  } as unknown as Sidearm
}
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
it('keeps thrown magazines through origin shifts and tracking loss, with no pocket refill', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera()
  camera.position.y = 1.65
  scene.add(camera)
  const loadout = new XRLoadout(scene, [weapon(), weapon()]),
    h = hand()
  scene.add(h.grip)
  const origin = new THREE.Vector3()
  const tick = (enabled = true) =>
    loadout.update(
      [h],
      camera,
      origin,
      1000,
      0.01,
      enabled,
      100,
      () => null,
      () => {},
    )
  tick()
  const magazine = loadout.magazines[0]
  const id = magazine.entity.id
  magazine.entity.rounds = 4
  h.grip.position.copy(magazine.root.getWorldPosition(new THREE.Vector3()))
  squeeze(h, true)
  tick()
  expect(magazine.holder).toBe(h)
  h.grip.position.x += 0.5
  tick()
  squeeze(h, false)
  tick()
  expect(magazine.pocket).toBeNull()
  expect(magazine.holder).toBeNull()
  const x = magazine.root.position.x
  origin.x = 1000
  tick()
  expect(magazine.root.position.x).toBeCloseTo(x - 1000 + magazine.velocity.x * 0.01)
  expect(loadout.magazines).toHaveLength(2)
  h.grip.position.copy(magazine.root.getWorldPosition(new THREE.Vector3()))
  squeeze(h, true)
  tick()
  expect(magazine.holder).toBe(h)
  tick(false)
  expect(magazine.holder).toBeNull()
  expect(magazine.entity.id).toBe(id)
  expect(magazine.entity.rounds).toBe(4)
  expect(loadout.body.visible).toBe(false)
  expect(loadout.pistols.every((p) => !p.weapon.model.visible)).toBe(true)
  tick()
  expect(loadout.magazines).toHaveLength(2)
  loadout.dispose()
})

it('allows either hand to draw either pistol but never gives one hand two objects', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera()
  camera.position.y = 1.65
  scene.add(camera)
  const loadout = new XRLoadout(scene, [weapon(), weapon()]),
    a = hand(),
    b = hand()
  scene.add(a.grip, b.grip)
  const tick = () =>
    loadout.update(
      [a, b],
      camera,
      new THREE.Vector3(),
      1000,
      0.01,
      true,
      100,
      () => null,
      () => {},
    )
  tick()
  a.grip.position.copy(loadout.pistols[1].holster.getWorldPosition(new THREE.Vector3()))
  b.grip.position.copy(loadout.pistols[0].holster.getWorldPosition(new THREE.Vector3()))
  squeeze(a, true)
  squeeze(b, true)
  tick()
  expect(loadout.pistols[1].holder).toBe(a)
  expect(loadout.pistols[0].holder).toBe(b)
  expect(loadout.magazines.every((m) => !m.holder)).toBe(true)
  const heldPosition = loadout.pistols[1].weapon.model.getWorldPosition(new THREE.Vector3())
  const heldRotation = loadout.pistols[1].weapon.model.getWorldQuaternion(new THREE.Quaternion())
  loadout.calibration.set('pistol-1', { x: 25, rx: 30 }, false)
  loadout.calibration.set('holster-1', { y: 20 }, false)
  tick()
  expect(
    loadout.pistols[1].weapon.model.getWorldPosition(new THREE.Vector3()).distanceTo(heldPosition),
  ).toBeCloseTo(0)
  expect(
    loadout.pistols[1].weapon.model
      .getWorldQuaternion(new THREE.Quaternion())
      .angleTo(heldRotation),
  ).toBeCloseTo(0)

  squeeze(a, false)
  tick()
  expect(loadout.pistols[1].holder).toBeNull()
  expect(loadout.pistols[1].weapon.model.parent).toBe(loadout.pistols[1].adjustment)
  expect(loadout.pistols[1].adjustment.parent).toBe(loadout.pistols[1].holster)
  loadout.dispose()
})
