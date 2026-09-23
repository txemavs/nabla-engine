import { Simulation } from './simulation.js'
import { expect, it } from 'vitest'
import { Vector3, Quaternion } from 'three'
import { SceneEditor } from './editor.js'
import { createEntity, rotationDegrees, SceneGraph } from './scene.js'
import { boxSolid, extrudeElement, extrudeFace, validateSolid } from './solid.js'
it('inserts at a persistent cursor and undoes both independently', () => {
  const editor = new SceneEditor({
    version: 1,
    name: 'cursor',
    entities: [createEntity('spawn', 'spawn')],
  })
  editor.setCursor([12, 3, -7])
  const id = editor.add('solid')
  expect(editor.document.entities.find((e) => e.id === id)!.transform.position).toEqual([12, 3, -7])
  editor.undo()
  expect(editor.document.entities).toHaveLength(1)
  expect(editor.document.cursor).toEqual([12, 3, -7])
  editor.undo()
  expect(editor.document.cursor).toBeUndefined()
  editor.redo()
  expect(new SceneEditor(JSON.parse(editor.serialize())).document.cursor).toEqual([12, 3, -7])
})
it('rebases a rotated nested solid while keeping vertices and children in place', () => {
  const parent = createEntity('parent', 'group', [8, 3, 2])
  parent.transform.rotation = rotationDegrees(0, 40, 0)
  const solid = createEntity('solid', 'solid', [2, 1, 0])
  solid.parentId = parent.id
  solid.geometry = boxSolid([2, 2, 2])
  solid.transform.rotation = rotationDegrees(20, 30, 0)
  const child = createEntity('child', 'box', [1, 2, 3])
  child.parentId = solid.id
  const editor = new SceneEditor({
    version: 1,
    name: 'origin',
    entities: [createEntity('spawn', 'spawn'), parent, solid, child],
  })
  const before = new SceneGraph(editor.document),
    old = before.worldTransform(solid.id),
    childBefore = before.worldTransform(child.id)
  const points = solid.geometry.vertices.map((p) =>
    new Vector3(...p)
      .applyQuaternion(new Quaternion(...old.rotation))
      .add(new Vector3(...old.position)),
  )
  editor.setCursor([10, 4, 5])
  editor.originToCursor(solid.id)
  const after = new SceneGraph(editor.document),
    pose = after.worldTransform(solid.id)
  pose.position.forEach((v, i) => expect(v).toBeCloseTo([10, 4, 5][i], 9))
  editor.document.entities
    .find((e) => e.id === solid.id)!
    .geometry!.vertices.forEach((p, i) =>
      expect(
        new Vector3(...p)
          .applyQuaternion(new Quaternion(...pose.rotation))
          .add(new Vector3(...pose.position))
          .distanceTo(points[i]),
      ).toBeLessThan(1e-9),
    )
  after
    .worldTransform(child.id)
    .position.forEach((v, i) => expect(v).toBeCloseTo(childBefore.position[i], 9))
  editor.undo()
  expect(editor.document.entities.find((e) => e.id === solid.id)!.geometry).toEqual(solid.geometry)
})
it('builds an edge, then a plane, then a wall with exact extrusion', () => {
  const edge = extrudeElement(
    { vertices: [[0, 0, 0]], edges: [], faces: [] },
    'point',
    0,
    [3, 0, 0],
  )
  const plane = extrudeElement(edge, 'edge', 0, [0, 2.5, 0])
  expect(plane.vertices).toEqual([
    [0, 0, 0],
    [3, 0, 0],
    [0, 2.5, 0],
    [3, 2.5, 0],
  ])
  const wall = extrudeFace(plane, 0, 0.2, [0, 0, 1])
  expect(wall.vertices[4][2]).toBeCloseTo(0.2)
  expect(() => validateSolid(wall)).not.toThrow()
  expect(() => extrudeElement(edge, 'edge', 0, [1, 0, 0])).toThrow()
})

it('keeps an authored road physical when map buildings are disabled', () => {
  const road = createEntity('road', 'solid', [0, 2, 0])
  road.geometry = boxSolid([10, 0.2, 10])
  road.source = {
    provider: 'openstreetmap',
    id: 'way/1',
    retrievedAt: 'test',
    tags: { highway: 'primary' },
  }
  const sim = new Simulation(
    { version: 1, name: 'road', entities: [createEntity('spawn', 'spawn', [0, 3, 0]), road] },
    { mapBuildingsEnabled: false },
  )
  try {
    for (let i = 0; i < 180; i++) sim.step(1 / 60)
    expect(sim.player.position[1]).toBeGreaterThan(2)
    sim.setMapBuildingsEnabled(true)
    sim.setMapBuildingsEnabled(false)
    expect(sim.collisionStats.active).toBe(1)
  } finally {
    sim.dispose()
  }
})
