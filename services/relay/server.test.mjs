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
  // Held item pose: forwarded when bounded, the snapshot dropped otherwise.
  a.json({ type: 'snapshot', t: 10, seq: 9, avatar: { ...avatar, g: [9, 0, 0, 0, 0, 0, 1] } })
  const g = [0.2, 1.3, -0.45, 0.1, 0, 0, 0.995]
  a.json({ type: 'snapshot', t: 11, seq: 10, avatar: { ...avatar, g } })
  const posed = await b.next('snapshot')
  assert.equal(posed.t, 11)
  assert.deepEqual(posed.avatar.g, g)
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

test('combat: relay applies hits, broadcasts health/death/respawn, health in the join snapshot', async () => {
  const relay = await startRelay({ port: 0, host: '127.0.0.1', log: () => {}, respawnDelay: 0.4, respawnTick: 50 })
  const a = await connect(relay.port)
  const b = await connect(relay.port)
  a.json({ type: 'join', version: 1, room: 'c', meta: {} })
  const pa = (await a.next('welcome')).peer
  b.json({ type: 'join', version: 1, room: 'c', meta: {} })
  const pb = (await b.next('welcome')).peer
  const hit = (data) => a.json({ type: 'event', kind: 'hit', data })
  // Malformed, self or unknown targets: dropped; a hit never reaches anyone as such.
  hit({ t: pb, d: 9999 })
  hit({ t: pb, d: 10, r: [0, 0, 5] })
  hit({ t: pa, d: 10 })
  hit({ t: 'nobody', d: 10 })
  hit({ t: pb, d: 25, z: 'torso', w: 'hk-compact', o: [0, 1, 0], r: [0, 0, -1], p: [0, 1.2, -3] })
  for (const s of [a, b]) {
    const h = await s.next('event')
    assert.equal(h.peer, 'relay')
    assert.equal(h.kind, 'health')
    assert.deepEqual(h.data, { t: pb, h: 75, s: pa, z: 'torso', r: [0, 0, -1] })
  }
  // A late joiner gets the health.
  const c = await connect(relay.port)
  c.json({ type: 'join', version: 1, room: 'c', meta: {} })
  assert.deepEqual((await c.next('welcome')).health, { [pb]: 75 })
  // Head shot to 0: health then death; further hits ignored while dead; respawn after the delay.
  hit({ t: pb, d: 100, z: 'head' })
  assert.equal((await b.next('event')).data.h, 0)
  const death = await b.next('event')
  assert.equal(death.kind, 'death')
  assert.equal(death.data.t, pb)
  hit({ t: pb, d: 25 })
  const respawn = await b.next('event')
  assert.equal(respawn.kind, 'respawn')
  assert.deepEqual(respawn.data, { t: pb })
  // Clients cannot forge relay events.
  a.json({ type: 'event', kind: 'health', data: { t: pb, h: 1 } })
  const d = await connect(relay.port)
  d.json({ type: 'join', version: 1, room: 'c', meta: {} })
  assert.deepEqual((await d.next('welcome')).health, { [pb]: 100 })
  const quiet = await Promise.race([b.next('event'), new Promise((r) => setTimeout(() => r(null), 150))])
  assert.equal(quiet, null)
  for (const s of [a, b, c, d]) s.close()
  await relay.close()
})

