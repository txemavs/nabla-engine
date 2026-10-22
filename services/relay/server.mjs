#!/usr/bin/env node
/**
 * Minimal WebSocket room relay for Nabla multiplayer (protocol: src/net/protocol.ts).
 * It keeps no game state: it assigns peer ids, announces joins and leaves, and forwards
 * snapshots to the other members of the same room with the sender's peer id stamped on them.
 *
 *   PORT=10003 node services/relay/server.mjs
 *
 * Each member gets a slot (0, 1, 2…; the lowest free one in its room) and the palette colour at
 * that slot, sent in `welcome` and `joined`; both are released when the member leaves.
 *
 * Env: PORT (default 10003), HOST (default 0.0.0.0), MAX_ROOM (default 8 peers),
 * MAX_FRAME (default 4096 bytes), MAX_RATE (default 60 frames/s per peer),
 * PALETTE (comma-separated #rrggbb, default eight distinct car colours),
 * MAX_EVENTS (default 15 game events/s per peer; extra events are dropped),
 * RADIUS (default 250 m; 0 = everyone): interest management. A snapshot is forwarded only to
 * members within RADIUS metres (horizontal x/z) of its sender's last position; members that
 * have not sent a position yet receive everything. Clients show/hide inside this (e.g. 200/220 m).
 * POSITION_TTL (default 3000 ms): a member's position is forgotten this long after its last
 * snapshot (e.g. it got out on foot and stopped sending), so it receives everything again.
 */
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { HealthLedger } from './combat.mjs'

export const PROTOCOL_VERSION = 1
const ROOM = /^[A-Za-z0-9_-]{1,64}$/
const COLOR = /^#[0-9a-fA-F]{6}$/
export const DEFAULT_PALETTE = [
  '#c0392b', // red
  '#2471a3', // blue
  '#f1c40f', // yellow
  '#27ae60', // green
  '#ecf0f1', // white
  '#8e44ad', // purple
  '#e67e22', // orange
  '#1c2833', // black
]

function validExtra(extra) {
  if (extra === undefined) return true
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return false
  const entries = Object.entries(extra)
  return (
    entries.length <= 16 &&
    entries.every(
      ([key, value]) =>
        key.length <= 32 &&
        (typeof value === 'boolean' ||
          Number.isFinite(value) ||
          (typeof value === 'string' && value.length <= 64)),
    )
  )
}

const finiteArray = (value, length) =>
  Array.isArray(value) && value.length === length && value.every(Number.isFinite)

/** Optional per-wheel look: three arrays of at most 16 finite numbers. */
function validWheels(w) {
  if (w === undefined) return true
  if (!w || typeof w !== 'object') return false
  return ['steer', 'suspension', 'spinRate'].every(
    (k) => Array.isArray(w[k]) && w[k].length <= 16 && w[k].every(Number.isFinite),
  )
}

function validState(s) {
  return (
    !!s &&
    finiteArray(s.position, 3) &&
    finiteArray(s.rotation, 4) &&
    finiteArray(s.velocity, 3) &&
    finiteArray(s.angularVelocity, 3) &&
    validWheels(s.wheels)
  )
}

/**
 * Optional on-foot body block: p (feet, 3 numbers), y (yaw), s (speed >= 0), a (0..63) and the
 * optional held-item index w (0..63, absent from older clients).
 */
function validAvatar(a) {
  return (
    !!a &&
    typeof a === 'object' &&
    finiteArray(a.p, 3) &&
    Number.isFinite(a.y) &&
    Number.isFinite(a.s) &&
    a.s >= 0 &&
    Number.isInteger(a.a) &&
    a.a >= 0 &&
    a.a <= 63 &&
    (a.w === undefined || (Number.isInteger(a.w) && a.w >= 0 && a.w <= 63)) &&
    (a.i === undefined || validStacks(a.i)) &&
    (a.h === undefined || (Array.isArray(a.h) && a.h.length === 2 && a.h.every((n) => intIn(n, 0, 63)))) &&
    (a.v === undefined ||
      (finiteArray(a.v, 2) && Math.abs(a.v[0]) <= 3.2 && Math.abs(a.v[1]) <= 1.6)) &&
    (a.g === undefined ||
      (finiteArray(a.g, 7) &&
        a.g.slice(0, 3).every((v) => Math.abs(v) <= 3) &&
        a.g.slice(3).every((v) => Math.abs(v) <= 1.001)))
  )
}

const intIn = (n, min, max) => Number.isInteger(n) && n >= min && n <= max
const numIn = (n, min, max) => Number.isFinite(n) && n >= min && n <= max

/** Fire event (weapon presentation, no authority): slot, kind, origin, unit direction, range/speed. */
function validFire(f) {
  return (
    intIn(f.w, 0, 63) &&
    intIn(f.k, 0, 15) &&
    finiteArray(f.o, 3) &&
    f.o.every((v) => numIn(v, -1e6, 1e6)) &&
    finiteArray(f.d, 3) &&
    f.d.every((v) => numIn(v, -1.001, 1.001)) &&
    (f.r === undefined || numIn(f.r, 0, 5000)) &&
    (f.s === undefined || numIn(f.s, 0, 500))
  )
}

