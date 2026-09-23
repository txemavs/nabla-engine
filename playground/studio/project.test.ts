import { expect, test } from 'vitest'
import { createSampleScene } from '../../src/sample.js'
import {
  createProject,
  parseProject,
  projectFilename,
  retainLocation,
  visitLocation,
  travelPlanet,
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

test('planet travel preserves global object identity and position without creating vehicles', async () => {
  const { createPlanetScene } = await import('./planet-scene.js')
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

test('legacy planetary scenes merge colliding IDs and remap portal relationships', async () => {
  const { createPlanetScene } = await import('./planet-scene.js')
  const { createPortal } = await import('../../src/portal.js')
  const a = createPlanetScene({ latitude: 40.4, longitude: -3.7, altitude: 0 }, 'Madrid')
  const b = createPlanetScene({ latitude: -33.8, longitude: 151.2, altitude: 0 }, 'Sydney')
  a.entities.push(createPortal('gate', [0, 2, 0]))
  b.entities.push(createPortal('gate', [0, 2, 0]))
  const p = parseProject({
    format: 'nabla-project',
    version: 1,
    name: 'Old',
    activeLocation: 'b',
    locations: [
      { id: 'a', scene: a },
      { id: 'b', scene: b },
    ],
  })
  expect(p.locations).toHaveLength(1)
  expect(p.locations[0].scene.entities.filter((e) => e.portal)).toHaveLength(2)
  expect(new Set(p.locations[0].scene.entities.map((e) => e.id)).size).toBe(
    p.locations[0].scene.entities.length,
  )
  expect(p.objects.filter((o) => o.entityId.startsWith('car-a'))).toHaveLength(2)
  expect(parseProject(JSON.parse(JSON.stringify(p))).planetId).toBe(p.planetId)
})

test('legacy directed portal windows retain stable endpoints after IDs are merged', async () => {
  const { createPlanetScene } = await import('./planet-scene.js')
  const { createPortal } = await import('../../src/portal.js')
  const { portalRegistry } = await import('./portal-registry.js')
  const pieces = [40, 43].map((lat, i) => {
    const scene = createPlanetScene({ latitude: lat, longitude: -3, altitude: 0 }, String(i))
    scene.entities.push(createPortal('gate'))
    const p = createProject(scene)
    p.locations[0].id = String(i)
    p.objects.forEach((o) => (o.locationId = String(i)))
    return p
  })
  const old = {
    format: 'nabla-project' as const,
    version: 2 as const,
    name: 'Legacy',
    activeLocation: '0',
    locations: pieces.flatMap((p) => p.locations),
    objects: pieces.flatMap((p) => p.objects),
  }
  const gates = portalRegistry(old).filter((p) => p.entityId === 'gate')
  const result = parseProject({
    ...old,
    connections: [{ source: gates[0].id, destination: gates[1].id, mode: 'window' }],
  })
  const links = result.connections!
  expect(links).toHaveLength(1)
  const ids = new Set(portalRegistry(result).map((p) => p.id))
  expect(ids.has(links[0].source)).toBe(true)
  expect(ids.has(links[0].destination)).toBe(true)
  expect(parseProject(JSON.parse(JSON.stringify(result))).connections).toEqual(links)
})
