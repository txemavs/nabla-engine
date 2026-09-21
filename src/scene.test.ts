import { describe, expect, it } from 'vitest'
import { Quaternion, Vec3 } from 'cannon-es'
import {
  createEntity,
  parseScene,
  rotationDegrees,
  SceneGraph,
  type SceneDocument,
} from './scene.js'
import { SceneEditor } from './editor.js'

function document(): SceneDocument {
  return {
    version: 1,
    name: 'Test',
    entities: [
      createEntity('spawn', 'spawn'),
      createEntity('parent', 'group', [4, 2, 1]),
      createEntity('box', 'box', [1, 2, -3]),
    ],
  }
}
describe('scene contract', () => {
  it('uses explicit degrees at the UI boundary without guessing small angles', () => {
    const q = rotationDegrees(0, 1, 0)
    expect(q[1]).toBeCloseTo(Math.sin(Math.PI / 360))
    expect(q[3]).toBeCloseTo(Math.cos(Math.PI / 360))
  })
  it('agrees with physics rotation, including combined rotations', () => {
    const doc = document()
    doc.entities[1].transform.rotation = rotationDegrees(25, 90, -15)
    doc.entities[2].parentId = 'parent'
    const world = new SceneGraph(doc).worldTransform('box')
    const expected = new Quaternion(...doc.entities[1].transform.rotation)
      .vmult(new Vec3(1, 2, -3))
      .vadd(new Vec3(4, 2, 1))
    expect(world.position[0]).toBeCloseTo(expected.x)
    expect(world.position[1]).toBeCloseTo(expected.y)
    expect(world.position[2]).toBeCloseTo(expected.z)
  })
  it('does not infer behavior from names or identifiers', () => {
    const doc = document()
    doc.entities[2].name = 'world.home.container.car'
    expect(parseScene(doc).entities[2].kind).toBe('box')
  })
  it.each([
    'duplicate',
    'cycle',
    'missing',
    'quaternion',
    'size',
    'spawn',
    'version',
    'dynamic parent',
  ])('rejects invalid %s transactionally', (problem) => {
    const doc = document()
    if (problem === 'duplicate') doc.entities[2].id = 'spawn'
    if (problem === 'cycle') {
      doc.entities[1].parentId = 'box'
      doc.entities[2].parentId = 'parent'
    }
    if (problem === 'missing') doc.entities[2].parentId = 'absent'
    if (problem === 'quaternion') doc.entities[2].transform.rotation = [0, 0, 0, 0]
    if (problem === 'size') doc.entities[2].size[0] = -1
    if (problem === 'spawn') doc.entities.shift()
    if (problem === 'version') (doc as { version: number }).version = 99
    if (problem === 'dynamic parent') {
      doc.entities[2].motion = 'dynamic'
      doc.entities[2].parentId = 'parent'
    }
    expect(() => parseScene(doc)).toThrow()
  })
})
describe('editor transactions', () => {
  it('reparents without changing the world transform under rotated ancestors', () => {
    const doc = document()
    doc.entities[1].transform.rotation = rotationDegrees(20, 75, 10)
    doc.entities[2].transform.rotation = rotationDegrees(-12, 33, 17)
    const editor = new SceneEditor(doc),
      before = new SceneGraph(doc).worldTransform('box')
    editor.reparent('box', 'parent')
    const after = new SceneGraph(editor.document).worldTransform('box')
    before.position.forEach((n, i) => expect(after.position[i]).toBeCloseTo(n))
    expect(
      Math.abs(before.rotation.reduce((sum, n, i) => sum + n * after.rotation[i], 0)),
    ).toBeCloseTo(1)
    editor.reparent('box', null)
    const detached = new SceneGraph(editor.document).worldTransform('box')
    before.position.forEach((n, i) => expect(detached.position[i]).toBeCloseTo(n))
  })
  it('returns detached snapshots and updates the world immediately', () => {
    const editor = new SceneEditor(document()),
      external = editor.document
    external.entities[2].transform.position[0] = 100
    expect(editor.document.entities[2].transform.position[0]).toBe(1)
    editor.update('box', { transform: { position: [9, 1, 2], rotation: [0, 0, 0, 1] } })
    expect(new SceneGraph(editor.document).worldTransform('box').position).toEqual([9, 1, 2])
  })
  it('duplicates a subtree, preserving relationships but assigning fresh IDs', () => {
    const doc = document()
    doc.entities[2].parentId = 'parent'
    const editor = new SceneEditor(doc),
      id = editor.duplicate('parent')
    const copies = editor.document.entities.filter(
      (e) => !doc.entities.some((old) => old.id === e.id),
    )
    expect(copies).toHaveLength(2)
    expect(copies.find((e) => e.kind === 'box')!.parentId).toBe(id)
    editor.remove(id)
    expect(editor.document).toEqual(doc)
    editor.undo()
    expect(editor.document.entities).toHaveLength(5)
    editor.redo()
    expect(editor.document).toEqual(doc)
  })
  it('retains data and history after an invalid load or deletion', () => {
    const editor = new SceneEditor(document()),
      before = editor.serialize()
    expect(() => editor.load({ version: 99 })).toThrow()
    expect(() => editor.remove('spawn')).toThrow()
    expect(editor.serialize()).toBe(before)
    expect(editor.canUndo).toBe(false)
  })
  it('round trips and invalidates redo after a new edit', () => {
    const editor = new SceneEditor(document())
    editor.update('box', { name: 'Renamed' })
    editor.undo()
    expect(editor.canRedo).toBe(true)
    editor.update('box', { color: '#abcdef' })
    expect(editor.canRedo).toBe(false)
    expect(new SceneEditor(JSON.parse(editor.serialize())).document).toEqual(editor.document)
  })
})
