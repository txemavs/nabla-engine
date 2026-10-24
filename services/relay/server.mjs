#!/usr/bin/env node
/**
 * Minimal WebSocket room relay for Nabla multiplayer (protocol: src/net/protocol.ts).
 * It assigns peer ids, forwards nearby snapshots, and owns room membership, health,
 * respawns and shared-entity claims in memory. Movement physics remain client-owned.
 *
 *   PORT=10003 node services/relay/server.mjs
 *
 * Each member gets a slot (0, 1, 2…; the lowest free one in its room) and the palette colour at
 * that slot, sent in `welcome` and `joined`; both are released when the member leaves.
 *
 * Env: PORT (default 10003), HOST (default 0.0.0.0), MAX_ROOM (default 64 peers),
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
import { RelayConnection } from './connection.mjs'
import { ContinuousWorlds } from './continuous-world.mjs'

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
    (a.h === undefined ||
      (Array.isArray(a.h) && a.h.length === 2 && a.h.every((n) => intIn(n, 0, 63)))) &&
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

/** Reload request: `{ w }` the weapon slot, nothing else. */
function validReload(r) {
  return r !== null && typeof r === 'object' && Object.keys(r).length === 1 && intIn(r.w, 0, 63)
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
const ENTITY_ID = /^[A-Za-z0-9_.:-]{1,64}$/
/**
 * Shared entity request data (src/net/shared-entities.ts): `i` id, `y` type, `p` position,
 * `q` rotation, optional `d` (spawn driving) and at most 8 `_param` keys.
 */
function validEntitySpawn(e) {
  const params = Object.keys(e).filter((k) => k.startsWith('_'))
  return (
    typeof e.i === 'string' &&
    ENTITY_ID.test(e.i) &&
    typeof e.y === 'string' &&
    e.y.length >= 1 &&
    e.y.length <= 64 &&
    vec3(e.p, 1e6) &&
    finiteArray(e.q, 4) &&
    e.q.every((n) => Math.abs(n) <= 1.001) &&
    params.length <= 8 &&
    params.every((k) => !Array.isArray(e[k])) &&
    Object.keys(e).every((k) => k.startsWith('_') || ['i', 'y', 'p', 'q', 'd'].includes(k))
  )
}
/** Entity record as event data (what `welcome` lists and `entity` events carry). */
function entityData(e) {
  return {
    i: e.id,
    y: e.type,
    p: e.p,
    q: e.q,
    o: e.owner,
    ...(e.driver ? { d: e.driver } : {}),
    ...e.params,
  }
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

/** Player actor (`kind:color`, src/runtime/actor.ts): Polibot has one look, so its colour is white. */
const ACTOR = /^(default|polibot):(white|black|red|blue|green|orange)$/
function cleanActor(value) {
  const m = typeof value === 'string' && value.length <= 32 ? ACTOR.exec(value) : null
  if (!m) return undefined
  return m[1] === 'polibot' ? 'polibot:white' : value
}

function cleanMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {}
  const out = {}
  for (const [key, value] of Object.entries(meta).slice(0, 16)) {
    if (key === 'actor') {
      const actor = cleanActor(value)
      if (actor) out.actor = actor
      continue
    }
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
  reloadInterval = Number(process.env.RELOAD_INTERVAL ?? 0.5),
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
  maxEntities = Number(process.env.MAX_ENTITIES ?? 64),
  maxOwnEntities = Number(process.env.MAX_OWN_ENTITIES ?? 16),
  heartbeatIntervalMs = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 30_000),
  outboundSoftLimit = Number(process.env.OUTBOUND_SOFT_LIMIT ?? 65_536),
  outboundHardLimit = Number(process.env.OUTBOUND_HARD_LIMIT ?? 262_144),
  slowClientTimeoutMs = Number(process.env.SLOW_CLIENT_TIMEOUT_MS ?? 10_000),
  worldRadius = Number(process.env.WORLD_RADIUS ?? 250),
  worldMaxPeers = Number(process.env.WORLD_MAX_PEERS ?? 64),
  worldMaxPlayers = Number(process.env.WORLD_MAX_PLAYERS ?? 4096),
  worldMaxSessions = Number(process.env.WORLD_MAX_SESSIONS ?? 8192),
  worldSessionTtlMs = Number(process.env.WORLD_SESSION_TTL_MS ?? 120_000),
  worldTickMs = Number(process.env.WORLD_TICK_MS ?? 200),
} = {}) {
  for (const [name, value] of Object.entries({
    heartbeatIntervalMs,
    outboundSoftLimit,
    outboundHardLimit,
    slowClientTimeoutMs,
    worldRadius,
    worldMaxPeers,
    worldMaxPlayers,
    worldMaxSessions,
    worldSessionTtlMs,
    worldTickMs,
  })) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)
      throw new Error(`${name} must be a positive integer <= 2147483647`)
  }
  if (outboundSoftLimit >= outboundHardLimit)
    throw new Error('outboundSoftLimit must be smaller than outboundHardLimit')
  if (worldMaxPeers > 64) throw new Error('worldMaxPeers cannot exceed 64')
  /** room id -> Map<entity id, { id, type, params, p, q, owner, driver }>: shared entities. */
  const entities = new Map()
  /** room id -> ids of removed world entities (`w.` ids): they do not come back while the room lives. */
  const removedWorld = new Map()
  const entitiesOf = (room) => {
    let map = entities.get(room)
    if (!map) entities.set(room, (map = new Map()))
    return map
  }
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
      res.end(
        JSON.stringify({
          ok: true,
          rooms: rooms.size,
          worlds: continuous.worlds.size,
          players: continuous.sockets.size,
        }),
      )
      return
    }
    res.writeHead(404).end()
  })
  const wss = new WebSocketServer({ server: http, maxPayload: maxFrame })
  const connections = new Map()
  const heartbeat = setInterval(() => {
    for (const connection of connections.values()) connection.heartbeat()
  }, heartbeatIntervalMs)
  const queueCheck = setInterval(
    () => {
      for (const connection of connections.values()) connection.check()
    },
    Math.min(1000, slowClientTimeoutMs),
  )
  heartbeat.unref?.()
  queueCheck.unref?.()
  const send = (socket, message) => {
    return connections.get(socket)?.send(message)
  }
  const continuous = new ContinuousWorlds({
    send,
    validate: { cleanMeta, validSnapshot, validEventData, validReload, validFire, maxEvents },
    palette,
    radius: worldRadius,
    maxPeers: worldMaxPeers,
    maxPlayers: worldMaxPlayers,
    maxSessions: worldMaxSessions,
    sessionTtl: worldSessionTtlMs,
    respawnDelay,
    reloadInterval,
    log,
  })
  const worldTick = setInterval(() => continuous.tick(), worldTickMs)
  worldTick.unref?.()
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
      entities.delete(room)
      removedWorld.delete(room)
    }
    // What it drove stays where it is, free for anyone.
    for (const entity of entities.get(room)?.values() ?? [])
      if (entity.driver === member.peer) {
        entity.driver = null
        relayEvent(room, 'entity', entityData(entity))
      }
    broadcast(room, socket, { type: 'left', peer: member.peer })
    log('leave', room, member.peer, `${members.size} left`)
  }

  /** Shared entity requests: the relay keeps the list and decides (first come, first served). */
  const entityRequest = (room, socket, member, kind, data) => {
    const map = entitiesOf(room)
    const entity = typeof data.i === 'string' ? map.get(data.i) : undefined
    const tell = (e) =>
      send(socket, { type: 'event', peer: RELAY_PEER, kind: 'entity', data: entityData(e) })
    const claim = (e) => {
      const present = [...rooms.get(room).values()].some((m) => m.peer === e.driver)
      if (e.driver && e.driver !== member.peer && present) return tell(e)
      e.driver = member.peer
      relayEvent(room, 'entity', entityData(e))
      log('claim', room, e.id, member.peer)
    }
    if (kind === 'entity.spawn') {
      if (!validEntitySpawn(data)) return
      // Same id as an existing entity (an object every client has): a claim, never a copy.
      if (entity) return data.d ? claim(entity) : tell(entity)
      // World objects every client places with the same id (`w.…`): once removed, gone for good.
      if (removedWorld.get(room)?.has(data.i)) return
      const own = [...map.values()].filter((e) => e.owner === member.peer).length
      if (map.size >= maxEntities || own >= maxOwnEntities) return
      const params = Object.fromEntries(Object.entries(data).filter(([k]) => k.startsWith('_')))
      const created = {
        id: data.i,
        type: data.y,
        params,
        p: data.p,
        q: data.q,
        owner: member.peer,
        driver: data.d ? member.peer : null,
      }
      map.set(created.id, created)
      relayEvent(room, 'entity', entityData(created))
      log('spawn', room, created.id, created.type, 'by', member.peer)
    } else if (kind === 'entity.claim') {
      if (entity) claim(entity)
    } else if (kind === 'entity.release') {
      if (!entity || entity.driver !== member.peer) return
      if (vec3(data.p, 1e6)) entity.p = data.p
      if (finiteArray(data.q, 4)) entity.q = data.q
      entity.driver = null
      relayEvent(room, 'entity', entityData(entity))
      log('release', room, entity.id, member.peer)
    } else if (kind === 'entity.despawn') {
      if (!entity || (entity.driver && entity.driver !== member.peer)) return
      map.delete(entity.id)
      if (entity.id.startsWith('w.')) {
        if (!removedWorld.has(room)) removedWorld.set(room, new Set())
        if (removedWorld.get(room).size < 1024) removedWorld.get(room).add(entity.id)
      }
      relayEvent(room, 'entity.gone', { i: entity.id, b: member.peer })
      log('despawn', room, entity.id, 'by', member.peer)
    }
  }

  wss.on('connection', (socket) => {
    socket.nabla = { room: null, windowStart: Date.now(), frames: 0, events: 0 }
    const connection = new RelayConnection(socket, {
      softLimit: outboundSoftLimit,
      hardLimit: outboundHardLimit,
      slowTimeout: slowClientTimeoutMs,
      now: () => performance.now(),
      onDisconnect: (reason) =>
        log('disconnect', continuous.sockets.get(socket)?.world.id ?? socket.nabla.room, reason),
    })
    connections.set(socket, connection)
    socket.on('message', (data, binary) => {
      if (connection.closed) return
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
      if (continuous.has(socket)) return continuous.handle(socket, message)
      if (message.type === 'join' && message.version === 2) {
        leave(socket)
        return continuous.join(socket, message)
      }
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
          ...(entities.get(message.room)?.size
            ? { entities: [...entities.get(message.room).values()].map(entityData) }
            : {}),
        })
        broadcast(message.room, socket, { type: 'joined', peer, meta, slot, color })
        log('join', message.room, peer, `${members.size} in room`)
      } else if (message.type === 'snapshot') {
        const member = state.room && rooms.get(state.room)?.get(socket)
        if (!member || !validSnapshot(message)) return
        // A shared entity's state comes only from its driver; it moves the rest pose along.
        let entityId
        if (message.e !== undefined) {
          const entity = typeof message.e === 'string' && entities.get(state.room)?.get(message.e)
          if (!entity || entity.driver !== member.peer || !message.state) {
            if (!message.avatar) return
            message.state = undefined
          } else {
            entity.p = message.state.position
            entity.q = message.state.rotation
            entityId = entity.id
          }
        }
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
          ...(message.extra && message.state ? { extra: message.extra } : {}),
          ...(entityId ? { e: entityId } : {}),
        })
      } else if (message.type === 'event') {
        const member = state.room && rooms.get(state.room)?.get(socket)
        if (!member || typeof message.kind !== 'string' || !KIND.test(message.kind)) return
        if (!validEventData(message.data) || ++state.events > maxEvents) return
        if (message.kind === 'fire' && !validFire(message.data)) return
        if (message.kind === 'reload') {
          // Slot bounds, a living reloader, at most one per RELOAD_INTERVAL seconds.
          const now = seconds()
          const ledger = ledgerOf(state.room)
          if (
            !validReload(message.data) ||
            (ledger.has(member.peer) && ledger.get(member.peer).dead)
          )
            return
          if (now - (state.reloadAt ?? -Infinity) < reloadInterval) return
          state.reloadAt = now
        }
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
            relayEvent(state.room, 'death', {
              t: hit.t,
              s: member.peer,
              ...(hit.r ? { r: hit.r } : {}),
            })
            log('death', state.room, hit.t, 'by', member.peer)
          }
          return
        }
        if (message.kind.startsWith('entity'))
          return entityRequest(state.room, socket, member, message.kind, message.data)
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
    socket.on('close', () => {
      connections.delete(socket)
      continuous.disconnect(socket)
      leave(socket)
    })
    socket.on('error', () => {
      continuous.disconnect(socket)
      leave(socket)
    })
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
            clearInterval(heartbeat)
            clearInterval(queueCheck)
            clearInterval(worldTick)
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
