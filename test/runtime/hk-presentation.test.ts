import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { loadTexturedGlb } from '../helpers/load-textured-glb.js'
import { poseHKDetails } from '../../src/runtime/hk-presentation.js'

it('extends the magazine body while keeping the top cartridge fixed, then restores its normal shape', async () => {
  const { scene } = await loadTexturedGlb(
    readFileSync(
      new URL('../../assets/library/weapons/hk-compact/hk-compact.glb', import.meta.url),
    ),
  )
  poseHKDetails(scene, 0, 13, 13)
  const magazine = scene.getObjectByName('Magazine')!
  const top = magazine.getObjectByName('MagazineTopRound')!
  const normal = new Box3().setFromObject(magazine).getSize(new Vector3()).y
  const cartridge = new Box3().setFromObject(top).getCenter(new Vector3())
  poseHKDetails(scene, 0, 30, 30)
  expect(new Box3().setFromObject(magazine).getSize(new Vector3()).y).toBeGreaterThan(normal * 1.5)
  expect(new Box3().setFromObject(top).getCenter(new Vector3()).distanceTo(cartridge)).toBeLessThan(
    1e-8,
  )
  poseHKDetails(scene, 0, 13, 13)
  expect(new Box3().setFromObject(magazine).getSize(new Vector3()).y).toBeCloseTo(normal, 8)
})

it('moves the barrel as one part while preserving the frame and guide through repeated cycles', async () => {
  const { scene } = await loadTexturedGlb(
    readFileSync(
      new URL('../../assets/library/weapons/hk-compact/hk-compact.glb', import.meta.url),
    ),
  )
  const frame = scene.getObjectByName('Frame')!,
    guide = scene.getObjectByName('FrontGuideExterior')!,
    barrel = scene.getObjectByName('Barrel')!
  const position = frame.position.clone(),
    rotation = frame.quaternion.clone(),
    guidePosition = guide.position.clone()
  for (let i = 0; i < 50; i++) {
    poseHKDetails(scene, 1, 4)
    expect(barrel.rotation.x).toBeCloseTo(0.0175)
    poseHKDetails(scene, 0, 4)
  }
  expect(barrel.position.toArray()).toEqual([0, 0, 0])
  expect(barrel.rotation.x).toBe(0)
  expect(frame.position.toArray()).toEqual(position.toArray())
  expect(frame.quaternion.toArray()).toEqual(rotation.toArray())
  expect(guide.position.toArray()).toEqual(guidePosition.toArray())
  const magazine = scene.getObjectByName('Magazine')!,
    top = scene.getObjectByName('MagazineTopRound')!
  expect(top.parent).toBe(magazine)
  const box = new Box3().setFromObject(top),
    center = box.getCenter(new Vector3())
  expect(center.y).toBeGreaterThan(0.063)
  expect(center.y).toBeLessThan(0.068)
  const before = top.getWorldPosition(new Vector3())
  magazine.position.y -= 0.1
  expect(top.getWorldPosition(new Vector3()).y - before.y).toBeCloseTo(-0.1)
  poseHKDetails(scene, 0, 0)
  expect(top.visible).toBe(false)
  poseHKDetails(scene, 0, 1)
  expect(top.visible).toBe(true)
  expect(magazine.children.filter((n) => n.name === 'MagazineTopRound')).toHaveLength(1)
})
