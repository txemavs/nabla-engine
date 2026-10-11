import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { expect, it } from 'vitest'
import { SceneView } from '../../src/render/entity/view.js'
import { VehicleDestruction } from '../../src/render/entity/vehicle-destruction.js'

it('keeps wreck paint dark through brightness updates and restores paint on reset', () => {
  const group = new Group()
  const paint = new MeshStandardMaterial({ name: 'Pintura', color: '#cc3322' })
  const mesh = new Mesh(new BoxGeometry(), paint)
  group.add(mesh)
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
  const burned = mesh.material.color.clone()
  expect(() => brightness(1.2)).not.toThrow()
  expect(mesh.material.color.equals(burned)).toBe(true)
  destruction.clear()
  brightness(1)
  expect(mesh.material).toBe(paint)
  expect(paint.color.getHexString()).toBe('cc3322')
  destruction.dispose()
  mesh.geometry.dispose()
  paint.dispose()
})
