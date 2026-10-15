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
  seatCartridge,
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
    cartridgeClone: () => new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.02, 0.009)),
    worldChamber: () => slide.getWorldPosition(new THREE.Vector3()),
    seatCartridge: () => seatCartridge(state),
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
it('keeps thrown magazines through origin shifts and tracking loss, while replenishing the chest supply', () => {
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
  expect(loadout.magazines).toHaveLength(3)
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
  expect(loadout.magazines).toHaveLength(3)
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

it('replenishes full magazines of both sizes and bounds discarded ones', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera()
  const loadout = new XRLoadout(scene, [weapon(), weapon()])
  const tick = () =>
    loadout.update(
      [],
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
  for (let i = 0; i < 40; i++) {
    const m = loadout.magazines.find((m) => m.pocket === loadout.pockets[i % 2])!
    m.entity.rounds = 0
    m.pocket = null
    loadout.loose.attach(m.root)
    tick()
    const fresh = loadout.magazines.find((m) => m.pocket === loadout.pockets[i % 2])!
    expect(fresh.entity.rounds).toBe(i % 2 === 0 ? 13 : 30)
    expect(fresh.entity.id).not.toBe(m.entity.id)
  }
  expect(loadout.magazines).toHaveLength(18)
  loadout.dispose()
})

it('requires a downward pull to extract and an upward push to insert a held magazine', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera()
  camera.position.y = 1.65
  scene.add(camera)
  const gun = weapon(),
    loadout = new XRLoadout(scene, [gun]),
    right = hand(),
    left = hand()
  scene.add(right.grip, left.grip)
  right.grip.position.set(0.4, 1.2, -0.5)
  squeeze(right, true)
  loadout.pistols[0].holder = right
  let now = 0
  const tick = () =>
    loadout.update(
      [right, left],
      camera,
      new THREE.Vector3(),
      (now += 20),
      0.02,
      true,
      1024,
      () => null,
      () => {},
    )
  tick()
  left.grip.position
    .copy(gun.trackedMagazine!.getWorldPosition(new THREE.Vector3()))
    .add(new THREE.Vector3(0, -0.02, 0))
  squeeze(left, true)
  tick()
  expect(gun.state.magazineSeated).toBe(true)
  left.grip.position.y -= 0.05
  tick()
  expect(gun.state.magazineSeated).toBe(false)
  expect(loadout.magazines.some((m) => m.holder === left)).toBe(true)
  tick() // insertion corridor records the start, proximity alone does not seat
  expect(gun.state.magazineSeated).toBe(false)
  left.grip.position.y += 0.045
  tick()
  expect(gun.state.magazineSeated).toBe(true)
  loadout.dispose()
})

it('supports the front of a pistol and hands it over when the original grip releases', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera()
  camera.position.y = 1.65
  scene.add(camera)
  const gun = weapon(),
    loadout = new XRLoadout(scene, [gun]),
    right = hand(),
    left = hand()
  gun.worldMuzzle = () => gun.model.localToWorld(new THREE.Vector3(0, 0, -0.22))
  scene.add(right.grip, left.grip)
  right.grip.position.set(0.4, 1.2, -0.5)
  squeeze(right, true)
  loadout.pistols[0].holder = right
  const tick = () =>
    loadout.update(
      [right, left],
      camera,
      new THREE.Vector3(),
      0,
      0.02,
      true,
      1024,
      () => null,
      () => {},
    )
  tick()
  left.grip.position.copy(gun.worldMuzzle()!)
  squeeze(left, true)
  tick()
  expect(loadout.supported(loadout.pistols[0])).toBe(true)
  expect(gun.trackedSupport).toBe(true)
  squeeze(right, false)
  tick()
  expect(loadout.pistols[0].holder).toBe(left)
  expect(loadout.supported(loadout.pistols[0])).toBe(false)
  loadout.dispose()
})

it('toggles the existing laser once per fingertip touch, with separation required to toggle again', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(),
    gun = weapon()
  const muzzle = new THREE.Vector3(0, 1, -0.5)
  let on = false,
    toggles = 0
  Object.assign(gun, {
    worldMuzzle: () => muzzle.clone(),
    toggleLaser: () => {
      toggles++
      return (on = !on)
    },
  })
  Object.defineProperty(gun, 'laserEnabled', { get: () => on })
  const loadout = new XRLoadout(scene, [gun]),
    owner = hand(),
    finger = hand()
  const tip = new THREE.Group()
  scene.add(tip, owner.grip, finger.grip)
  finger.visual = { indexTip: tip }
  squeeze(owner, true)
  loadout.pistols[0].holder = owner
  const tick = () =>
    loadout.update(
      [owner, finger],
      camera,
      new THREE.Vector3(),
      1000,
      1 / 90,
      true,
      100,
      () => null,
      () => {},
    )
  tip.position.copy(muzzle)
  tick()
  tick()
  expect(toggles).toBe(1)
  expect(on).toBe(true)
  tip.position.x = 0.04
  tick()
  expect(toggles).toBe(1)
  tip.position.x = 0.08
  tick()
  tip.position.copy(muzzle)
  tick()
  expect(toggles).toBe(2)
  expect(on).toBe(false)
  loadout.dispose()
})

