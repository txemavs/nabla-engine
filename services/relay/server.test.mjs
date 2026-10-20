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
  assert.equal((await a.next('joined')).peer, welcomeB.peer)
  c.json({ type: 'join', version: 1, room: 'other', meta: {} })
  await c.next('welcome')

  a.json({ type: 'snapshot', t: 10, seq: 0, state, peer: 'spoofed' })
  const got = await b.next('snapshot')
  assert.equal(got.peer, welcomeA.peer)
  assert.deepEqual(got.state.position, [1, 2, 3])

  b.json({ type: 'join', version: 1, room: '../bad', meta: {} })
  assert.equal((await b.next('error')).message, 'Invalid room')

  a.close()
  assert.equal((await b.next('left')).peer, welcomeA.peer)
  b.close()
  c.close()
  await relay.close()
})
