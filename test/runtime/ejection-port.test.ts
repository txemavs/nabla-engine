import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { loadTexturedGlb } from '../helpers/load-textured-glb.js'
import { ejectionPort, centeredCartridge } from '../../src/render/entity/ejection-port.js'

it('ejects at the authored chamber and follows rotated weapon poses', async () => {
  const { scene } = await loadTexturedGlb(
    readFileSync(
      new URL('../../assets/library/weapons/hk-compact/hk-compact.glb', import.meta.url),
    ),
  )
  const rest = ejectionPort(scene)!
  expect(rest.position.y).toBeGreaterThan(0.108)
  expect(rest.position.z).toBeLessThan(-0.027)
  expect(rest.position.x).toBeGreaterThan(0.008)
  scene.rotation.set(0.5, -0.7, 1.2)
  scene.position.set(4, 2, -3)
  scene.updateMatrixWorld(true)
  const rotated = ejectionPort(scene)!
  expect(
    rotated.position.distanceTo(rest.position.clone().applyMatrix4(scene.matrixWorld)),
  ).toBeLessThan(1e-7)
  expect(
    rotated.right.distanceTo(rest.right.clone().transformDirection(scene.matrixWorld)),
  ).toBeLessThan(1e-7)
  const clone = centeredCartridge(scene.getObjectByName('ChamberRound')!)
  expect(new Box3().setFromObject(clone).getCenter(new Vector3()).length()).toBeLessThan(1e-7)
})
