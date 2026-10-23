import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { startRelay } from './server.mjs'
import { SpatialIndex } from './spatial-index.mjs'

const pose = (p) => ({
  position: p,
  rotation: [0, 0, 0, 1],
  velocity: [0, 0, 0],
  angularVelocity: [0, 0, 0],
})
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return
    await delay(5)
  }
  assert.fail('Expected condition within one second')
}
async function connect(port) {
  const s = new WebSocket(`ws://127.0.0.1:${port}`)
  s.inbox = []
  s.visible = new Set()
  s.objects = new Map()
  s.on('message', (raw) => {
    const m = JSON.parse(String(raw))
    s.inbox.push(m)
    if (m.type === 'welcome') for (const e of m.entities ?? []) s.objects.set(e.i, e)
    if (m.type === 'visible') s.visible.add(m.peer)
    if (m.type === 'hidden') s.visible.delete(m.peer)
    if (m.type === 'event' && m.kind === 'entity') s.objects.set(m.data.i, m.data)
    if (m.type === 'event' && ['entity.hidden', 'entity.gone'].includes(m.kind))
      s.objects.delete(m.data.i)
  })
  s.json = (m) => s.send(JSON.stringify(m))
  s.next = async (type, predicate = () => true) => {
    await until(() => s.inbox.some((m) => m.type === type && predicate(m)))
    const i = s.inbox.findIndex((m) => m.type === type && predicate(m))
    return s.inbox.splice(i, 1)[0]
  }
  await once(s, 'open')
  return s
}
async function setup(t, options = {}) {
  const relay = await startRelay({
    port: 0,
    host: '127.0.0.1',
    worldTickMs: 10,
    log: () => {},
    ...options,
  })
  t.after(() => relay.close())
  return relay
}
async function join(relay, p = [0, 0, 0], extra = {}) {
  const s = await connect(relay.port)
  s.json({
    type: 'join',
    version: 2,
    room: 'world',
    world: { space: 'local', content: 'map-v1' },
    position: p,
    ...extra,
  })
  s.welcome = await s.next('welcome')
  return s
}

test('spatial grid finds neighbours across negative boundaries and updates/deletes entries', () => {
  const grid = new SpatialIndex(250)
  grid.set('a', [-1, 0, 0])
  grid.set('b', [1, 0, 0])
  grid.set('far', [1000, 0, 0])
  assert.deepEqual(
    grid
      .near([0, 0, 0], 5)
      .map((x) => x.id)
      .sort(),
    ['a', 'b'],
  )
  grid.set('a', [2000, 0, 0])
  grid.delete('b')
  assert.deepEqual(grid.near([0, 0, 0], 5), [])
  assert.equal(grid.entries.size, 2)
})

test(
  'on-foot planetary snapshots carry orientation and stale sequences cannot move the observer backwards',
  { timeout: 5000 },
  async (t) => {
    const relay = await setup(t, { worldRadius: 100 })
    const world = { space: 'planet', content: 'earth' }
    const a = await join(relay, [6371000, 0, 0], { world })
    const b = await join(relay, [6371000, 0, 1], { world })
    await until(() => b.visible.has(a.welcome.peer))
    const avatar = { p: [6371000, 0, 0], y: 0, s: 0, a: 0, q: [0, 0, 0, 1], u: [0, 0, -1] }
    a.json({ type: 'snapshot', seq: 10, t: 100, avatar })
    assert.deepEqual((await b.next('snapshot')).avatar.q, avatar.q)
    a.json({ type: 'snapshot', seq: 11, t: 110, avatar: { ...avatar, p: [6371000, 0, 1000] } })
    await until(() => !b.visible.has(a.welcome.peer))
    a.json({ type: 'snapshot', seq: 10, t: 100, avatar })
    await delay(30)
    assert.equal(b.visible.size, 0)
    a.json({ type: 'snapshot', seq: 12, t: 120, avatar })
    await until(() => b.visible.has(a.welcome.peer))
  },
)

