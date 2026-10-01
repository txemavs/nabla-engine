import { test, expect } from 'vitest'
import { SceneEditor } from '../../src/scene/history.js'
import { createSampleScene } from '../../src/scene/sample.js'
import { parseScene } from '../../src/scene/document.js'
import { objectProperties, axisLocks, axisLocked } from '../ui/properties.js'
import { sceneTree } from '../ui/scene-tree.js'
import { createProject, parseProject } from '../project.js'
import { hasLocalPreset } from '../../test/local-presets.js'
function context() {
  const doc = createSampleScene()
  delete doc.geography
  const editor = new SceneEditor(doc)
  const entity = editor.document.entities.find((e) => e.kind === 'box')!
  return {
    doc: editor.document,
    entity,
    editor,
    disabled: false,
    refresh: () => {},
    rebuild: () => {},
    finishPose: () => {},
    locksChanged: () => {},
  }
}
test('property edits change the document and can be undone', () => {
  const c = context(),
    before = c.entity.transform.position[0]
  const sections = objectProperties(c)
  sections
    .find((s) => s.id === 'position')!
    .fields!.find((f) => f.id === 'position-0')!
    .change(before + 2)
  expect(c.editor.entity(c.entity.id).transform.position[0]).toBe(before + 2)
  c.editor.undo()
  expect(c.editor.entity(c.entity.id).transform.position[0]).toBe(before)
})
test('axis locks belong to individual objects', () => {
  const c = context()
  axisLocks.clear()
  objectProperties(c)
    .find((s) => s.id === 'position')!
    .fields!.find((f) => f.id === 'position-0')!.toggleLock!()
  expect(axisLocked(c.entity.id, 0)).toBe(true)
  expect(axisLocked('other', 0)).toBe(false)
  expect(axisLocked(c.entity.id, 1)).toBe(false)
})
test('scene categories contain each authored entity once and classify by components', () => {
  const doc = createSampleScene()
  const vehicle = doc.entities.find((e) => e.kind === 'vehicle')!
  vehicle.vehicle!.boat = true
  const groups = sceneTree(doc.entities)
  expect(
    groups.find((g) => g.id === 'class:Barcos')!.children!.some((e) => e.id === vehicle.id),
  ).toBe(true)
  const ids = groups.flatMap((g) => g.children!.map((e) => e.id))
  expect(new Set(ids).size).toBe(ids.length)
  expect(groups.some((g) => g.id === 'class:Portales')).toBe(true)
})
test('planet water survives scene and project serialization and rejects invalid levels', () => {
  const doc = createSampleScene()
  doc.water = { mode: 'manual', level: 4.5, amplitude: 1.2 }
  doc.sky = { mode: 'fixed', at: '2026-09-29T12:00:00.000Z' }
  const project = parseProject(JSON.parse(JSON.stringify(createProject(doc))))
  expect(project.locations[0].scene.water).toEqual(doc.water)
  expect(project.locations[0].scene.sky).toEqual(doc.sky)
  expect(() => parseScene({ ...doc, water: { ...doc.water, level: 100 } })).toThrow()
})

test('project editor locks round-trip without changing engine entities', () => {
  const project = createProject(createSampleScene())
  project.editorState = { axisLocks: { [project.activeLocation]: { 'car-a': [0, 2] } } }
  const restored = parseProject(JSON.parse(JSON.stringify(project)))
  expect(restored.editorState).toEqual(project.editorState)
  expect(restored.locations[0].scene.entities.find((e) => e.id === 'car-a')).not.toHaveProperty(
    'axisLocks',
  )
  expect(() =>
    parseProject({ ...project, editorState: { axisLocks: { x: { y: [4] } } } }),
  ).toThrow()
})

test.skipIf(!hasLocalPreset('police'))(
  'assigning police equipment preserves saved poses, wheel definitions and tuning, and is undoable',
  async () => {
    const { presetVehicle } = await import('../../src/catalog/vehicles/library.js')
    const c = context()
    const car = presetVehicle('police', 'police', [27, 4, -33])
    delete car.visual!.presentation
    car.vehicle!.engineForce = 7654
    const doc = { ...c.doc, entities: [...c.doc.entities, car] }
    const editor = new SceneEditor(doc)
    const fields = objectProperties({
      ...c,
      doc: editor.document,
      editor,
      entity: editor.entity(car.id),
    }).find((section) => section.id === 'vehicle-presentation')!.fields!
    expect(fields[0].value).toBe('')
    fields[0].change('nabla.police')
    expect(editor.entity(car.id)).toEqual({
      ...car,
      visual: { ...car.visual, presentation: 'nabla.police' },
    })
    const parsed = parseScene(JSON.parse(editor.serialize()))
    expect(parsed.entities.find((e) => e.id === car.id)!.visual!.presentation).toBe('nabla.police')
    editor.undo()
    expect(editor.entity(car.id)).toEqual(car)
  },
)