it('draws the native laser at its authored socket and clips it to the hit without creating an impact', () => {
  const scene = new THREE.Scene(),
    gun = weapon(),
    loadout = new XRLoadout(scene, [gun]),
    owner = hand()
  loadout.pistols[0].holder = owner
  Object.defineProperty(gun, 'laserEnabled', { value: true })
  Object.defineProperty(gun, 'range', { value: 50 })
  Object.assign(gun, {
    accessoryRay: (_now: number, _fp: boolean, _fov: number, socket: string) => {
      expect(socket).toBe('RedLaserSocket')
      return { origin: new THREE.Vector3(1, 2, 3), target: new THREE.Vector3(1, 2, -7) }
    },
  })
  let casts = 0
  loadout.updateLasers(1000, 65, (origin, direction, range) => {
    casts++
    expect(origin.toArray()).toEqual([1, 2, 3])
    expect(direction.toArray()).toEqual([0, 0, -1])
    expect(range).toBe(50)
    return new THREE.Vector3(1, 2, -2)
  })
  expect(casts).toBe(1)
  const laser = scene.children.find((o) => o.name === 'Shot laser')!
  expect(laser.visible).toBe(true)
  expect(laser.children[1].position.toArray()).toEqual([1, 2, -2])
  loadout.suspend(1010)
  expect(laser.visible).toBe(false)
  loadout.dispose()
})

it('AR pistols remain loose until picked up and released at their holster', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera()
  camera.position.y = 1.65
  scene.add(camera)
  const loadout = new XRLoadout(scene, [weapon()]),
    h = hand()
  scene.add(h.grip)
  loadout.physicalPistols = true
  let drops = 0
  loadout.droppedPhysics = () => {
    drops++
    return true
  }
  let now = 0
  const tick = () =>
    loadout.update(
      [h],
      camera,
      new THREE.Vector3(),
      (now += 16),
      0.016,
      true,
      1024,
      () => null,
      () => {},
    )
  tick()
  const p = loadout.pistols[0]
  h.grip.position.copy(p.holster.getWorldPosition(new THREE.Vector3()))
  squeeze(h, true)
  tick()
  expect(p.holder).toBe(h)
  h.grip.position.x += 0.5
  tick()
  squeeze(h, false)
  tick()
  expect(p.dropped).toBe(true)
  expect(loadout.mount(p)).toBe(p.holdMount)
  expect(drops).toBeGreaterThan(0)
  h.grip.position.copy(p.holdMount.getWorldPosition(new THREE.Vector3()))
  h.mount.rotation.set(0.3, -0.7, 0.2)
  squeeze(h, true)
  tick()
  expect(p.holder).toBe(h)
  expect(p.dropped).toBe(false)
  expect(
    p.holdMount
      .getWorldQuaternion(new THREE.Quaternion())
      .angleTo(h.mount.getWorldQuaternion(new THREE.Quaternion())),
  ).toBeLessThan(1e-6)
  expect(
    p.holdMount
      .getWorldPosition(new THREE.Vector3())
      .distanceTo(h.mount.getWorldPosition(new THREE.Vector3())),
  ).toBeLessThan(1e-6)
  h.grip.position.copy(p.holster.getWorldPosition(new THREE.Vector3()))
  tick()
  squeeze(h, false)
  tick()
  expect(p.dropped).toBe(false)
  expect(loadout.mount(p)).toBe(p.adjustment)
  loadout.dispose()
})

it('touching the safety toggles once until the fingertip separates', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(),
    w = weapon()
  camera.position.y = 1.65
  scene.add(camera)
  let safe = false,
    changes = 0
  w.setSafety = (value: boolean) => {
    safe = value
    changes++
  }
  Object.defineProperty(w, 'safe', { get: () => safe })
  const lever = new THREE.Group()
  lever.name = 'SafetyLeverPivot'
  lever.position.x = 0.03
  w.model.add(lever)
  const loadout = new XRLoadout(scene, [w]),
    h = hand(),
    other = hand()
  other.visual = { indexTip: new THREE.Object3D() }
  scene.add(h.grip, other.grip, other.visual.indexTip)
  other.grip.position.x = 3
  other.visual.indexTip.position.x = 3
  let now = 0
  const tick = () =>
    loadout.update(
      [h, other],
      camera,
      new THREE.Vector3(),
      (now += 16),
      0.016,
      true,
      1024,
      () => null,
      () => {},
    )
  tick()
  h.grip.position.copy(loadout.pistols[0].holster.getWorldPosition(new THREE.Vector3()))
  squeeze(h, true)
  tick()
  other.visual.indexTip.position.copy(lever.getWorldPosition(new THREE.Vector3()))
  tick()
  tick()
  expect(safe).toBe(true)
  expect(changes).toBe(1)
  other.visual.indexTip.position.x += 0.1
  tick()
  other.visual.indexTip.position.copy(lever.getWorldPosition(new THREE.Vector3()))
  tick()
  expect(safe).toBe(false)
  expect(changes).toBe(2)
  loadout.dispose()
})