test('shared entities: spawn, join list, claim by another peer, driver snapshots, release on leave, despawn race', async () => {
  const relay = await startRelay({ port: 0, host: '127.0.0.1', log: () => {} })
  const a = await connect(relay.port)
  const b = await connect(relay.port)
  a.json({ type: 'join', version: 1, room: 'e', meta: {} })
  const pa = (await a.next('welcome')).peer
  b.json({ type: 'join', version: 1, room: 'e', meta: {} })
  const pb = (await b.next('welcome')).peer
  const ev = (s, kind, data) => s.json({ type: 'event', kind, data })
  // Malformed spawns are dropped.
  ev(a, 'entity.spawn', { i: 'bad id!', y: 'truck', p: [0, 0, 0], q: [0, 0, 0, 1] })
  ev(a, 'entity.spawn', { i: `${pa}.1`, y: 'truck', p: [0, 0, 0], q: [0, 0, 0, 1], x: [1, 2] })
  const truck = `${pa}.1`
  ev(a, 'entity.spawn', { i: truck, y: 'truck', p: [1, 0, 2], q: [0, 0, 0, 1], d: 1, _color: '#ff0000' })
  for (const s of [a, b]) {
    const e = await s.next('event')
    assert.equal(e.peer, 'relay')
    assert.equal(e.kind, 'entity')
    assert.deepEqual(e.data, { i: truck, y: 'truck', p: [1, 0, 2], q: [0, 0, 0, 1], o: pa, d: pa, _color: '#ff0000' })
  }
  // A re-spawn of the same id is a claim attempt, never a second entity: denied while A drives.
  ev(b, 'entity.spawn', { i: truck, y: 'truck', p: [9, 0, 9], q: [0, 0, 0, 1], d: 1 })
  assert.equal((await b.next('event')).data.d, pa)
  ev(b, 'entity.claim', { i: truck })
  assert.equal((await b.next('event')).data.d, pa)
  // Only the driver's snapshots move it; others' tagged states are dropped.
  b.json({ type: 'snapshot', t: 1, seq: 0, state, e: truck })
  a.json({ type: 'snapshot', t: 1, seq: 0, state: { ...state, position: [5, 0, 5] }, e: truck })
  const snap = await b.next('snapshot')
  assert.equal(snap.e, truck)
  assert.deepEqual(snap.state.position, [5, 0, 5])
  // A releases (exit): rests where it was left; B claims it and now drives.
  ev(a, 'entity.release', { i: truck, p: [6, 0, 6], q: [0, 0, 0, 1] })
  assert.equal((await b.next('event')).data.d, undefined)
  ev(b, 'entity.claim', { i: truck })
  assert.equal((await b.next('event')).data.d, pb)
  b.json({ type: 'snapshot', t: 2, seq: 1, state: { ...state, position: [20, 0, 1] }, e: truck })
  assert.deepEqual((await a.next('snapshot')).state.position, [20, 0, 1])
  // Late joiner: the list with the last pose and driver.
  const c = await connect(relay.port)
  c.json({ type: 'join', version: 1, room: 'e', meta: {} })
  const welcomeC = await c.next('welcome')
  const [listed] = welcomeC.entities
  assert.equal(listed.i, truck)
  assert.equal(listed.d, pb)
  assert.deepEqual(listed.p, [20, 0, 1])
  // B disconnects: released, stays where it is.
  b.close()
  let freed
  do freed = await a.next('event')
  while (freed.kind !== 'entity' || freed.data.d !== undefined || freed.data.p[0] !== 20)
  assert.deepEqual(freed.data.p, [20, 0, 1])
  // Ground item: two pick-ups race, the first wins; clients cannot forge relay entity events.
  ev(a, 'entity.spawn', { i: `${pa}.2`, y: 'item', p: [0, 0, 0], q: [0, 0, 0, 1], _item: 'pistol' })
  await c.next('event')
  ev(c, 'entity.despawn', { i: `${pa}.2` })
  ev(a, 'entity.despawn', { i: `${pa}.2` })
  ev(a, 'entity.gone', { i: truck })
  let gone
  do gone = await c.next('event')
  while (gone.kind !== 'entity.gone')
  assert.ok([welcomeC.peer, pa].includes(gone.data.b))
  assert.equal(gone.data.i, `${pa}.2`)
  // A world item (same id on every client): placed once; once taken it is not placed again.
  ev(c, 'entity.spawn', { i: 'w.pistol.0.0', y: 'item', p: [0, 0, 0], q: [0, 0, 0, 1] })
  const until = async (s, ok) => {
    let m
    do m = await s.next('event')
    while (!ok(m))
    return m
  }
  await until(a, (m) => m.data.i === 'w.pistol.0.0')
  ev(a, 'entity.spawn', { i: 'w.pistol.0.0', y: 'item', p: [1, 0, 0], q: [0, 0, 0, 1] })
  assert.deepEqual((await until(a, (m) => m.data.i === 'w.pistol.0.0')).data.p, [0, 0, 0])
  ev(c, 'entity.despawn', { i: 'w.pistol.0.0' })
  ev(a, 'entity.spawn', { i: 'w.pistol.0.0', y: 'item', p: [1, 0, 0], q: [0, 0, 0, 1] })
  do gone = await c.next('event')
  while (gone.kind !== 'entity.gone' || gone.data.i !== 'w.pistol.0.0')
  const quiet = await Promise.race([c.next('event'), new Promise((r) => setTimeout(() => r(null), 150))])
  assert.equal(quiet, null)
  for (const s of [a, c]) s.close()
  await relay.close()
})
