import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { loadTexturedGlb } from '../helpers/load-textured-glb.js'
import { poseHKDetails } from '../../src/runtime/hk-presentation.js'

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
