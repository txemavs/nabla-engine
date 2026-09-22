import { expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { LandcoverBatches } from '../playground/landcover-batches.js'
import { createEntity } from './scene.js'
it('reuses unchanged buffers, applies parents, updates edited cells and evicts removed cells', () => {
  const loader = vi
    .spyOn(THREE.TextureLoader.prototype, 'load')
    .mockReturnValue(new THREE.Texture())
  try {
    const batches = new LandcoverBatches(),
      root = new THREE.Group(),
      parent = new THREE.Group(),
      group = new THREE.Group()
    root.add(batches.root, parent)
    parent.position.set(1200, 4, 0)
    parent.add(group)
    const e = createEntity('land', 'solid')
    e.landcover = { surface: 'grass', isWater: false }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 10, 0, 0, 0, 0, 10], 3))
    group.add(new THREE.Mesh(geo))
    const objects = new Map([[e.id, group]]),
      entities = [e],
      register = vi.fn()
    batches.onMaterial = register
    const update = (list = entities) =>
      batches.update(list, objects, true, new THREE.Vector3(1200, 0, 0), 100, 0)
    update()
    const first = batches.root.children[0] as THREE.Mesh
    expect(first.geometry.boundingSphere!.center.x).toBeGreaterThan(1200)
    expect(first.geometry.getAttribute('position').getY(0)).toBe(4)
    root.position.set(-1200, 0, 0)
    update()
    expect(batches.root.children[0]).toBe(first)
    expect(register).toHaveBeenCalledTimes(1)
    group.position.x = 20
    update([{ ...e }])
    expect(batches.root.children[0]).not.toBe(first)
    expect(
      (batches.root.children[0] as THREE.Mesh).geometry.boundingSphere!.center.x,
    ).toBeGreaterThan(1220)
    update([])
    expect(batches.root.children).toHaveLength(0)
    batches.dispose()
    geo.dispose()
  } finally {
    loader.mockRestore()
  }
})
