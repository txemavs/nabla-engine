import { expect, it } from 'vitest'
import * as THREE from 'three'
import { TREE_FIRE, TreeFires, fuelCurve } from '../../src/render/entity/tree-fire.js'
import { wreckFire } from '../../src/render/entity/vehicle-destruction.js'

function forest() {
  const scene = new THREE.Scene()
  const space = new THREE.Group()
  const trees = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 3)
  trees.userData.category = 'Trees'
  const at = [0, 3.2, 50]
  at.forEach((x, i) =>
    trees.setMatrixAt(
      i,
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, 5, 0),
        new THREE.Quaternion(),
        new THREE.Vector3(4, 10, 4),
      ),
    ),
  )
  scene.add(space, trees)
  const kits: number[] = []
  const fires = new TreeFires(
    space,
    () => ({
      flames: new THREE.Group(),
      material: new THREE.MeshBasicMaterial(),
      clock: { value: 0 },
      dispose: () => kits.push(1),
      update: () => {},
    }),
    (parent) => {
      const root = new THREE.Object3D()
      parent.add(root)
      return { root, update: () => {}, dispose: () => root.removeFromParent() }
    },
  )
  return { trees, fires }
}
const scaleOf = (mesh: THREE.InstancedMesh, i: number) => {
  const m = new THREE.Matrix4()
  mesh.getMatrixAt(i, m)
  return new THREE.Vector3().setFromMatrixScale(m)
}

it('a fire under a tree ignites it, the fire climbs, spreads to a touching tree, then the trees sink and are removed', () => {
  const { trees, fires } = forest()
  const source = [{ position: new THREE.Vector3(-0.5, 0.5, 0), strength: 1 }]
  for (let t = 0; t < 1; t += 0.1) fires.update(0.1, source)
  expect(fires.active).toBe(0)
  for (let t = 0; t < 1.5; t += 0.1) fires.update(0.1, source)
  expect(fires.active).toBe(1)
  // Charring: the burning tree darkens.
  for (let t = 0; t < 10; t += 0.1) fires.update(0.1, [])
  const c = new THREE.Color()
  trees.getColorAt(0, c)
  expect(c.r).toBeLessThan(0.5)
  expect(fires.active).toBe(2)
  trees.getColorAt(2, c)
  expect(c.r).toBe(1)
  for (let t = 0; t < 50; t += 0.1) fires.update(0.1, [])
  expect(fires.active).toBe(0)
  expect(fires.removedCount).toBe(2)
  expect(scaleOf(trees, 0).length()).toBe(0)
  expect(scaleOf(trees, 2).y).toBeCloseTo(10)
  fires.clear()
  expect(scaleOf(trees, 0).y).toBeCloseTo(10)
  trees.getColorAt(0, c)
  expect(c.r).toBe(1)
})

it('fire far away or above the crown base does not light trees', () => {
  const { fires } = forest()
  for (let t = 0; t < 5; t += 0.1)
    fires.update(0.1, [
      { position: new THREE.Vector3(20, 0.5, 0), strength: 1 },
      { position: new THREE.Vector3(0, 9, 0), strength: 1 },
    ])
  expect(fires.active).toBe(0)
})

it('fuel curves ignite, flare up, decay and go out', () => {
  expect(fuelCurve(0, 10)).toBe(0)
  expect(fuelCurve(2.5, 10)).toBeGreaterThan(1.1)
  expect(fuelCurve(8, 10)).toBeLessThan(fuelCurve(4, 10))
  expect(fuelCurve(10, 10)).toBe(0)
  expect(TREE_FIRE.sinkSeconds).toBeGreaterThan(TREE_FIRE.smoulderSeconds)
  // Wreck: flames end at flameSeconds, embers glow a while longer, then dark.
  expect(wreckFire(11.99, 12).strength).toBeLessThan(0.01)
  expect(wreckFire(14, 12).light).toBeGreaterThan(0)
  expect(wreckFire(23, 12).light).toBe(0)
})
