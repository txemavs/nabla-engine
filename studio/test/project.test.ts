import { expect, test } from 'vitest'
import { createSampleScene } from '../../src/scene/sample.js'
import {
  createProject,
  parseProject,
  projectFilename,
  retainLocation,
  visitLocation,
  travelPlanet,
} from '../project.js'

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
  expect(projectFilename('../../World: demo')).toBe('..-..-World- demo.nabla.json')
})

test('current projects treat planet poses as authoritative and reject retired versions', () => {
  const scene = createSampleScene()
  const migrated = createProject(scene)
  expect(migrated.version).toBe(3)
  expect(() => parseProject({ ...migrated, version: 1 })).toThrow()
  expect(() => parseProject({ ...migrated, version: 2 })).toThrow()
  const car = migrated.objects.find((o) => o.entityId === 'car-a')!
  expect(car.pose.frame).toBe('nabla-earth-sphere-v1')
  expect(Math.hypot(...car.pose.position)).toBeGreaterThan(6000000)
  // Local transform is only a working copy; editing it in a project file cannot override the world pose.
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

test('planet travel preserves global object identity and position without creating vehicles', async () => {
  const { createPlanetScene } = await import('../planet-scene.js')
  const madrid = createPlanetScene({ latitude: 40.4168, longitude: -3.7038, altitude: 0 }, 'Madrid')
  let project = createProject(madrid)
  const car = project.objects.find((o) => o.entityId === 'car-a')!
  const planetId = project.planetId
  project = travelPlanet(project, 43.32969, -1.819606, 'Irún')
  expect(project.version).toBe(3)
  expect(project.locations).toHaveLength(1)
  expect(project.planetId).toBe(planetId)
  project.objects
    .find((o) => o.id === car.id)!
    .pose.position.forEach((n, i) => expect(n).toBeCloseTo(car.pose.position[i], 7))
  expect(project.locations[0].scene.entities.filter((e) => e.kind === 'vehicle')).toHaveLength(2)
  const restored = parseProject(JSON.parse(JSON.stringify(project)))
  expect(restored.planetId).toBe(planetId)
  expect(restored.bookmarks).toHaveLength(2)
  expect(
    travelPlanet(restored, 40.4168, -3.7038, 'Madrid').locations[0].scene.entities.find(
      (e) => e.id === 'car-a',
    )!.transform.position[0],
  ).toBeCloseTo(0, 6)
})
