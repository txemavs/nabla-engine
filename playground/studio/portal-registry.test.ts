import { expect, test } from 'vitest'
import { createPortal } from '../../src/portal.js'
import { createSampleScene } from '../../src/sample.js'
import { createEntity, parseScene } from '../../src/scene.js'
import { createProject, parseProject, retainLocation, visitLocation } from './project.js'
import { portalRegistry, setPortalConnection } from './portal-registry.js'

test('one closed mouth is placed at the cursor, without a generated partner', () => {
  const portal = createPortal('sol', [12, 4, -9])
  expect(portal.transform.position).toEqual([12, 4, -9])
  expect(portal.portal).toEqual({ pairId: null, mode: 'closed' })
  expect(
    parseScene({
      version: 1,
      name: 'Solo',
      entities: [portal, createEntity('spawn', 'spawn')],
    }).entities.filter((e) => e.portal),
  ).toHaveLength(1)
})

test('global links survive named saves and renaming, and disappear with a destination', () => {
  const madrid = createSampleScene()
  madrid.name = 'Madrid'
  madrid.entities.push(createPortal('gate', [0, 2, 0]))
  const zamora = structuredClone(madrid)
  zamora.name = 'Zamora'
  zamora.geography = { ...madrid.geography!, latitude: 41.5, longitude: -5.75 }
  let project = visitLocation(createProject(madrid), zamora)
  const gates = portalRegistry(project).filter((p) => p.entityId === 'gate')
  expect(gates).toHaveLength(2)
  project = setPortalConnection(project, gates[0].id, gates[1].id, 'window')
  zamora.entities.find((e) => e.id === 'gate')!.name = 'Plaza Mayor'
  project = parseProject(JSON.parse(JSON.stringify(retainLocation(project, zamora))))
  expect(project.connections?.[0].destination).toBe(gates[1].id)
  expect(portalRegistry(project).find((p) => p.id === gates[1].id)?.name).toBe('Plaza Mayor')
  expect(() => setPortalConnection(project, gates[0].id, 'missing', 'window')).toThrow()
  zamora.entities = zamora.entities.filter((e) => e.id !== 'gate')
  expect(retainLocation(project, zamora).connections).toEqual([])
})

test('incompatible apertures cannot retain a remote connection', () => {
  const scene = createSampleScene()
  scene.entities.push(createPortal('one'), createPortal('two'))
  let project = createProject(scene)
  const [a, b] = portalRegistry(project).filter((p) => ['one', 'two'].includes(p.entityId))
  project = setPortalConnection(project, a.id, b.id, 'window')
  scene.entities.find((e) => e.id === 'two')!.size[0] = 10
  expect(retainLocation(project, scene).connections).toEqual([])
})
