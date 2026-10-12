import { expect, it } from 'vitest'
import { Group, Object3D } from 'three'
import { DroppedMagazines } from '../../src/render/entity/magazines.js'
import { createMagazine } from '../../src/simulation/weapons/magazine.js'
import { CasingMotion } from '../../src/simulation/weapons/casings.js'

it('keeps the correct cartridge visibility when the physical pool shifts and expires', () => {
  const template = new Group(),
    top = new Object3D()
  top.name = 'MagazineTopRound'
  template.add(top)
  const meshes = new DroppedMagazines(template, 2)
  const motion = new CasingMotion(
    { ejectSpeedMs: 1, restitution: 0, friction: 1, lifetimeS: 0.1 },
    0,
    2,
  )
  const loaded = createMagazine(13, 4),
    empty = createMagazine(13, 0)
  const entities = new Map([
    [loaded.id, loaded],
    [empty.id, empty],
  ])
  const release = (id: string) => motion.release([0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0, 1], id)
  release(loaded.id)
  release(empty.id)
  meshes.sync(motion.poses(), entities)
  expect(meshes.root.children.map((m) => m.getObjectByName('MagazineTopRound')!.visible)).toEqual([
    true,
    false,
  ])
  release(loaded.id)
  meshes.sync(motion.poses(), entities)
  expect(meshes.root.children.map((m) => m.getObjectByName('MagazineTopRound')!.visible)).toEqual([
    false,
    true,
  ])
  expect(loaded.rounds).toBe(4)
  motion.update(0.05, () => null)
  motion.update(0.05, () => null)
  meshes.sync(motion.poses(), entities)
  expect(meshes.root.children.every((m) => !m.visible)).toBe(true)
  meshes.dispose()
})
