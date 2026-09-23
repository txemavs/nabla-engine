import { expect, test } from 'vitest'
import { createSampleScene } from '../../src/sample.js'
import {
  createProject,
  parseProject,
  projectFilename,
  retainLocation,
  visitLocation,
} from './project.js'

test('one project retains separate places with overlapping entity IDs and roundtrips', () => {
  const madrid = createSampleScene()
  madrid.name = 'Madrid'
  let project = createProject(madrid)
  const irun = createSampleScene()
  irun.name = 'Irún'
  project = visitLocation(project, irun)
  irun.entities[0].name = 'Edited in Irún'
  project = retainLocation(project, irun)
  const restored = parseProject(JSON.parse(JSON.stringify(project)))
  expect(restored.locations).toHaveLength(2)
  expect(restored.locations[0].scene.entities[0].name).toBe(madrid.entities[0].name)
  expect(restored.locations[1].scene.entities[0].name).toBe('Edited in Irún')
  expect(restored.activeLocation).toBe('local:Irún')
  // Undo can restore the previous document before the project pointer changes.
  const afterUndo = retainLocation(restored, madrid)
  expect(afterUndo.activeLocation).toBe('local:Madrid')
  expect(afterUndo.locations[1].scene.entities[0].name).toBe('Edited in Irún')
})
test('invalid location references and duplicate IDs are rejected', () => {
  const project = createProject(createSampleScene())
  expect(() => parseProject({ ...project, activeLocation: 'missing' })).toThrow()
  expect(() =>
    parseProject({ ...project, locations: [...project.locations, ...project.locations] }),
  ).toThrow()
})
test('file names remain portable and receive one project extension', () => {
  expect(projectFilename('My world.nabla.json')).toBe('My world.nabla.json')
  expect(projectFilename('../World: demo')).toBe('..-World- demo.nabla.json')
})

test('v1 migrates to stable global root identities and v2 treats planet poses as authoritative', () => {
  const scene = createSampleScene()
  const old = {
    format: 'nabla-project',
    version: 1,
    name: 'Legacy',
    activeLocation: 'legacy',
    locations: [{ id: 'legacy', scene }],
  }
  const migrated = parseProject(old)
  expect(migrated.version).toBe(2)
  const car = migrated.objects.find((o) => o.entityId === 'car-a')!
  expect(car.pose.frame).toBe('nabla-earth-sphere-v1')
  expect(Math.hypot(...car.pose.position)).toBeGreaterThan(6000000)
  // Local transform is only a working copy; editing it in a v2 file cannot override the world pose.
  const copy = structuredClone(migrated)
  copy.locations[0].scene.entities.find((e) => e.id === 'car-a')!.transform.position = [99, 99, 99]
  const restored = parseProject(copy)
  expect(
    restored.locations[0].scene.entities.find((e) => e.id === 'car-a')!.transform.position[0],
  ).toBeCloseTo(4, 6)
  expect(
    retainLocation(restored, restored.locations[0].scene).objects.find(
      (o) => o.entityId === 'car-a',
    )!.id,
  ).toBe(car.id)
  expect(() => parseProject({ ...copy, objects: [] })).toThrow('Missing root world pose')
})
