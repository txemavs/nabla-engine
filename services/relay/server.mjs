#!/usr/bin/env node
/**
 * Minimal WebSocket room relay for Nabla multiplayer (protocol: src/net/protocol.ts).
 * It keeps no game state: it assigns peer ids, announces joins and leaves, and forwards
 * snapshots to the other members of the same room with the sender's peer id stamped on them.
 *
 *   PORT=10003 node services/relay/server.mjs
 *
 * Env: PORT (default 10003), HOST (default 0.0.0.0), MAX_ROOM (default 8 peers),
 * MAX_FRAME (default 4096 bytes), MAX_RATE (default 60 frames/s per peer).
 */
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

export const PROTOCOL_VERSION = 1
const ROOM = /^[A-Za-z0-9_-]{1,64}$/

const finiteArray = (value, length) =>
  Array.isArray(value) && value.length === length && value.every(Number.isFinite)

function validSnapshot(message) {
  const s = message.state
  return (
    Number.isFinite(message.t) &&
    Number.isInteger(message.seq) &&
    message.seq >= 0 &&
    s &&
    finiteArray(s.position, 3) &&
    finiteArray(s.rotation, 4) &&
    finiteArray(s.velocity, 3) &&
    finiteArray(s.angularVelocity, 3)
  )
}

function cleanMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {}
  const out = {}
  for (const [key, value] of Object.entries(meta).slice(0, 16)) {
    if (typeof value === 'string') out[key.slice(0, 64)] = value.slice(0, 128)
    else if (typeof value === 'boolean' || Number.isFinite(value)) out[key.slice(0, 64)] = value
  }
  return out
}

/** Start a relay; resolves once listening. Returns { port, close }. */
export function startRelay({
  port = Number(process.env.PORT ?? 10003),
  host = process.env.HOST ?? '0.0.0.0',
  maxRoom = Number(process.env.MAX_ROOM ?? 8),
  maxFrame = Number(process.env.MAX_FRAME ?? 4096),
  maxRate = Number(process.env.MAX_RATE ?? 60),
  log = (...args) => console.log(new Date().toISOString(), ...args),
} = {}) {
  /** room id -> Map<socket, { peer, meta }> */
  const rooms = new Map()
  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }))
      return
    }
    res.writeHead(404).end()
  })
  const wss = new WebSocketServer({ server: http, maxPayload: maxFrame })
  const send = (socket, message) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
  }
  const broadcast = (room, from, message) => {
    for (const socket of rooms.get(room)?.keys() ?? []) if (socket !== from) send(socket, message)
  }
  const leave = (socket) => {
    const { room } = socket.nabla
    if (!room) return
    const members = rooms.get(room)
    const member = members?.get(socket)
    socket.nabla.room = null
    if (!members || !member) return
    members.delete(socket)
    if (!members.size) rooms.delete(room)
    broadcast(room, socket, { type: 'left', peer: member.peer })
    log('leave', room, member.peer, `${members.size} left`)
  }

  wss.on('connection', (socket) => {
    socket.nabla = { room: null, windowStart: Date.now(), frames: 0 }
    socket.on('message', (data, binary) => {
      const state = socket.nabla
      const now = Date.now()
      if (now - state.windowStart >= 1000) {
        state.windowStart = now
        state.frames = 0
      }
      if (++state.frames > maxRate || binary) return
      let message
      try {
        message = JSON.parse(String(data))
      } catch {
        return
      }
      if (!message || typeof message !== 'object') return
      if (message.type === 'join') {
        if (message.version !== PROTOCOL_VERSION)
          return send(socket, { type: 'error', message: 'Unsupported protocol version' })
        if (typeof message.room !== 'string' || !ROOM.test(message.room))
          return send(socket, { type: 'error', message: 'Invalid room' })
        leave(socket)
        const members = rooms.get(message.room) ?? new Map()
        if (members.size >= maxRoom) return send(socket, { type: 'error', message: 'Room is full' })
        const peer = randomUUID().slice(0, 8)
        const meta = cleanMeta(message.meta)
        const peers = [...members.values()]
        members.set(socket, { peer, meta })
        rooms.set(message.room, members)
        state.room = message.room
        send(socket, { type: 'welcome', peer, room: message.room, peers })
        broadcast(message.room, socket, { type: 'joined', peer, meta })
        log('join', message.room, peer, `${members.size} in room`)
      } else if (message.type === 'snapshot') {
        const member = state.room && rooms.get(state.room)?.get(socket)
        if (!member || !validSnapshot(message)) return
        broadcast(state.room, socket, {
          type: 'snapshot',
          peer: member.peer,
          t: message.t,
          seq: message.seq,
          state: message.state,
        })
      } else if (message.type === 'leave') leave(socket)
    })
    socket.on('close', () => leave(socket))
    socket.on('error', () => leave(socket))
  })

  return new Promise((resolve) => {
    http.listen(port, host, () => {
      const actual = http.address().port
      log(`nabla relay listening on ${host}:${actual}`)
      resolve({
        port: actual,
        close: () =>
          new Promise((done) => {
            for (const client of wss.clients) client.terminate()
            wss.close(() => http.close(() => done()))
          }),
      })
    })
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const relay = await startRelay()
  const stop = () => relay.close().then(() => process.exit(0))
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