it('B/Y drops the actual magazine once while the button stays down', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(),
    h = hand()
  camera.position.y = 1.65
  scene.add(camera, h.grip)
  const loadout = new XRLoadout(scene, [weapon()])
  let now = 0
  const tick = () =>
    loadout.update(
      [h],
      camera,
      new THREE.Vector3(),
      (now += 16),
      0.016,
      true,
      1024,
      () => null,
      () => {},
    )
  tick()
  h.grip.position.copy(loadout.pistols[0].holster.getWorldPosition(new THREE.Vector3()))
  squeeze(h, true)
  tick()
  const buttons = h.source!.gamepad!.buttons as GamepadButton[]
  buttons[5] = { pressed: true, touched: true, value: 1 }
  tick()
  tick()
  expect(loadout.pistols[0].weapon.state.magazineSeated).toBe(false)
  expect(loadout.magazines.filter((m) => !m.holder && !m.pocket)).toHaveLength(1)
  loadout.dispose()
})

it('keeps the front hold on transfer and seats the handle when the other hand returns', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(),
    w = weapon()
  camera.position.y = 1.65
  const front = new THREE.Group()
  front.position.z = -0.2
  w.model.add(front)
  w.worldMuzzle = () => front.getWorldPosition(new THREE.Vector3())
  const a = hand(),
    b = hand(),
    loadout = new XRLoadout(scene, [w])
  scene.add(camera, a.grip, b.grip)
  b.grip.position.x = 3
  loadout.physicalPistols = true
  let now = 0
  const tick = () =>
    loadout.update(
      [a, b],
      camera,
      new THREE.Vector3(),
      (now += 16),
      0.016,
      true,
      1000,
      () => null,
      () => {},
    )
  tick()
  const p = loadout.pistols[0]
  a.grip.position.copy(p.holster.getWorldPosition(new THREE.Vector3()))
  squeeze(a, true)
  tick()
  a.grip.position.x += 0.4
  tick()
  b.grip.position.copy(w.worldMuzzle()!)
  squeeze(b, true)
  tick()
  const before = p.holdMount.getWorldQuaternion(new THREE.Quaternion())
  squeeze(a, false)
  tick()
  expect(p.holder).toBe(b)
  expect(p.gripMode).toBe('free')
  expect(p.holdMount.getWorldQuaternion(new THREE.Quaternion()).angleTo(before)).toBeLessThan(1e-6)
  a.grip.position.copy(w.model.getObjectByName('GripSocket')!.getWorldPosition(new THREE.Vector3()))
  a.mount.rotation.set(0.2, 0.6, -0.3)
  squeeze(a, true)
  tick()
  expect(p.holder).toBe(a)
  expect(p.gripMode).toBe('handle')
  expect(
    p.holdMount
      .getWorldQuaternion(new THREE.Quaternion())
      .angleTo(a.mount.getWorldQuaternion(new THREE.Quaternion())),
  ).toBeLessThan(1e-6)
  expect(loadout.supported(p)).toBe(true)
  loadout.dispose()
})

it('always draws from the holster into the calibrated handle even when grabbing the slide', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(),
    h = hand(),
    w = weapon()
  scene.add(camera, h.grip)
  const loadout = new XRLoadout(scene, [w])
  const tick = () =>
    loadout.update(
      [h],
      camera,
      new THREE.Vector3(),
      1000,
      0.016,
      true,
      100,
      () => null,
      () => {},
    )
  tick()
  h.grip.position.copy(w.trackedSlide!.object.getWorldPosition(new THREE.Vector3()))
  h.mount.rotation.set(0.3, -0.5, 0.2)
  squeeze(h, true)
  tick()
  const p = loadout.pistols[0]
  expect(p.gripMode).toBe('handle')
  expect(p.holder).toBe(h)
  expect(
    p.holdMount
      .getWorldQuaternion(new THREE.Quaternion())
      .angleTo(h.mount.getWorldQuaternion(new THREE.Quaternion())),
  ).toBeLessThan(1e-6)
  loadout.dispose()
})

it('grabs a live round and consumes it once when inserted into an open chamber', () => {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(),
    h = hand(),
    w = weapon()
  scene.add(camera, h.grip)
  const loadout = new XRLoadout(scene, [w])
  const tick = () =>
    loadout.update(
      [h],
      camera,
      new THREE.Vector3(),
      1000,
      0.016,
      true,
      100,
      () => null,
      () => {},
    )
  tick()
  w.moveSlide(1, 1000)
  const c = loadout.addCartridge(w, new THREE.Vector3(2, 1, 0))!
  h.grip.position.copy(c.root.position)
  squeeze(h, true)
  tick()
  expect(c.holder).toBe(h)
  h.grip.position.copy(w.worldChamber()!)
  tick()
  expect(w.state.chamber).toBe(1)
  expect(loadout.cartridges).toHaveLength(0)
  const rounds = w.state.magazine
  w.moveSlide(0, 1016)
  expect(w.state.magazine).toBe(rounds)
  expect(w.state.chamber).toBe(1)
  expect(w.seatCartridge()).toBe(false)
  loadout.dispose()
})
