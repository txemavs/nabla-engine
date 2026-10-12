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
      outputColorSpace: 'srgb',
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      render: () => {},
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

it('keeps wreck flames upright as the vehicle rolls and follows its new position', () => {
  const space = new Group(),
    wreck = new Group()
  space.add(wreck)
  wreck.rotation.z = Math.PI
  wreck.position.set(3, 2, 4)
  const destruction = new VehicleDestruction(space)
  destruction.explode('bike', wreck)
  destruction.update(0.1, true)
  const flames = space.getObjectByName('Wreck flames')!
  expect(flames.parent).toBe(space)
  expect(flames.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0])
  expect(flames.position.toArray()).toEqual([3, 2.3, 4])
  wreck.rotation.x = 1.2
  wreck.position.x = 7
  destruction.update(0.1, true)
  expect(flames.position.x).toBe(7)
  expect(flames.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0])
  destruction.clear()
  expect(space.getObjectByName('Wreck flames')).toBeUndefined()
  destruction.dispose()
})

it('hides requested wreck panels after detaching wheels and restores visibility on reset', () => {
  const space = new Group(),
    vehicle = new Group(),
    fork = new Group(),
    wheel = new Group()
  fork.name = 'Steering_Pivot'
  wheel.name = 'Wheel_Front'
  wheel.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))
  fork.add(wheel)
  vehicle.add(fork)
  for (const name of ['Puerta Derecha', 'Capo', 'Maletero', 'Swingarm_Pivot', 'Door_Hinge_L']) {
    const part = new Group()
    part.name = name
    vehicle.add(part)
  }
  space.add(vehicle)
  const destruction = new VehicleDestruction(space)
  const originalParts = [...vehicle.children]
  destruction.explode('vehicle', vehicle)
  expect(originalParts.every((part) => !part.visible)).toBe(true)
  expect(space.getObjectByName('Detached wreck parts')!.children).toHaveLength(1)
  destruction.clear()
  expect(originalParts.every((part) => part.visible)).toBe(true)
  expect(wheel.visible).toBe(true)
  destruction.dispose()
})
