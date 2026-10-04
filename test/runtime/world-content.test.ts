import { expect, it, vi } from 'vitest'
import { createPortal } from '../../src/entity/portal/portal.js'
import { createEntity } from '../../src/entity/schema.js'
import {
  portalRegistry,
  setPortalConnection,
  resolveWorldPortalViews,
  type WorldContent,
} from '../../src/runtime/world-content.js'
function world(): WorldContent {
  return {
    activeLocation: 'a',
    objects: [],
    locations: ['a', 'b'].map((id) => ({
      id,
      scene: {
        version: 1,
        name: id,
        entities: [createPortal('gate'), createEntity('spawn', 'spawn')],
      },
    })),
  }
}
it('supports pure world content and preserves host fields on connection edits', () => {
  const content = { ...world(), editorMetadata: 'keep' },
    [a, b] = portalRegistry(content)
  const next = setPortalConnection(content, a.id, b.id, 'window')
  expect(next.editorMetadata).toBe('keep')
  expect(content.connections).toBeUndefined()
  expect(next.connections).toEqual([{ source: a.id, destination: b.id, mode: 'window' }])
  expect(() => setPortalConnection(next, a.id, a.id, 'window')).toThrow()
  next.locations[1].scene.entities[0].size[0] += 1
  expect(() => setPortalConnection(next, a.id, b.id, 'window')).toThrow()
})
it('keeps root-object identities stable across location changes and detects corrupt ancestry', () => {
  const content = world(),
    gate = content.locations[0].scene.entities[0],
    root = createEntity('root', 'group')
  gate.parentId = root.id
  content.locations[0].scene.entities.push(root)
  content.objects.push({ id: 'global', entityId: 'root', locationId: 'a' })
  expect(portalRegistry(content)[0].id).toBe('global/gate')
  root.parentId = gate.id
  expect(() => portalRegistry(content)).toThrow(/Cyclic/)
  root.parentId = 'missing'
  expect(() => portalRegistry(content)).toThrow(/Missing/)
})
it('resolves only visible windows from the active location', () => {
  let content = world()
  const [a, b] = portalRegistry(content)
  content = setPortalConnection(content, a.id, b.id, 'window')
  const remote = {} as never,
    resolve = vi.fn(() => remote),
    surface = { mesh: { visible: true } } as never
  expect(resolveWorldPortalViews(content, new Map([['gate', surface]]), resolve).get('gate')).toBe(
    remote,
  )
  expect(resolve).toHaveBeenCalledWith('b', content.locations[1].scene, 'gate')
  resolve.mockClear()
  content.activeLocation = 'b'
  expect(resolveWorldPortalViews(content, new Map([['gate', surface]]), resolve).size).toBe(0)
  expect(resolve).not.toHaveBeenCalled()
  content.activeLocation = 'a'
  content.connections![0].mode = 'closed'
  expect(resolveWorldPortalViews(content, new Map([['gate', surface]]), resolve).size).toBe(0)
})
