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
  ).toEqual(['ground.glb', 'buildings.glb', 'road.glb', 'bridges.glb'])
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

it('rescales a loaded map without moving its floor anchor and scales 100m stick steps', async () => {
  const { ARModel } = await import('../../src/runtime/ar/model.js')
  const model = new ARModel(new THREE.Scene())
  model.root = miniature(new THREE.Mesh(new THREE.BoxGeometry(100, 10, 100)))
  model.root.position.set(2, 0, -3)
  for (const scale of [100, 500, 1000]) {
    const before = model.root.position.clone()
    const content = model.root.children[0]
    model.setScale(scale)
    expect(model.root.children[0]).toBe(content)
    expect(model.root.position.equals(before)).toBe(true)
    expect(model.root.scale.x).toBe(1 / scale)
    model.stick(0, 0)
    model.stick(1, 0)
    expect(model.root.position.x - before.x).toBeCloseTo(100 / scale)
    expect(model.root.position.y).toBe(0)
  }
  expect(() => model.setScale(0)).toThrow(RangeError)
  expect(() => model.setScale(NaN)).toThrow(RangeError)
  model.dispose()
})

it('exposes scaled solid map surfaces for engine physics, not photo overlays', async () => {
  const { ARModel } = await import('../../src/runtime/ar/model.js')
  const model = new ARModel(new THREE.Scene())
  model.root = new THREE.Group()
  const road = new THREE.Mesh(new THREE.BoxGeometry(100, 1, 100))
  const photo = road.clone()
  photo.userData.drape = 'roofs'
  const hidden = road.clone()
  hidden.visible = false
  model.root.add(road, photo, hidden)
  model.setScale(100)
  expect(model.collisionSurfaces).toEqual([road])
  road.updateWorldMatrix(true, false)
  expect(new THREE.Box3().setFromObject(road).getSize(new THREE.Vector3()).x).toBe(1)
  model.dispose()
})

it('evicts old cells before loading a new four-cell window', async () => {
  const { ARModel } = await import('../../src/runtime/ar/model.js')
  const model = new ARModel(new THREE.Scene())
  model.root = new THREE.Group()
  const cells = new Map<string, THREE.Group>()
  const pan = new THREE.Vector2()
  Object.assign(model, {
    atlas: true,
    atlasBase: { x: 16223, y: 11998, prefix: '' },
    cells,
    pan,
    ensureCell: async (x: number, y: number) => {
      const key = `${x}/${y}`
      if (!cells.has(key)) {
        const cell = new THREE.Group()
        model.root!.add(cell)
        cells.set(key, cell)
      }
      expect(cells.size).toBeLessThanOrEqual(4)
    },
  })
  await model.loadNeighborhood()
  expect(model.loadedCellCount).toBe(4)
  const old = [...cells.values()]
  pan.set(-10000, -10000)
  await Promise.all([model.loadNeighborhood(), model.loadNeighborhood()])
  expect(model.loadedCellCount).toBe(4)
  expect(old.every((cell) => cell.parent === null)).toBe(true)
  model.dispose()
})

it('navigates to a Z15 at the existing miniature anchor and clears its cell metadata on dispose', async () => {
  const { ARModel } = await import('../../src/runtime/ar/model.js')
  const { planetTileFrame } = await import('../../src/planet/tiles.js')
  const model = new ARModel(new THREE.Scene())
  model.root = new THREE.Group()
  model.root.position.set(1, 0, 2)
  model.root.rotation.y = Math.PI / 2
  Object.assign(model, { atlasBase: { x: 16223, y: 11998, prefix: '/z/15/' }, atlas: true })
  model.loadNeighborhood = async () => {}
  const width = planetTileFrame({ z: 15, x: 16223, y: 11998 }).width
  await model.navigateCell(16224, 11998)
  expect(model.mapCells?.current).toBe('16224/11998')
  expect(model.root.position.x).toBeCloseTo(1)
  expect(model.root.position.z).toBeCloseTo(2 + width / 100)
  await model.navigateCell(16223, 11998)
  expect(model.root.position.toArray()).toEqual([1, 0, 2])
  await expect(model.navigateCell(-1, 11998)).rejects.toThrow('Invalid Z15')
  model.dispose()
  expect(model.mapCells).toBeNull()
})
