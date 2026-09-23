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
