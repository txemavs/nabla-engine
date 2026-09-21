import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { repairPortalFrame } from '../playground/portal-frame.js'

it('repairs every face of the actual Agency frame without changing its bounds or source', async () => {
  const file = readFileSync(new URL('../assets/world/portal.frame.glb', import.meta.url))
  const gltf = await new GLTFLoader().parseAsync(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    '',
  )
  const mesh = gltf.scene.getObjectByName('MarcoGaraje') as THREE.Mesh
  const source = mesh.geometry,
    originalIndex = [...source.index!.array]
  source.computeBoundingBox()
  const fixed = repairPortalFrame(source)
  fixed.computeBoundingBox()
  expect(fixed.boundingBox).toEqual(source.boundingBox)
  expect([...source.index!.array]).toEqual(originalIndex)
  const p = fixed.getAttribute('position'),
    n = fixed.getAttribute('normal')
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i),
      b = new THREE.Vector3().fromBufferAttribute(p, i + 1),
      c = new THREE.Vector3().fromBufferAttribute(p, i + 2)
    const centre = a.clone().add(b).add(c).divideScalar(3)
    // The source stores eight vertices per bar (bottom, top, right, left).
    const bar = Math.floor(source.index!.getX(i) / 8)
    const barCentre = [
      new THREE.Vector3(0, 0.05, 0),
      new THREE.Vector3(0, 2.15, 0),
      new THREE.Vector3(1.668034, 1.1, 0),
      new THREE.Vector3(-1.668034, 1.1, 0),
    ][bar]
    const normal = b.sub(a).cross(c.sub(a)).normalize()
    expect(normal.dot(centre.sub(barCentre))).toBeGreaterThan(0)
    for (let j = 0; j < 3; j++)
      expect(new THREE.Vector3().fromBufferAttribute(n, i + j).distanceTo(normal)).toBeLessThan(
        1e-6,
      )
  }
  source.dispose()
  fixed.dispose()
})
