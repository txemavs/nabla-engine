import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mountPropeller } from '../../src/render/entity/propeller.js'

it('cuts the Cessna propeller off the cowling', async () => {
  globalThis.self = globalThis
  const buf = readFileSync('assets/world/cessna.172.glb')
  const loader = new GLTFLoader()
  const gltf = await new Promise<import('three/addons/loaders/GLTFLoader.js').GLTF>(
    (resolve, reject) =>
      loader.parse(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        '',
        resolve,
        reject,
      ),
  )
  const pivot = mountPropeller(gltf.scene)
  expect(pivot?.name).toBe('Propeller')
  const blades = pivot!.children[0] as import('three').Mesh
  const count = blades.geometry.attributes.position.count
  expect(count).toBeGreaterThan(200)
  expect(count).toBeLessThan(4000)
  let body: import('three').Mesh | undefined
  gltf.scene.traverse((object) => {
    if (object !== blades && (object as import('three').Mesh).isMesh)
      body = object as import('three').Mesh
  })
  expect(body!.geometry.attributes.position.count).toBeGreaterThan(count)
})
