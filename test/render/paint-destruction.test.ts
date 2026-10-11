import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from 'three'
import { expect, it } from 'vitest'
import { SceneView } from '../../src/render/entity/view.js'
import { VehicleDestruction } from '../../src/render/entity/vehicle-destruction.js'

it('keeps wreck paint dark through brightness updates and restores paint on reset', () => {
  const group = new Group()
  const paint = new MeshStandardMaterial({ name: 'Pintura', color: '#cc3322' })
  const mesh = new Mesh(new BoxGeometry(), paint)
  const panel = new Mesh(mesh.geometry, paint)
  group.add(mesh, panel)
  const state = {
    paintBrightness: 1,
    paintCheckAt: 0,
    paintColors: new WeakMap(),
    objects: new Map([['car', group]]),
  }
  const brightness = (k: number) =>
    SceneView.prototype.applyPaintBrightness.call(state as unknown as SceneView, k)
  brightness(0.8)
  // Three serializes userData when cloning materials. Older caches can therefore be plain objects.
  paint.userData.nablaPaint = { base: paint.color.clone(), applied: paint.color.clone() }
  const destruction = new VehicleDestruction(new Group())
  destruction.explode('car', group)
  expect(mesh.material).toBe(paint)
  expect(panel.material).toBe(mesh.material)
  const burned = mesh.material.color.clone()
  expect(burned.getHexString()).toBe('171717')
  expect(() => brightness(1.2)).not.toThrow()
  expect(mesh.material.color.equals(burned)).toBe(true)
  for (let i = 0; i < 140; i++) destruction.update(0.1, false)
  expect(mesh.material.color.equals(burned)).toBe(true)
  destruction.clear()
  brightness(1)
  expect(mesh.material).toBe(paint)
  expect(paint.color.getHexString()).toBe('cc3322')
  destruction.dispose()
  mesh.geometry.dispose()
  paint.dispose()
})

it('warms fire and smoke without changing scene light count on explosion or reset', async () => {
  const scene = new Scene()
  const space = new Group()
  scene.add(space)
  const destruction = new VehicleDestruction(space)
  space.add(destruction.root)
  const lightCount = () => {
    let count = 0
    scene.traverse((object) => {
      if ('isLight' in object) count++
    })
    return count
  }
  const before = lightCount()
  let compiledFire = false
  let compiledSmoke = false
  await destruction.warm(
    {
      compileAsync: async () => {
        scene.traverse((object) => {
          if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) return
          if (object instanceof Mesh)
            compiledFire ||= object.material.customProgramCacheKey() === 'vehicle-fire-v1'
          compiledSmoke ||= object.name === 'Engine exhaust smoke' && object.visible
        })
        return scene
      },
    },
    scene,
    new PerspectiveCamera(),
  )
  expect(compiledFire && compiledSmoke).toBe(true)
  expect(destruction.root.children).toHaveLength(2)
  const wreck = new Group()
  space.add(wreck)
  destruction.explode('wreck', wreck)
  destruction.update(0.016, true)
  const flare = space.getObjectByName('Explosion lens flare') as Mesh
  const flareMaterial = flare.material as import('three').ShaderMaterial
  expect(flareMaterial.uniforms.intensity.value).toBeGreaterThan(0)
  for (let i = 0; i < 4; i++) destruction.update(0.1, true)
  expect(flareMaterial.uniforms.intensity.value).toBe(0)
  expect(lightCount()).toBe(before)
  destruction.clear()
  expect(lightCount()).toBe(before)
  destruction.dispose()
  expect(lightCount()).toBe(0)
})
