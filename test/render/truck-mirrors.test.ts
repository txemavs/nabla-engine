import fs from 'node:fs/promises'
import { expect, it } from 'vitest'
import { Mesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  authoredMirrorSurfaces,
  CarMirrors,
  mirrorPolicyForQuality,
} from '../../src/render/entity/car-mirrors.js'
import { Reflector } from 'three/addons/objects/Reflector.js'

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

it('at Alto quality doubles only the truck left Reflector', async () => {
  const bytes = await fs.readFile('assets/library/trucks/white-truck/assets/tractor.modern.glb')
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
  const lenses = authoredMirrorSurfaces(gltf.scene)
  const mirrors = new CarMirrors(lenses, new Vector3(0, 1, 0), 0, mirrorPolicyForQuality('high'))
  const sizes = Object.fromEntries(
    lenses.map((lens) => {
      const reflection = lens.parent!.children.find((node) => node !== lens)
      expect(reflection).toBeInstanceOf(Reflector)
      const target = (reflection as Reflector).getRenderTarget()
      return [lens.userData.nabla.mirror, `${target.width}x${target.height}`]
    }),
  )
  expect(sizes).toEqual({ left: '768x512', right: '384x256' })
  mirrors.dispose()
})

it('aims both truck mirrors back along their own flank from the left-hand-drive seat', async () => {
  const bytes = await fs.readFile('assets/library/trucks/white-truck/assets/tractor.modern.glb')
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
  gltf.scene.updateMatrixWorld(true)
  let eyes: Vector3 | undefined
  gltf.scene.traverse((node) => {
    if (node.userData.nabla?.anchor === 'driver.eyes') eyes = node.getWorldPosition(new Vector3())
  })
  expect(eyes).toBeDefined()
  const view = Object.fromEntries(
    authoredMirrorSurfaces(gltf.scene).map((lens) => {
      const centre = lens.getWorldPosition(new Vector3())
      const normal = new Vector3(0, 0, 1).transformDirection(lens.matrixWorld)
      const d = centre.sub(eyes!).normalize()
      return [lens.userData.nabla.mirror, d.addScaledVector(normal, -2 * d.dot(normal))]
    }),
  )
  // Forward is -Z: both reflected views look rearward, not out to the roadside.
  for (const side of ['left', 'right']) {
    expect(view[side].z).toBeGreaterThan(0.9)
    expect(Math.abs(view[side].x)).toBeLessThan(0.05)
  }
  // The right view is the left one mirrored about the centre line.
  expect(view.right.x).toBeCloseTo(-view.left.x, 3)
  expect(view.right.y).toBeCloseTo(view.left.y, 3)
  expect(view.right.z).toBeCloseTo(view.left.z, 3)
})
