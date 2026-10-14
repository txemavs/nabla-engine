import { expect, it } from 'vitest'
import * as THREE from 'three'
import { miniature } from '../../src/runtime/ar/model.js'
it('preserves relative positions and reduces real dimensions by exactly one hundred', () => {
  const model = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(900, 20, 800))
  mesh.position.set(200, 100, -300)
  model.add(mesh)
  const root = miniature(model)
  const box = new THREE.Box3().setFromObject(root)
  expect(box.getSize(new THREE.Vector3()).toArray()).toEqual([9, 0.2, 8])
  expect(box.min.y).toBeCloseTo(0)
  expect(box.getCenter(new THREE.Vector3()).x).toBeCloseTo(0)
})

it('loads the published road and bridge layers and settles at floor height', async () => {
  const { ARModel, atlasModelPaths } = await import('../../src/runtime/ar/model.js')
  expect(
    atlasModelPaths({
      files: { terrain: { path: 'ground.glb' }, 'buildings-osm': { path: 'buildings.glb' } },
      roadCandidates: {
        layers: {
          asphalt: { path: 'road.glb' },
          supports: { path: 'bridges.glb' },
          collision: { path: 'collision.glb' },
        },
      },
    }),
  ).toEqual(['ground.glb', 'buildings.glb', 'bridges.glb'])
  const model = new ARModel(new THREE.Scene())
  model.root = miniature(new THREE.Mesh(new THREE.BoxGeometry(100, 10, 100)))
  const camera = new THREE.PerspectiveCamera()
  camera.position.y = 1.6
  model.place(camera)
  expect(model.root.position.y).toBe(0)
  for (let i = 0; i < 120; i++) model.update(1 / 90)
  expect(model.root.position.y).toBe(0)
  model.dispose()
})

it('rests the visible Atlas terrain on the floor, ignoring its underground skirt', () => {
  const content = new THREE.Group()
  const surface = new THREE.Mesh(new THREE.BoxGeometry(100, 10, 100))
  surface.position.y = 45
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(100, 40, 100))
  skirt.name = 'Skirt'
  skirt.position.y = 20
  content.add(surface, skirt)
  const root = miniature(content, true)
  root.updateWorldMatrix(true, true)
  expect(skirt.visible).toBe(false)
  expect(new THREE.Box3().setFromObject(surface).min.y).toBeCloseTo(0)
})

it('moves one scaled 100 metre step per stick deflection, preserving floor height', async () => {
  const { ARModel } = await import('../../src/runtime/ar/model.js')
  const model = new ARModel(new THREE.Scene())
  model.root = new THREE.Group()
  model.stick(1, 0)
  expect(model.root.position.x).toBe(1)
  model.stick(1, 0)
  expect(model.root.position.x).toBe(1)
  model.stick(0, 0)
  model.stick(0, -1)
  expect(model.root.position.toArray()).toEqual([1, 0, -1])
  model.dispose()
})
