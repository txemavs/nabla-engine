import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { RelayConnection } from './connection.mjs'

function fixture() {
  const socket = new EventEmitter()
  Object.assign(socket, { OPEN: 1, readyState: 1, bufferedAmount: 0, sent: [], pings: 0 })
  socket.send = (payload, callback) => {
    socket.sent.push(JSON.parse(payload))
    callback()
  }
  socket.ping = (_, __, callback) => {
    socket.pings++
    callback()
  }
  socket.terminate = () => {
    socket.readyState = 3
  }
  let now = 0
  const reasons = []
  const connection = new RelayConnection(socket, {
    softLimit: 256,
    hardLimit: 1024,
    slowTimeout: 100,
    now: () => now,
    onDisconnect: (reason) => reasons.push(reason),
  })
  return {
    socket,
    connection,
    reasons,
    time: (value) => {
      now = value
    },
  }
}

test('pongs keep idle connections alive; a missed pong terminates once', () => {
  const { socket, connection, reasons } = fixture()
  for (let i = 0; i < 3; i++) {
    connection.heartbeat()
    socket.emit('pong')
  }
  assert.equal(socket.pings, 3)
  assert.deepEqual(reasons, [])
  connection.heartbeat()
  connection.heartbeat()
  connection.heartbeat()
  assert.deepEqual(reasons, ['heartbeat timeout'])
  assert.equal(socket.readyState, 3)
})

test('drops congested snapshots, preserves events, then resumes with current state only', () => {
  const { socket, connection, reasons } = fixture()
  socket.bufferedAmount = 256
  for (let seq = 0; seq < 100; seq++)
    assert.equal(connection.send({ type: 'snapshot', seq }), false)
  assert.equal(connection.send({ type: 'event', kind: 'health', data: { h: 80 } }), true)
  assert.equal(connection.send({ type: 'left', peer: 'a' }), true)
  socket.bufferedAmount = 0
  assert.equal(connection.send({ type: 'snapshot', seq: 100 }), true)
  assert.deepEqual(
    socket.sent.map((m) => m.type),
    ['event', 'left', 'snapshot'],
  )
  assert.equal(socket.sent[2].seq, 100)
  assert.deepEqual(reasons, [])
})

test('checks projected UTF-8 bytes including frame overhead before enqueueing', () => {
  const { socket, connection, reasons } = fixture()
  const message = { type: 'event', text: '🌍'.repeat(40) }
  const bytes = Buffer.byteLength(JSON.stringify(message)) + 10
  socket.bufferedAmount = 1024 - bytes
  assert.equal(connection.send(message), true)
  socket.bufferedAmount++
  assert.equal(connection.send(message), false)
  assert.equal(socket.sent.length, 1)
  assert.deepEqual(reasons, ['outbound queue limit'])
})

test('soft limit considers the next snapshot, not just the current buffer', () => {
  const { socket, connection } = fixture()
  socket.bufferedAmount = 250
  assert.equal(connection.send({ type: 'snapshot', seq: 0 }), false)
  assert.equal(socket.sent.length, 0)
})

test('sustained congestion expires without more sends; draining resets the deadline', () => {
  const { socket, connection, time, reasons } = fixture()
  socket.bufferedAmount = 256
  assert.equal(connection.check(), true)
  time(90)
  socket.bufferedAmount = 0
  connection.check()
  time(100)
  socket.bufferedAmount = 256
  connection.check()
  time(199)
  assert.equal(connection.check(), true)
  time(200)
  assert.equal(connection.check(), false)
  assert.deepEqual(reasons, ['outbound queue timeout'])
})

test('hard cap disconnects even without further application messages', () => {
  const { socket, connection, reasons } = fixture()
  socket.bufferedAmount = 1024
  connection.check()
  assert.deepEqual(reasons, ['outbound queue limit'])
})

test('congestion on one recipient does not affect another', () => {
  const slow = fixture()
  const fast = fixture()
  slow.socket.bufferedAmount = 256
  const snapshot = { type: 'snapshot', seq: 7 }
  slow.connection.send(snapshot)
  fast.connection.send(snapshot)
  assert.deepEqual(slow.socket.sent, [])
  assert.deepEqual(fast.socket.sent, [snapshot])
})

test('send and ping errors terminate without throwing into room processing', () => {
  for (const method of ['send', 'ping']) {
    for (const asynchronous of [false, true]) {
      const { socket, connection, reasons } = fixture()
      socket[method] = (...args) => {
        const error = new Error('broken pipe')
        if (asynchronous) args.at(-1)(error)
        else throw error
      }
      if (method === 'send') connection.send({ type: 'event' })
      else connection.heartbeat()
      assert.deepEqual(reasons, [`${method} failed`])
    }
  }
})