test('hierarchy preserves authored parents without turning categories into groups', async () => {
  const { sceneHierarchy } = await import('../ui/scene-tree.js')
  const c = context()
  const parent = c.doc.entities.find((e) => e.id !== c.entity.id && e.kind === 'box')!
  const entities = [parent, { ...c.entity, parentId: parent.id }]
  const tree = sceneHierarchy(entities)
  expect(tree).toHaveLength(1)
  expect(tree[0].id).toBe(parent.id)
  expect(tree[0].children?.[0].id).toBe(c.entity.id)
})

test('exact transforms distinguish local/global axes and preserve parent transforms', async () => {
  const { relativeTransform } = await import('../ui/exact-transform.js')
  const { Quaternion, Vector3 } = await import('three')
  const { SceneGraph } = await import('../../src/scene/graph.js')
  const c = context()
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2).toArray()
  c.editor.update(c.entity.id, { transform: { ...c.entity.transform, rotation } })
  const before = c.editor.entity(c.entity.id).transform.position
  const local = relativeTransform(c.editor.document, c.entity.id, 'translate', 'local', 0, 2)
  const global = relativeTransform(c.editor.document, c.entity.id, 'translate', 'global', 0, 2)
  expect(local.position[2]).toBeCloseTo(before[2] - 2)
  expect(global.position[0]).toBeCloseTo(before[0] + 2)
  const parent = c.doc.entities.find((e) => e.id !== c.entity.id && e.kind === 'box')!
  c.editor.update(c.entity.id, { motion: 'static' })
  c.editor.update(parent.id, { motion: 'static' })
  c.editor.reparent(c.entity.id, parent.id)
  const world = SceneGraph.fromValidated(c.editor.document).worldTransform(c.entity.id)
  const next = relativeTransform(c.editor.document, c.entity.id, 'translate', 'global', 1, 3)
  c.editor.update(c.entity.id, { transform: next })
  expect(
    SceneGraph.fromValidated(c.editor.document).worldTransform(c.entity.id).position[1],
  ).toBeCloseTo(world.position[1] + 3)
  c.editor.undo()
  expect(SceneGraph.fromValidated(c.editor.document).worldTransform(c.entity.id).position).toEqual(
    world.position,
  )
})

test('capability drafts isolate tuning from flags, preserve equipment and do not write on cancel', async () => {
  const { openCapability } = await import('../ui/properties.js')
  const { capabilitySections, capabilityOpen } = await import('../ui/state.js')
  const c = context()
  c.entity = c.doc.entities.find((e) => e.kind === 'vehicle')!
  const before = c.editor.serialize()
  openCapability(c, 'drive')
  const fields = capabilitySections.value.flatMap((s) => s.fields ?? [])
  expect(fields.some((f) => f.id === 'cap-flight' || f.id === 'cap-interior-min-0')).toBe(false)
  fields.find((f) => f.id === 'cap-engineForce')!.change(8000)
  expect(c.editor.serialize()).toBe(before)
  capabilitySections.value
    .flatMap((s) => s.actions ?? [])
    .find((a) => a.id === 'cancel-capability')!
    .execute()
  expect(capabilityOpen.value).toBe(false)
  expect(c.editor.serialize()).toBe(before)
  openCapability(c, 'drive')
  capabilitySections.value
    .flatMap((s) => s.fields ?? [])
    .find((f) => f.id === 'cap-engineForce')!
    .change(8000)
  capabilitySections.value
    .flatMap((s) => s.actions ?? [])
    .find((a) => a.id === 'apply-capability')!
    .execute()
  expect(c.editor.entity(c.entity.id).vehicle!.engineForce).toBe(8000)
  expect(c.editor.entity(c.entity.id).visual).toEqual(c.entity.visual)
  expect(c.editor.entity(c.entity.id).transform).toEqual(c.entity.transform)
  c.editor.undo()
  expect(c.editor.serialize()).toBe(before)
})

test('capability drafts reject applying during play or over a changed document', async () => {
  const { openCapability } = await import('../ui/properties.js')
  const { capabilitySections } = await import('../ui/state.js')
  const c = context()
  c.entity = c.doc.entities.find((e) => e.kind === 'vehicle')!
  let editable = true
  openCapability({ ...c, canEdit: () => editable })
  const apply = capabilitySections.value
    .flatMap((s) => s.actions ?? [])
    .find((a) => a.id === 'apply-capability')!
  const before = c.editor.serialize()
  editable = false
  expect(() => apply.execute()).toThrow('Detén la prueba')
  expect(c.editor.serialize()).toBe(before)
  editable = true
  c.editor.update(c.entity.id, { name: 'Otro cambio' })
  expect(() => apply.execute()).toThrow('La escena ha cambiado')
  expect(c.editor.entity(c.entity.id).name).toBe('Otro cambio')
})
