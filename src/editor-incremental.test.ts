import { describe, expect, it } from 'vitest'
import { SceneEditor } from './editor.js'
import { createEntity, parseScene } from './scene.js'

describe('incremental entity transactions', () => {
  it('does not read unrelated topology when moving an object, and preserves undo ownership', () => {
    const scene = parseScene({
      version: 1,
      name: 'Map',
      entities: [
        createEntity('spawn', 'spawn'),
        createEntity('object', 'box'),
        createEntity('building', 'solid'),
      ],
    })
    const geometry = scene.entities[2].geometry!
    const vertices = geometry.vertices
    let topologyReads = 0
    Object.defineProperty(geometry, 'vertices', {
      enumerable: true,
      get: () => {
        topologyReads++
        return vertices
      },
    })
    const editor = SceneEditor.fromValidated(scene)
    const transform = {
      position: [3, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
    }
    editor.update('object', { transform })
    expect(topologyReads).toBe(0)
    transform.position[0] = 90
    expect(editor.entity('object').transform.position[0]).toBe(3)
    editor.undo()
    expect(editor.entity('object').transform.position[0]).toBe(0)
    editor.redo()
    expect(editor.entity('object').transform.position[0]).toBe(3)
    expect(topologyReads).toBe(0)
  })

  it('rejects invalid patches and cross-entity invariants without changing history', () => {
    const editor = new SceneEditor({
      version: 1,
      name: 'Validation',
      entities: [
        createEntity('spawn', 'spawn'),
        createEntity('object', 'box'),
        createEntity('building', 'solid'),
      ],
    })
    expect(() =>
      editor.update('object', { transform: { position: [NaN, 0, 0], rotation: [0, 0, 0, 1] } }),
    ).toThrow()
    expect(() => editor.update('object', { kind: 'spawn' })).toThrow()
    const geometry = editor.entity('building').geometry!
    geometry.faces[0] = [999, 1, 2]
    expect(() => editor.update('building', { geometry })).toThrow()
    expect(() => editor.update('object', { transform: undefined })).toThrow()
    expect(() => editor.update('object', { name: undefined })).toThrow()
    expect(editor.canUndo).toBe(false)
    const before = editor.entity('object')
    editor.update('object', { transform: before.transform })
    expect(editor.canUndo).toBe(false)
  })
})
