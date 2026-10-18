import fs from 'node:fs/promises'
import { expect, it } from 'vitest'
import { Mesh, MeshStandardMaterial, Texture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createA3Lights } from '../../src/catalog/presentation/a3-lamps.js'
it('illuminates the actual marked S3 lens materials', async () => {
  const bytes = await fs.readFile('assets/library/cars/a3/a3.cabrio.glb')
  const { scene } = await new GLTFLoader()
    .register(() => ({ name: 'test-textures', loadTexture: async () => new Texture() }))
    .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  const lights = createA3Lights(scene)
  const lenses: MeshStandardMaterial[] = []
  scene.traverse((o) => {
    if (
      o instanceof Mesh &&
      o.material instanceof MeshStandardMaterial &&
      ['CORTA', 'Larga'].includes(o.material.name)
    )
      lenses.push(o.material)
  })
  expect(lenses.length).toBeGreaterThanOrEqual(4)
  lights.controller.mode = 'low'
  lights.update({ powered: true, braking: false, reversing: false }, 0)
  for (const m of lenses) expect(m.emissiveIntensity).toBe(m.name === 'CORTA' ? 4 : 0)
})
