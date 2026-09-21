import { expect, it } from 'vitest'
import { boxSolid, extrudeFace, removeVertex, validateSolid } from './solid.js'
import { createEntity, parseScene, type SceneDocument } from './scene.js'
import { SceneEditor } from './editor.js'
import { Simulation, idleInput } from './simulation.js'
import { createSampleScene } from './sample.js'
import { upgradeReferenceScene } from '../playground/scene-upgrades.js'

function document(): SceneDocument {
  const solid = createEntity('building', 'solid', [0, 2, 0])
  solid.geometry = boxSolid([4, 4, 4])
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [100, 1, 100]
  return {
    version: 1,
    name: 'Solid test',
    entities: [createEntity('spawn', 'spawn', [0, 0.05, 6]), floor, solid],
  }
}
it('rejects invalid, nonplanar, degenerate, crossed and concave faces', () => {
  expect(() => validateSolid(boxSolid([2, 2, 2]))).not.toThrow()
  const g = boxSolid([2, 2, 2])
  g.faces[0] = [0, 1, 99]
  expect(() => validateSolid(g)).toThrow()
  g.faces[0] = [0, 1, 6, 3]
  expect(() => validateSolid(g)).toThrow()
  g.faces[0] = [0, 2, 1, 3]
  expect(() => validateSolid(g)).toThrow()
  expect(() =>
    validateSolid({
      vertices: [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
      ],
      edges: [],
      faces: [[0, 1, 2]],
    }),
  ).toThrow()
  expect(() =>
    validateSolid({
      vertices: [
        [0, 0, 0],
        [2, 0, 0],
        [1, 1, 0],
        [2, 2, 0],
        [0, 2, 0],
      ],
      edges: [],
      faces: [[0, 1, 2, 3, 4]],
    }),
  ).toThrow()
})
it('extrudes a roof, removes connected topology, and isolates clone edits with undo and JSON', () => {
  const editor = new SceneEditor(document()),
    original = editor.document.entities[2]
  const id = editor.duplicate('building')
  const roof = extrudeFace(original.geometry!, 3, 2)
  expect(roof.vertices).toHaveLength(12)
  expect(roof.faces).toHaveLength(10)
  expect(roof.vertices[8][1]).toBe(4)
  editor.update(id, { geometry: roof, color: '#ff0000' })
  expect(editor.document.entities.find((e) => e.id === 'building')).toEqual(original)
  expect(parseScene(JSON.parse(editor.serialize()))).toEqual(editor.document)
  editor.undo()
  expect(editor.document.entities.find((e) => e.id === id)!.geometry).toEqual(original.geometry)
  editor.redo()
  expect(editor.document.entities.find((e) => e.id === id)!.geometry).toEqual(roof)
  const removed = removeVertex(roof, 0)
  expect(() => validateSolid(removed)).not.toThrow()
  expect(removed.vertices).toHaveLength(11)
  const before = editor.serialize()
  expect(() => editor.update(id, { motion: 'dynamic' })).toThrow()
  expect(editor.serialize()).toBe(before)
})
it('collides with authored walls and passes through a deleted face', () => {
  const run = (open: boolean) => {
    const doc = document()
    if (open) doc.entities[2].geometry!.faces.splice(1, 1)
    const sim = new Simulation(doc)
    for (let i = 0; i < 60; i++) sim.step(1 / 60)
    sim.setInput({ ...idleInput(), forward: 1 })
    for (let i = 0; i < 80; i++) sim.step(1 / 60)
    const z = sim.player.position[2]
    sim.dispose()
    return z
  }
  expect(run(false)).toBeGreaterThan(2)
  expect(run(true)).toBeLessThan(1)
})
it('uses a single topology entity per plot and upgrades old buildings without changing placements', () => {
  const doc = createSampleScene()
  expect(doc.entities.filter((e) => e.kind === 'solid')).toHaveLength(18)
  expect(doc.entities.some((e) => e.id.startsWith('window-'))).toBe(false)
  const e = doc.entities.find((e) => e.id === 'building-0')!
  e.kind = 'box'
  delete e.geometry
  e.transform.position[0] += 3
  const upgraded = upgradeReferenceScene(doc)
  expect(upgraded.entities.find((n) => n.id === e.id)!.geometry).toEqual(boxSolid(e.size))
  expect(upgraded.entities.find((n) => n.id === e.id)!.transform).toEqual(e.transform)
  expect(upgradeReferenceScene(upgraded)).toEqual(upgraded)
})
