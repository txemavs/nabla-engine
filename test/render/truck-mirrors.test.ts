import fs from 'node:fs/promises'
import { expect, it } from 'vitest'
import { Mesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { authoredMirrorSurfaces, CarMirrors } from '../../src/render/entity/car-mirrors.js'

it('keeps both authored truck lenses planar, inside their contour and attached to the doors', async () => {
  const bytes = await fs.readFile('assets/library/trucks/white-truck/assets/tractor.modern.glb')
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
  const lenses = authoredMirrorSurfaces(gltf.scene)
  expect(lenses.map((lens) => lens.userData.nabla.mirror).sort()).toEqual(['left', 'right'])
  const mirrors = new CarMirrors(lenses, new Vector3(0, 1, 0), 0)
  for (const lens of lenses) {
    expect(lens.parent?.userData.nabla.anchor).toBe(`mirror.${lens.userData.nabla.mirror}`)
    const positions = lens.geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) expect(positions.getZ(i)).toBe(0)
    const reflection = lens.parent!.children.find((node) => node !== lens) as Mesh
    expect(reflection).toBeInstanceOf(Mesh)
    gltf.scene.updateMatrixWorld(true)
    for (let i = 0; i < positions.count; i++) {
      const original = new Vector3()
        .fromBufferAttribute(positions, i)
        .applyMatrix4(lens.matrixWorld)
      const reflected = new Vector3()
        .fromBufferAttribute(reflection.geometry.getAttribute('position'), i)
        .applyMatrix4(reflection.matrixWorld)
      expect(original.distanceTo(reflected)).toBeCloseTo(0.003, 5)
    }
    const before = reflection.getWorldPosition(new Vector3())
    const door = lens.parent!.parent!.parent!
    expect(door.name).toMatch(/Door_Hinge/)
    door.rotation.y += 0.5
    gltf.scene.updateMatrixWorld(true)
    expect(reflection.getWorldPosition(new Vector3()).distanceTo(before)).toBeGreaterThan(0.05)
  }
  mirrors.dispose()
  for (const lens of lenses) expect(lens.parent!.children).toEqual([lens])
})
