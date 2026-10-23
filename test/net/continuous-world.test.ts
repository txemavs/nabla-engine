import { afterEach, expect, it } from 'vitest'
import { createRequire } from 'node:module'
// @ts-expect-error Relay is a standalone JavaScript service.
import { startRelay } from '../../services/relay/server.mjs'
import {
  SnapshotSync,
  WebSocketTransport,
  type ContinuousWorldOptions,
  type EntityState,
  type WorldSession,
} from '../../src/net/index.js'
import { geoToLocal } from '../../src/math/geo/sphere.js'

const { WebSocket } = createRequire(new URL('../../services/relay/package.json', import.meta.url))(
  'ws',
)
const closers: (() => unknown)[] = []
afterEach(async () => {
  for (const close of closers.reverse()) await close()
  closers.length = 0
})
async function until(predicate: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('Timed out waiting for network state')
}
async function server() {
  const relay = await startRelay({ port: 0, host: '127.0.0.1', worldTickMs: 10, log: () => {} })
  closers.push(() => relay.close())
  return `ws://127.0.0.1:${relay.port}`
}
function client(
  url: string,
  world: ContinuousWorldOptions,
  position: [number, number, number] = [0, 0, 0],
) {
  const transport = new WebSocketTransport(url, (u) => new WebSocket(u))
  const moved: EntityState[] = []
  const events: { kind: string; data: Record<string, unknown> }[] = []
  const errors: string[] = []
  const state: EntityState = {
    position,
    rotation: [0, 0, 0, 1],
    velocity: [1, 0, 0],
    angularVelocity: [0, 0.1, 0],
  }
  const sync = new SnapshotSync({
    transport,
    room: 'continuous',
    world,
    host: {
      entityTransform: () => state,
      entityVelocity: () => state.velocity,
      entityAngularVelocity: () => state.angularVelocity,
      setEntityKinematic: () => true,
      moveKinematicEntity: (_id, pose, velocity, angularVelocity) => {
        moved.push({
          ...pose,
          velocity: velocity ?? [0, 0, 0],
          angularVelocity: angularVelocity ?? [0, 0, 0],
        })
        return true
      },
    },
    localEntity: () => 'own',
    spawnRemote: (peer) => 'remote-' + peer.peer,
    despawnRemote: () => {},
    onEvent: (message) => events.push(message),
    onError: (_message, code) => errors.push(code ?? 'unknown'),
  })
  closers.push(() => {
    sync.dispose()
    transport.close()
  })
  return { sync, transport, state, moved, events, errors }
}

it('runs the actual relay and client across different planetary origins, including fire rays', async () => {
  const url = await server()
  const originA = { latitude: 43.2, longitude: -2.9, altitude: 100 }
  const originB = { latitude: 43.2001, longitude: -2.9001, altitude: 100 }
  const a = client(url, { space: 'planet', content: 'earth-v1', origin: originA })
  const b = client(url, { space: 'planet', content: 'earth-v1', origin: originB })
  await until(() => a.sync.peerId !== null && b.sync.remotes.size === 1)
  a.sync.update()
  await until(() => {
    b.sync.update()
    return b.moved.length > 0
  })
  expect(b.moved.length).toBeGreaterThan(0)
  const expected = geoToLocal(originB, originA)
  b.moved.at(-1)!.position.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 4))
  a.sync.sendEvent('fire', { w: 0, k: 0, o: [0, 0, 0], d: [0, 0, -1] })
  await until(() => b.events.some((e) => e.kind === 'fire'))
  const fire = b.events.find((e) => e.kind === 'fire')!
  ;(fire.data.o as number[]).forEach((v, i) => expect(v).toBeCloseTo(expected[i], 4))
  expect(a.errors).toEqual([])
  expect(b.errors).toEqual([])
})

it('a local GLB needs no geography; recreating sync resumes identity', async () => {
  const url = await server()
  const session: WorldSession = {}
  const a = client(url, { space: 'local', content: 'glb-v1', session })
  await until(() => a.sync.peerId !== null)
  const id = a.sync.peerId
  expect(session.token).toHaveLength(64)
  a.sync.dispose()
  a.transport.close()
  await new Promise((r) => setTimeout(r, 30))
  const b = client(url, { space: 'local', content: 'glb-v1', session })
  await until(() => b.sync.peerId !== null)
  expect(b.sync.peerId).toBe(id)
  expect(() => b.sync.switchRoom('another-cell')).toThrow(/do not switch/)
})

it('an expired token retries once with a new identity; incompatible content fails explicitly', async () => {
  const url = await server()
  const a = client(url, { space: 'local', content: 'glb-v1', session: { token: 'f'.repeat(64) } })
  await until(() => a.sync.peerId !== null)
  const b = client(url, { space: 'local', content: 'glb-v2' })
  await until(() => b.errors.includes('world-mismatch'))
  expect(b.sync.peerId).toBeNull()
  expect(a.errors).toEqual([])
})
