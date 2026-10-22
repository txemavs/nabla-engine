import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { startRelay } from './server.mjs'

const connect = (port) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`)
    const inbox = []
    const waiters = []
    socket.on('message', (data) => {
      const message = JSON.parse(String(data))
      const waiter = waiters.findIndex((w) => w.type === message.type)
      if (waiter >= 0) waiters.splice(waiter, 1)[0].resolve(message)
      else inbox.push(message)
    })
    socket.next = (type) => {
      const i = inbox.findIndex((m) => m.type === type)
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0])
      return new Promise((r) => waiters.push({ type, resolve: r }))
    }
    socket.json = (m) => socket.send(JSON.stringify(m))
    socket.on('open', () => resolve(socket))
    socket.on('error', reject)
  })

const state = {
  position: [1, 2, 3],
  rotation: [0, 0, 0, 1],
  velocity: [0, 0, 0],
  angularVelocity: [0, 0, 0],
}

test('drops game events above the per-peer rate limit', async () => {
  const relay = await startRelay({ port: 0, host: '127.0.0.1', log: () => {}, maxEvents: 3 })
  const a = await connect(relay.port)
  const b = await connect(relay.port)
  a.json({ type: 'join', version: 1, room: 'r', meta: {} })
  await a.next('welcome')
  b.json({ type: 'join', version: 1, room: 'r', meta: {} })
  await b.next('welcome')
  for (let i = 0; i < 10; i++) a.json({ type: 'event', kind: 'shot', data: { i } })
  await new Promise((r) => setTimeout(r, 300))
  let got = 0
  while (true) {
    const next = await Promise.race([
      b.next('event'),
      new Promise((r) => setTimeout(() => r(null), 100)),
    ])
    if (!next) break
    got++
  }
  assert.equal(got, 3)
  a.close()
  b.close()
  await relay.close()
})

test('relays snapshots inside a room and announces joins and leaves', async () => {
  const relay = await startRelay({ port: 0, host: '127.0.0.1', log: () => {} })
  const a = await connect(relay.port)
  const b = await connect(relay.port)
  const c = await connect(relay.port)
  a.json({ type: 'join', version: 1, room: 'r1', meta: { vehicle: 's3' } })
  const welcomeA = await a.next('welcome')
  assert.deepEqual(welcomeA.peers, [])
  b.json({ type: 'join', version: 1, room: 'r1', meta: {} })
  const welcomeB = await b.next('welcome')
  assert.equal(welcomeB.peers[0].peer, welcomeA.peer)
  assert.equal(welcomeB.peers[0].meta.vehicle, 's3')
  const joinedB = await a.next('joined')
  assert.equal(joinedB.peer, welcomeB.peer)
  assert.equal(welcomeA.slot, 0)
  assert.equal(welcomeB.slot, 1)
  assert.notEqual(welcomeA.color, welcomeB.color)
  assert.equal(joinedB.color, welcomeB.color)
  assert.equal(welcomeB.peers[0].color, welcomeA.color)
  c.json({ type: 'join', version: 1, room: 'other', meta: {} })
  await c.next('welcome')

  a.json({ type: 'snapshot', t: 10, seq: 0, state, peer: 'spoofed', extra: { lights: 5 } })
  const got = await b.next('snapshot')
  assert.deepEqual(got.extra, { lights: 5 })
  assert.equal(got.peer, welcomeA.peer)
  assert.deepEqual(got.state.position, [1, 2, 3])

  a.json({ type: 'profile', meta: { vehicle: 'vfr800' } })
  const profile = await b.next('profile')
  assert.equal(profile.peer, welcomeA.peer)
  assert.equal(profile.meta.vehicle, 'vfr800')
  a.json({
    type: 'event',
    kind: 'shot',
    data: { end: [1, 2, 3], damage: 12, target: welcomeB.peer },
  })
  const shot = await b.next('event')
  assert.equal(shot.peer, welcomeA.peer)
  assert.deepEqual(shot.data.end, [1, 2, 3])
  b.json({ type: 'join', version: 1, room: '../bad', meta: {} })
  assert.equal((await b.next('error')).message, 'Invalid room')

  a.close()
  assert.equal((await b.next('left')).peer, welcomeA.peer)
  // Slot 0 and its colour are free again for the next member.
  const d = await connect(relay.port)
  d.json({ type: 'join', version: 1, room: 'r1', meta: {} })
  const welcomeD = await d.next('welcome')
  assert.equal(welcomeD.slot, 0)
  assert.equal(welcomeD.color, welcomeA.color)
  d.close()
  b.close()
  c.close()
  await relay.close()
})

test('forwards snapshots only to members within RADIUS of the sender', async () => {
  const relay = await startRelay({ port: 0, host: '127.0.0.1', log: () => {}, radius: 200 })
  const at = (x) => ({ ...state, position: [x, 0, 0] })
  const join = async () => {
    const s = await connect(relay.port)
    s.json({ type: 'join', version: 1, room: 'r', meta: {} })
    await s.next('welcome')
    return s
  }
  const a = await join()
  const b = await join()
  const c = await join()
  b.json({ type: 'snapshot', t: 0, seq: 1, state: at(100) })
  c.json({ type: 'snapshot', t: 0, seq: 1, state: at(1000) })
  await new Promise((r) => setTimeout(r, 100))
  a.json({ type: 'snapshot', t: 1, seq: 2, state: at(0) })
  const fromA = (s) =>
    new Promise((resolve) => {
      const poll = async () => {
        for (;;) {
          const m = await Promise.race([
            s.next('snapshot'),
            new Promise((r) => setTimeout(() => r(null), 200)),
          ])
          if (!m) return resolve(false)
          if (m.seq === 2) return resolve(true)
        }
      }
      poll()
    })
  assert.equal(await fromA(b), true)
  assert.equal(await fromA(c), false)
  a.close()
  b.close()
  c.close()
  await relay.close()
})

test('forgets a member position after POSITION_TTL without snapshots', async () => {
  const relay = await startRelay({
    port: 0,
    host: '127.0.0.1',
    log: () => {},
    radius: 200,
    positionTtl: 150,
  })
  const at = (x) => ({ ...state, position: [x, 0, 0] })
  const join = async () => {
    const s = await connect(relay.port)
    s.json({ type: 'join', version: 1, room: 'ttl', meta: {} })
    await s.next('welcome')
    return s
  }
  const seen = (s) => {
    const seqs = new Set()
    s.on('message', (d) => {
      const m = JSON.parse(String(d))
      if (m.type === 'snapshot') seqs.add(m.seq)
    })
    return seqs
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const a = await join()
  const far = await join()
  const farGot = seen(far)
  far.json({ type: 'snapshot', t: 0, seq: 1, state: at(1000) })
  await wait(50)
  a.json({ type: 'snapshot', t: 1, seq: 2, state: at(0) })
  await wait(100)
  assert.equal(farGot.has(2), false) // fresh and 1 km away: filtered
  await wait(200) // `far` stops sending (e.g. on foot)
  a.json({ type: 'snapshot', t: 2, seq: 3, state: at(0) })
  await wait(100)
  assert.equal(farGot.has(3), true) // position forgotten: receives everything
  a.close()
  far.close()
  await relay.close()
})

test('forwards on-foot avatar snapshots (alone or with a state) and drops malformed ones', async () => {
  const relay = await startRelay({ port: 0, host: '127.0.0.1', log: () => {} })
  const a = await connect(relay.port)
  const b = await connect(relay.port)
  a.json({ type: 'join', version: 1, room: 'feet', meta: {} })
  const welcomeA = await a.next('welcome')
  b.json({ type: 'join', version: 1, room: 'feet', meta: {} })
  await b.next('welcome')
  const avatar = { p: [1, 0, -2], y: 0.5, s: 1.4, a: 1 }
  a.json({ type: 'snapshot', t: 1, seq: 0, avatar })
  const onFoot = await b.next('snapshot')
  assert.equal(onFoot.peer, welcomeA.peer)
  assert.deepEqual(onFoot.avatar, avatar)
  assert.equal(onFoot.state, undefined)
  a.json({ type: 'snapshot', t: 2, seq: 1, avatar: { ...avatar, a: 99 } })
  a.json({ type: 'snapshot', t: 3, seq: 2 })
  a.json({ type: 'snapshot', t: 4, seq: 3, state, avatar: { ...avatar, a: 9 } })
  const both = await b.next('snapshot')
  assert.equal(both.t, 4)
  assert.deepEqual(both.state.position, state.position)
  assert.equal(both.avatar.a, 9)
  // Optional held item: forwarded when valid, the snapshot dropped when out of range.
  a.json({ type: 'snapshot', t: 5, seq: 4, avatar: { ...avatar, w: 99 } })
  a.json({ type: 'snapshot', t: 6, seq: 5, avatar: { ...avatar, w: 2 } })
  const armed = await b.next('snapshot')
  assert.equal(armed.t, 6)
  assert.equal(armed.avatar.w, 2)
  // Character inventory and aim: forwarded when bounded, the snapshot dropped otherwise.
  a.json({ type: 'snapshot', t: 7, seq: 6, avatar: { ...avatar, i: [[0, 99, 1]] } })
  a.json({ type: 'snapshot', t: 8, seq: 7, avatar: { ...avatar, v: [0, 5] } })
  const kit = { i: [[1, 1, 1], [4, 5, -1]], h: [0, 1], v: [0.5, 0.3] }
  a.json({ type: 'snapshot', t: 9, seq: 8, avatar: { ...avatar, ...kit } })
  const carried = await b.next('snapshot')
  assert.equal(carried.t, 9)
  assert.deepEqual(carried.avatar.i, kit.i)
  assert.deepEqual(carried.avatar.h, kit.h)
  assert.deepEqual(carried.avatar.v, kit.v)
  // Fire events: forwarded when bounded, dropped otherwise; other kinds unchanged.
  a.json({ type: 'event', kind: 'fire', data: { w: 1, k: 0, o: [0, 1, 0], d: [0, 0, 7] } })
  const fire = { w: 1, k: 0, o: [1.5, 1.2, -3], d: [0, 0.6, -0.8], r: 40 }
  a.json({ type: 'event', kind: 'fire', data: fire })
  const fired = await b.next('event')
  assert.equal(fired.kind, 'fire')
  assert.deepEqual(fired.data, fire)
  a.close()
  b.close()
  await relay.close()
})
