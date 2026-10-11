import { expect, it } from 'vitest'
import { Group, Object3D, Quaternion, Vector3 } from 'three'
import { Sidearm } from '../../src/runtime/sidearm.js'
import { normalizeWeaponPoses } from '../../src/runtime/weapon-pose-tuning.js'
import { DroppedMagazines } from '../../src/render/entity/magazines.js'
import { CasingMotion } from '../../src/simulation/weapons/casings.js'

it('returns eye-relative magazine and port coordinates even after the lighting rig moves', () => {
  const sidearm = Object.create(Sidearm.prototype)
  const viewRig = new Group(),
    model = new Group(),
    magazine = new Object3D()
  model.position.set(0.1, -0.12, -0.34)
  magazine.position.set(0, -0.08, 0)
  model.add(magazine)
  viewRig.add(model)
  Object.assign(sidearm, {
    viewRig,
    model,
    magazine: { object: magazine },
    chamberRound: magazine,
    rig: { presentation: { magazine: { axis: [0, -1, 0] } } },
  })
  const initial = sidearm.magazineDropView()!
  viewRig.position.set(400, 22, -85)
  viewRig.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), 1.2)
  const moved = sidearm.magazineDropView()!
  expect(moved.position.distanceTo(initial.position)).toBeLessThan(1e-10)
  expect(moved.direction.distanceTo(initial.direction)).toBeLessThan(1e-10)
  expect(moved.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-7)
  expect(sidearm.ejectionViewOffset().distanceTo(initial.position)).toBeLessThan(1e-10)
})

it('migrates reviewed angles with zero translation and independent slide offsets', () => {
  const poses = normalizeWeaponPoses(
    JSON.parse('{"inspect":{"pitch":11.2,"yaw":-41,"roll":-26.6}}'),
  )
  expect(poses.inspect.x).toBe(0)
  expect(poses.inspect.yaw).toBe(-41)
  expect(poses.slide).toEqual({ pitch: 0, yaw: -33.9, roll: 91.2, x: -90.8, y: 0, z: 0 })
  poses.slide.x = 30
  expect(normalizeWeaponPoses(poses).slide.x).toBe(30)
})

it('keeps a live cartridge visible while gravity brings it down to the floor', () => {
  const template = new Group()
  template.visible = false
  const bullet = new Object3D()
  template.add(bullet)
  const meshes = new DroppedMagazines(template, 24, false)
  const motion = new CasingMotion({ ejectSpeedMs: 1, restitution: 0, friction: 1, lifetimeS: 10 })
  motion.eject([0, 1, 0], [1, 0, 0], [0, 1, 0], [0, 0, 0], () => 0.5)
  for (let i = 0; i < 120; i++)
    motion.update(1 / 60, (from, dir, length) => {
      const t = -from[1] / dir[1]
      return t >= 0 && t <= length
        ? { point: [from[0] + dir[0] * t, 0, from[2] + dir[2] * t], normal: [0, 1, 0] }
        : null
    })
  meshes.sync(motion.poses())
  expect(meshes.root.children[0].visible).toBe(true)
  expect(meshes.root.children[0].position.y).toBeLessThan(0.02)
  expect(meshes.root.children[0].position.y).toBeGreaterThanOrEqual(0)
})