test(
  'more than 64 players share one instance while every observer stays capped',
  { timeout: 15000 },
  async (t) => {
    const relay = await setup(t)
    const peers = []
    for (let i = 0; i < 70; i++) peers.push(await join(relay, [i, 0, 0]))
    await until(() => peers.every((p) => p.visible.size === 64))
    assert.equal(new Set(peers.map((p) => p.welcome.peer)).size, 70)
    for (const p of peers) assert.ok(!p.visible.has(p.welcome.peer))
    const health = await fetch(`http://127.0.0.1:${relay.port}/health`).then((r) => r.json())
    assert.equal(health.players, 70)
    assert.equal(health.worlds, 1)
  },
)

test(
  'movement updates neighbours without changing identity or releasing driven entities',
  { timeout: 5000 },
  async (t) => {
    const relay = await setup(t, { worldRadius: 100 })
    const a = await join(relay),
      b = await join(relay, [10, 0, 0]),
      c = await join(relay, [1000, 0, 0])
    await until(() => b.visible.has(a.welcome.peer))
    a.json({
      type: 'event',
      kind: 'entity.spawn',
      data: { i: 'car', y: 'car', p: [0, 0, 0], q: [0, 0, 0, 1], d: 1 },
    })
    await until(() => b.objects.has('car'))
    a.json({ type: 'snapshot', seq: 0, t: 0, e: 'car', state: pose([1001, 0, 0]) })
    await until(
      () => !b.visible.has(a.welcome.peer) && c.visible.has(a.welcome.peer) && c.objects.has('car'),
    )
    assert.equal(c.objects.get('car').d, a.welcome.peer)
    assert.equal(a.readyState, WebSocket.OPEN)
    assert.ok(!b.objects.has('car'))
    assert.ok(!b.inbox.some((m) => m.type === 'left' && m.peer === a.welcome.peer))
    a.json({ type: 'snapshot', seq: 1, t: 50, e: 'car', state: pose([1, 0, 0]) })
    await until(() => b.objects.has('car') && !c.visible.has(a.welcome.peer))
    assert.equal(b.objects.get('car').d, a.welcome.peer)
    // The baseline on re-entry is the most recent complete pose, not the spawn position.
    const snapshot = await b.next('snapshot', (m) => m.peer === a.welcome.peer && m.seq === 1)
    assert.deepEqual(snapshot.state.position, [1, 0, 0])
  },
)

test(
  'resume preserves identity and health, releases actual disconnects and rejects concurrent use',
  { timeout: 5000 },
  async (t) => {
    const relay = await setup(t)
    const a = await join(relay),
      b = await join(relay, [1, 0, 0])
    await until(() => a.visible.has(b.welcome.peer))
    b.json({ type: 'event', kind: 'hit', data: { t: a.welcome.peer, d: 25 } })
    await a.next('event', (m) => m.kind === 'health' && m.data.h === 75)
    const duplicate = await connect(relay.port)
    duplicate.json({
      type: 'join',
      version: 2,
      room: 'world',
      world: { space: 'local', content: 'map-v1' },
      position: [0, 0, 0],
      resume: a.welcome.resume,
    })
    assert.equal((await duplicate.next('error')).code, 'session-active')
    a.json({
      type: 'event',
      kind: 'entity.spawn',
      data: { i: 'car', y: 'car', p: [0, 0, 0], q: [0, 0, 0, 1], d: 1 },
    })
    await until(() => b.objects.has('car'))
    const closed = once(a, 'close')
    a.terminate()
    await closed
    await until(() => !b.visible.has(a.welcome.peer) && !b.objects.get('car')?.d)
    const resumed = await join(relay, [0, 0, 0], { resume: a.welcome.resume })
    assert.equal(resumed.welcome.peer, a.welcome.peer)
    assert.equal(resumed.welcome.health[a.welcome.peer], 75)
    assert.equal(resumed.welcome.color, a.welcome.color)
    assert.equal(resumed.welcome.entities.find((e) => e.i === 'car')?.o, a.welcome.peer)
    assert.equal(resumed.welcome.entities.find((e) => e.i === 'car')?.d, undefined)
    resumed.json({ type: 'event', kind: 'entity.claim', data: { i: 'car' } })
    await until(() => b.objects.get('car')?.d === a.welcome.peer)
  },
)