/** Character inventory stacks: at most 32 of [slot 0..63, item 1..63, count -1..9999]. */
function validStacks(list) {
  return (
    Array.isArray(list) &&
    list.length <= 32 &&
    list.every(
      (s) =>
        Array.isArray(s) &&
        s.length === 3 &&
        intIn(s[0], 0, 63) &&
        intIn(s[1], 1, 63) &&
        intIn(s[2], -1, 9999),
    )
  )
}

/** A snapshot carries a vehicle state, an on-foot avatar block, or both. */
function validSnapshot(message) {
  const hasState = message.state !== undefined
  const hasAvatar = message.avatar !== undefined
  return (
    Number.isFinite(message.t) &&
    Number.isInteger(message.seq) &&
    message.seq >= 0 &&
    (hasState || hasAvatar) &&
    (!hasState || validState(message.state)) &&
    (!hasAvatar || validAvatar(message.avatar)) &&
    validExtra(message.extra)
  )
}

const vec3 = (v, max) => finiteArray(v, 3) && v.every((n) => Math.abs(n) <= max)
const ZONE = /^[a-z]{1,16}$/
/** Character hit (combat, see docs/combat.md): target peer and damage; the rest optional. */
function validHit(h) {
  return (
    typeof h.t === 'string' &&
    h.t.length >= 1 &&
    h.t.length <= 64 &&
    numIn(h.d, 0, 400) &&
    (h.z === undefined || (typeof h.z === 'string' && ZONE.test(h.z))) &&
    (h.w === undefined || typeof h.w === 'string') &&
    (h.o === undefined || vec3(h.o, 1e6)) &&
    (h.r === undefined || vec3(h.r, 1.001)) &&
    (h.p === undefined || vec3(h.p, 1e6))
  )
}
/** `peer` of the events the relay sends itself (health, death, respawn). */
export const RELAY_PEER = 'relay'

