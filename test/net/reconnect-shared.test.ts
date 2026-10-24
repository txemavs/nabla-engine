import { expect, it, vi } from 'vitest'
import { LoopbackTransport, SnapshotSync } from '../../src/net/index.js'

it('keeps the local vehicle binding across a continuous reconnect and reconciles deletions', () => {
  const transport = new LoopbackTransport()
  const spawn = vi.fn(() => 'copy')
  const despawn = vi.fn()
  const sync = new SnapshotSync({
    transport,
    room: 'yard',
    world: { space: 'local', content: 'yard-v1' },
    localPosition: () => [0, 0, 0],
    localEntity: () => 'my-car',
    host: {
      entityTransform: () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1] }),
      entityVelocity: () => [0, 0, 0],
      setEntityKinematic: () => true,
      moveKinematicEntity: () => true,
    },
    spawnRemote: () => null,
    despawnRemote: () => {},
    shared: { spawn, despawn },
  })
  const welcome = (entities: unknown[], peer = 'driver') =>
    transport.receive(
      JSON.stringify({
        type: 'welcome',
        version: 2,
        peer,
        room: 'yard',
        resume: 'a'.repeat(64),
        peers: [],
        entities,
      }),
    )
  welcome([])
  const id = sync.shared!.publish(
    'vehicle',
    {},
    { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    'my-car',
    { drive: true },
  )!
  const record = { i: id, y: 'vehicle', p: [0, 0, 0], q: [0, 0, 0, 1], o: 'driver', d: 'driver' }
  transport.receive(JSON.stringify({ type: 'event', peer: 'relay', kind: 'entity', data: record }))
  expect(sync.shared!.localIdOf(id)).toBe('my-car')
  transport.close()
  expect(sync.peerId).toBeNull()
  expect(despawn).not.toHaveBeenCalled()
  transport.status = 'open'
  welcome([{ ...record, d: undefined }])
  expect(sync.shared!.localIdOf(id)).toBe('my-car')
  expect(sync.shared!.drives(id)).toBe(false)
  expect(sync.shared!.claim(id)).toBe(true)
  expect(spawn).not.toHaveBeenCalled()
  transport.close()
  transport.status = 'open'
  welcome([])
  expect(sync.shared!.get(id)).toBeNull()
  expect(despawn).toHaveBeenCalledTimes(1)
  sync.dispose()
})