test(
  'coordinate space/content mismatch fails; instances and expired tokens stay isolated',
  { timeout: 5000 },
  async (t) => {
    const relay = await setup(t, { worldSessionTtlMs: 30 })
    const a = await join(relay)
    const b = await connect(relay.port)
    const request = {
      type: 'join',
      version: 2,
      room: 'world',
      world: { space: 'local', content: 'different' },
      position: [0, 0, 0],
    }
    b.json(request)
    assert.equal((await b.next('error')).code, 'world-mismatch')
    const other = await join(relay, [0, 0, 0], { room: 'other' })
    assert.equal(other.visible.size, 0)
    const closed = once(a, 'close')
    a.terminate()
    await closed
    await delay(60)
    b.json({ ...request, world: { space: 'local', content: 'map-v1' }, resume: a.welcome.resume })
    assert.equal((await b.next('error')).code, 'session-expired')
  },
)

test(
  'planetary ECEF neighbours work across the date line; unlocated/invalid peers are rejected',
  { timeout: 5000 },
  async (t) => {
    const relay = await setup(t)
    const world = { space: 'planet', content: 'earth-v1' }
    const a = await join(relay, [-6371000, 0, -5], { world }),
      b = await join(relay, [-6371000, 0, 5], { world })
    await until(() => a.visible.has(b.welcome.peer))
    const invalid = await connect(relay.port)
    invalid.json({ type: 'join', version: 2, room: 'world', world, position: [0, 0, 0] })
    await invalid.next('error')
    assert.equal(a.visible.size, 1)
    b.json({ type: 'snapshot', t: 0, seq: 0, state: pose([6371000, 0, 0]) })
    await until(() => a.visible.size === 0)
  },
)

test(
  'hits require mutual visibility and a living sender; hidden entities cannot be claimed',
  { timeout: 5000 },
  async (t) => {
    const relay = await setup(t, { worldMaxPeers: 1, worldRadius: 100 })
    const a = await join(relay, [0, 0, 0]),
      b = await join(relay, [1, 0, 0]),
      c = await join(relay, [90, 0, 0])
    await until(() => a.visible.has(b.welcome.peer) && c.visible.has(b.welcome.peer))
    c.json({ type: 'event', kind: 'hit', data: { t: b.welcome.peer, d: 100 } })
    // Use a legitimate hit as an ordered barrier; C's rejected hit cannot have killed B.
    a.json({ type: 'event', kind: 'hit', data: { t: b.welcome.peer, d: 10 } })
    assert.equal((await b.next('event', (m) => m.kind === 'health' && m.data.h !== 100)).data.h, 90)
    a.json({ type: 'event', kind: 'hit', data: { t: b.welcome.peer, d: 100 } })
    await b.next('event', (m) => m.kind === 'death')
    b.json({ type: 'event', kind: 'hit', data: { t: a.welcome.peer, d: 100 } })
    a.json({
      type: 'event',
      kind: 'entity.spawn',
      data: { i: 'car', y: 'car', p: [0, 0, 0], q: [0, 0, 0, 1] },
    })
    await until(() => a.objects.has('car'))
    c.json({ type: 'event', kind: 'entity.claim', data: { i: 'car' } })
    await delay(30)
    assert.equal(a.objects.get('car').d, undefined)
    assert.ok(!a.inbox.some((m) => m.kind === 'death' && m.data.t === a.welcome.peer))
  },
)