const KIND = /^[A-Za-z0-9_.-]{1,32}$/
function validEventData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const entries = Object.entries(data)
  return (
    entries.length <= 16 &&
    entries.every(
      ([key, value]) =>
        key.length <= 32 &&
        (typeof value === 'boolean' ||
          Number.isFinite(value) ||
          (typeof value === 'string' && value.length <= 64) ||
          (Array.isArray(value) && value.length <= 4 && value.every(Number.isFinite))),
    )
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
  maxRoom = Number(process.env.MAX_ROOM ?? 64),
  maxFrame = Number(process.env.MAX_FRAME ?? 4096),
  maxRate = Number(process.env.MAX_RATE ?? 60),
  maxEvents = Number(process.env.MAX_EVENTS ?? 15),
  radius = Number(process.env.RADIUS ?? 250),
  positionTtl = Number(process.env.POSITION_TTL ?? 3000),
  palette = (process.env.PALETTE ?? '').split(',').filter((c) => COLOR.test(c.trim())).length
    ? process.env.PALETTE.split(',')
        .map((c) => c.trim())
        .filter((c) => COLOR.test(c))
    : DEFAULT_PALETTE,
  log = (...args) => console.log(new Date().toISOString(), ...args),
  respawnDelay = Number(process.env.RESPAWN_DELAY ?? 5),
  respawnTick = Number(process.env.RESPAWN_TICK_MS ?? 250),
} = {}) {
  /** room id -> Map<socket, { peer, meta }> */
  const rooms = new Map()
  /** room id -> HealthLedger: the relay is the authority on character health. */
  const ledgers = new Map()
  const ledgerOf = (room) => {
    let ledger = ledgers.get(room)
    if (!ledger) ledgers.set(room, (ledger = new HealthLedger(undefined, respawnDelay)))
    return ledger
  }
  const seconds = () => performance.now() / 1000
  const toRoom = (room, message) => {
    for (const socket of rooms.get(room)?.keys() ?? []) send(socket, message)
  }
  const relayEvent = (room, kind, data) =>
    toRoom(room, { type: 'event', peer: RELAY_PEER, kind, data })
  const respawns = setInterval(() => {
    const now = seconds()
    for (const [room, ledger] of ledgers)
      for (const id of ledger.due(now)) {
        ledger.respawn(id)
        relayEvent(room, 'respawn', { t: id })
        log('respawn', room, id)
      }
  }, respawnTick)
  respawns.unref?.()
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
  /** Interest: forward to members near the sender's position (or not located yet). */
  const near = (a, b) => !(radius > 0) || !a || !b || Math.hypot(a[0] - b[0], a[2] - b[2]) <= radius
  const forward = (room, from, position, message) => {
    const now = Date.now()
    for (const [socket, member] of rooms.get(room) ?? []) {
      // A receiver that stopped sending snapshots no longer has a reliable position.
      const fresh = member.position && now - member.positionAt <= positionTtl
      if (socket !== from && near(position, fresh ? member.position : null)) send(socket, message)
    }
  }
  const leave = (socket) => {
    const { room } = socket.nabla
    if (!room) return
    const members = rooms.get(room)
    const member = members?.get(socket)
    socket.nabla.room = null
    if (!members || !member) return
    members.delete(socket)
    ledgers.get(room)?.remove(member.peer)
    if (!members.size) {
      rooms.delete(room)
      ledgers.delete(room)
    }
    broadcast(room, socket, { type: 'left', peer: member.peer })
    log('leave', room, member.peer, `${members.size} left`)
  }

  wss.on('connection', (socket) => {
    socket.nabla = { room: null, windowStart: Date.now(), frames: 0, events: 0 }
    socket.on('message', (data, binary) => {
      const state = socket.nabla
      const now = Date.now()
      if (now - state.windowStart >= 1000) {
        state.windowStart = now
        state.frames = 0
        state.events = 0
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
        const peers = [...members.values()].map(({ peer, meta, slot, color }) => ({
          peer,
          meta,
          slot,
          color,
        }))
        const used = new Set(peers.map((m) => m.slot))
        let slot = 0
        while (used.has(slot)) slot++
        const color = palette[slot % palette.length]
        members.set(socket, { peer, meta, slot, color })
        rooms.set(message.room, members)
        state.room = message.room
        // Health of everyone already here (the newcomer starts full).
        const ledger = ledgers.get(message.room)
        const health = Object.fromEntries(
          peers.filter((m) => ledger?.has(m.peer)).map((m) => [m.peer, ledger.get(m.peer).health]),
        )
        send(socket, {
          type: 'welcome',
          peer,
          room: message.room,
          peers,
          slot,
          color,
          ...(Object.keys(health).length ? { health } : {}),
        })
        broadcast(message.room, socket, { type: 'joined', peer, meta, slot, color })
        log('join', message.room, peer, `${members.size} in room`)
      } else if (message.type === 'snapshot') {
        const member = state.room && rooms.get(state.room)?.get(socket)
        if (!member || !validSnapshot(message)) return
        member.position = message.state ? message.state.position : message.avatar.p
        member.positionAt = Date.now()
        forward(state.room, socket, member.position, {
          type: 'snapshot',
          peer: member.peer,
          t: message.t,
          seq: message.seq,
          ...(message.state ? { state: message.state } : {}),
          ...(message.avatar
            ? {
                avatar: {
                  p: message.avatar.p,
                  y: message.avatar.y,
                  s: message.avatar.s,
                  a: message.avatar.a,
                  ...(message.avatar.w !== undefined ? { w: message.avatar.w } : {}),
                  ...(message.avatar.i !== undefined ? { i: message.avatar.i } : {}),
                  ...(message.avatar.h !== undefined ? { h: message.avatar.h } : {}),
                  ...(message.avatar.v !== undefined ? { v: message.avatar.v } : {}),
                  ...(message.avatar.g !== undefined ? { g: message.avatar.g } : {}),
                },
              }
            : {}),
          ...(message.extra ? { extra: message.extra } : {}),
        })
      } else if (message.type === 'event') {
        const member = state.room && rooms.get(state.room)?.get(socket)
        if (!member || typeof message.kind !== 'string' || !KIND.test(message.kind)) return
        if (!validEventData(message.data) || ++state.events > maxEvents) return
        if (message.kind === 'fire' && !validFire(message.data)) return
        if (message.kind === 'hit') {
          // The shooter reports; the relay applies the damage and tells everyone (never the raw hit).
          const hit = message.data
          if (!validHit(hit) || hit.t === member.peer) return
          const present = [...rooms.get(state.room).values()].some((m) => m.peer === hit.t)
          const ledger = ledgerOf(state.room)
          if (!present || ledger.get(hit.t).dead) return
          const result = ledger.damage(hit.t, hit.d, seconds())
          relayEvent(state.room, 'health', {
            t: hit.t,
            h: result.health,
            s: member.peer,
            ...(hit.z ? { z: hit.z } : {}),
            ...(hit.r ? { r: hit.r } : {}),
          })
          if (result.died) {
            relayEvent(state.room, 'death', { t: hit.t, s: member.peer, ...(hit.r ? { r: hit.r } : {}) })
            log('death', state.room, hit.t, 'by', member.peer)
          }
          return
        }
        if (['health', 'death', 'respawn'].includes(message.kind)) return
        broadcast(state.room, socket, {
          type: 'event',
          peer: member.peer,
          kind: message.kind,
          data: message.data,
        })
      } else if (message.type === 'profile') {
        const member = state.room && rooms.get(state.room)?.get(socket)
        if (!member) return
        member.meta = cleanMeta(message.meta)
        broadcast(state.room, socket, { type: 'profile', peer: member.peer, meta: member.meta })
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
            clearInterval(respawns)
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
