import { randomBytes, randomUUID } from 'node:crypto'
import { HealthLedger } from './combat.mjs'
import { SpatialIndex } from './spatial-index.mjs'

const ID = /^[A-Za-z0-9_.:-]{1,64}$/
const WORLD = /^[A-Za-z0-9_-]{1,64}$/
const vector = (v, n, bound = 1e8) =>
  Array.isArray(v) && v.length === n && v.every((x) => Number.isFinite(x) && Math.abs(x) <= bound)
const quaternion = (q) => vector(q, 4, 1.001) && Math.abs(Math.hypot(...q) - 1) < 0.02
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]))
const entityData = (e) => ({
  i: e.id,
  y: e.type,
  p: e.p,
  q: e.q,
  o: e.owner,
  ...(e.driver ? { d: e.driver } : {}),
  ...e.params,
})

/** Protocol 2: instance membership, resumable sessions and visibility are separate lifetimes. */
export class ContinuousWorlds {
  constructor({
    send,
    validate,
    palette,
    radius = 250,
    maxPeers = 64,
    maxPlayers = 4096,
    maxSessions = 8192,
    sessionTtl = 120_000,
    maxEntities = 4096,
    maxOwnEntities = 16,
    maxVisibleEntities = 128,
    respawnDelay = 5,
    reloadInterval = 0.5,
    now = () => performance.now(),
    log = () => {},
  }) {
    Object.assign(this, {
      send,
      validate,
      palette,
      radius,
      maxPeers,
      maxPlayers,
      maxSessions,
      sessionTtl,
      maxEntities,
      maxOwnEntities,
      maxVisibleEntities,
      respawnDelay,
      reloadInterval,
      now,
      log,
    })
    this.worlds = new Map()
    this.tokens = new Map()
    this.sockets = new Map()
    this.margin = Math.min(25, radius * 0.1)
  }
  error(socket, message, code) {
    this.send(socket, { type: 'error', message, ...(code ? { code } : {}) })
  }
  has(socket) {
    return this.sockets.has(socket)
  }
  position(space, p) {
    return (
      vector(p, 3) && (space === 'local' || (Math.hypot(...p) >= 3e6 && Math.hypot(...p) <= 1e8))
    )
  }
  join(socket, message) {
    if (this.has(socket)) return this.error(socket, 'Already in a continuous world')
    const descriptor = message.world
    if (
      typeof message.room !== 'string' ||
      !WORLD.test(message.room) ||
      !descriptor ||
      !['planet', 'local'].includes(descriptor.space) ||
      typeof descriptor.content !== 'string' ||
      !ID.test(descriptor.content) ||
      !this.position(descriptor.space, message.position)
    )
      return this.error(socket, 'Invalid world descriptor or position')
    this.expire()
    let world = this.worlds.get(message.room)
    if (world && (world.space !== descriptor.space || world.content !== descriptor.content))
      return this.error(socket, 'World content or coordinate space mismatch', 'world-mismatch')
    let session
    if (message.resume !== undefined) {
      session = typeof message.resume === 'string' && this.tokens.get(message.resume)
      if (!session || session.world.id !== message.room)
        return this.error(socket, 'Session expired or invalid', 'session-expired')
      // Never let two tabs drive the same identity at once.
      if (session.socket) return this.error(socket, 'Session already connected', 'session-active')
    }
    if (this.sockets.size >= this.maxPlayers || (!session && this.tokens.size >= this.maxSessions))
      return this.error(socket, 'Server capacity reached', 'capacity')
    if (!world) {
      world = {
        id: message.room,
        space: descriptor.space,
        content: descriptor.content,
        members: new Map(),
        entities: new Map(),
        drivers: new Map(),
        players: new SpatialIndex(this.radius + this.margin),
        objects: new SpatialIndex(this.radius + this.margin),
        ledger: new HealthLedger(undefined, this.respawnDelay),
        removed: new Set(),
      }
      this.worlds.set(world.id, world)
    }
    if (!session) {
      session = {
        peer: randomUUID(),
        token: randomBytes(32).toString('hex'),
        world,
        color: this.palette[world.members.size % this.palette.length],
        reloadAt: -Infinity,
        observers: new Set(),
      }
      world.members.set(session.peer, session)
      this.tokens.set(session.token, session)
    }
    Object.assign(session, {
      socket,
      expires: Infinity,
      meta: this.validate.cleanMeta(message.meta),
      position: message.position,
      visible: new Set(),
      objects: new Set(),
      snapshot: null,
      seq: -1,
    })
    this.sockets.set(socket, session)
    world.players.set(session.peer, session.position)
    this.send(socket, {
      type: 'welcome',
      version: 2,
      peer: session.peer,
      room: world.id,
      resume: session.token,
      peers: [],
      color: session.color,
      entities: [],
      health: { [session.peer]: world.ledger.get(session.peer).health },
    })
    this.refresh(world)
    this.log('world join', world.id, session.peer)
  }
  disconnect(socket) {
    const s = this.sockets.get(socket)
    if (!s) return
    this.sockets.delete(socket)
    s.socket = null
    s.expires = this.now() + this.sessionTtl
    s.world.players.delete(s.peer)
    s.snapshot = null
    for (const peer of s.visible) s.world.members.get(peer)?.observers.delete(s.peer)
    s.visible.clear()
    // A real disconnect releases control. AOI exit never reaches this path.
    const driven = s.world.entities.get(s.world.drivers.get(s.peer))
    if (driven) {
      driven.driver = null
      s.world.drivers.delete(s.peer)
      this.entityOutcome(s.world, driven)
    }
    this.refresh(s.world)
    this.log('world disconnect', s.world.id, s.peer)
  }
  expire() {
    for (const [token, s] of this.tokens)
      if (!s.socket && s.expires <= this.now()) {
        this.tokens.delete(token)
        s.world.members.delete(s.peer)
        s.world.ledger.remove(s.peer)
        if (!s.world.members.size) this.worlds.delete(s.world.id)
      }
  }
  tick() {
    this.expire()
    for (const world of this.worlds.values()) {
      for (const peer of world.ledger.due(this.now() / 1000)) {
        world.ledger.respawn(peer)
        this.outcome(world, peer, 'respawn', { t: peer })
      }
      this.refresh(world)
    }
  }
  event(socket, kind, data) {
    this.send(socket, { type: 'event', peer: 'relay', kind, data })
  }
  outcome(world, peer, kind, data) {
    for (const s of world.members.values())
      if (s.socket && (s.peer === peer || s.visible.has(peer))) this.event(s.socket, kind, data)
  }
  refresh(world) {
    for (const s of world.members.values()) {
      if (!s.socket) continue
      const selected = world.players
        .near(s.position, this.radius + this.margin)
        .filter(
          (row) => row.id !== s.peer && (row.distance <= this.radius || s.visible.has(row.id)),
        )
        .sort(
          (a, b) =>
            a.distance -
              (s.visible.has(a.id) ? this.margin : 0) -
              (b.distance - (s.visible.has(b.id) ? this.margin : 0)) || a.id.localeCompare(b.id),
        )
        .slice(0, this.maxPeers)
      const visible = new Set(selected.map((row) => row.id))
      for (const peer of s.visible)
        if (!visible.has(peer)) {
          world.members.get(peer)?.observers.delete(s.peer)
          this.send(s.socket, { type: 'hidden', peer })
        }
      const entered = selected.filter((row) => !s.visible.has(row.id))
      s.visible = visible
      // Entity records must arrive before snapshots carrying their ids.
      this.refreshObjects(s)
      for (const { id } of entered) {
        const other = world.members.get(id)
        other.observers.add(s.peer)
        this.send(s.socket, { type: 'visible', peer: id, meta: other.meta, color: other.color })
        this.event(s.socket, 'health', { t: id, h: world.ledger.get(id).health })
        if (other.snapshot) this.send(s.socket, other.snapshot)
      }
    }
  }
  refreshObjects(s) {
    const world = s.world
    const rows = world.objects
      .near(s.position, this.radius + this.margin)
      .filter(({ id, distance: d }) => {
        const e = world.entities.get(id)
        return (
          (d <= this.radius || s.objects.has(id)) &&
          (!e.driver || e.driver === s.peer || s.visible.has(e.driver))
        )
      })
      .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
    const own = world.drivers.has(s.peer) ? [world.drivers.get(s.peer)] : []
    const selected = new Set([...own, ...rows.map((r) => r.id)].slice(0, this.maxVisibleEntities))
    for (const id of s.objects)
      if (!selected.has(id)) this.event(s.socket, 'entity.hidden', { i: id })
    for (const id of selected)
      if (!s.objects.has(id)) this.event(s.socket, 'entity', entityData(world.entities.get(id)))
    s.objects = selected
  }
  entityOutcome(world, e) {
    for (const s of world.members.values())
      if (s.socket && s.objects.has(e.id)) this.event(s.socket, 'entity', entityData(e))
  }
  handle(socket, message) {
    const s = this.sockets.get(socket)
    if (!s) return
    const world = s.world
    if (message.type === 'leave') return this.disconnect(socket)
    if (message.type === 'join')
      return this.error(socket, 'Leave the world before joining another instance')
    if (message.type === 'profile') {
      s.meta = this.validate.cleanMeta(message.meta)
      for (const other of world.members.values())
        if (other.socket && other.visible.has(s.peer))
          this.send(other.socket, { type: 'profile', peer: s.peer, meta: s.meta })
      return
    }
    if (message.type === 'snapshot') {
      if (
        !this.validate.validSnapshot(message) ||
        !Number.isSafeInteger(message.seq) ||
        message.seq <= s.seq
      )
        return
      if (
        message.state &&
        (!this.position(world.space, message.state.position) ||
          !quaternion(message.state.rotation) ||
          !vector(message.state.velocity, 3, 1e5) ||
          !vector(message.state.angularVelocity, 3, 1e5))
      )
        return
      if (
        message.avatar &&
        (!this.position(world.space, message.avatar.p) ||
          (message.avatar.u !== undefined &&
            (!vector(message.avatar.u, 3, 1.001) ||
              Math.abs(Math.hypot(...message.avatar.u) - 1) > 0.02)) ||
          (world.space === 'planet' && !quaternion(message.avatar.q)))
      )
        return
      const position = message.avatar?.p ?? message.state?.position
      if (message.e !== undefined) {
        const e = world.entities.get(message.e)
        if (!e || e.driver !== s.peer || !message.state) return
        e.p = message.state.position
        e.q = message.state.rotation
        world.objects.set(e.id, e.p)
      }
      s.seq = message.seq
      s.position = position
      s.snapshot = {
        type: 'snapshot',
        peer: s.peer,
        seq: message.seq,
        t: message.t,
        ...(message.state ? { state: message.state } : {}),
        ...(message.avatar ? { avatar: message.avatar } : {}),
        ...(message.extra ? { extra: message.extra } : {}),
        ...(message.e ? { e: message.e } : {}),
      }
      world.players.set(s.peer, position)
      // Membership is refreshed on the bounded AOI tick. Until then, never leak beyond its radius.
      for (const observer of s.observers) {
        const other = world.members.get(observer)
        if (
          other?.socket &&
          other.visible.has(s.peer) &&
          distance(other.position, position) <= this.radius + this.margin
        )
          this.send(other.socket, s.snapshot)
      }
      return
    }
    if (
      message.type !== 'event' ||
      typeof message.kind !== 'string' ||
      !this.validate.validEventData(message.data)
    )
      return
    if (++socket.nabla.events > this.validate.maxEvents) return
    const { kind, data } = message
    if (world.ledger.get(s.peer).dead) return
    if (kind.startsWith('entity.')) return this.entityRequest(s, kind, data)
    if (kind === 'hit') {
      const target = world.members.get(data.t)
      // Mutual visibility is required: a culled player cannot damage an unseen opponent.
      if (
        !target?.socket ||
        !s.visible.has(target.peer) ||
        !target.visible.has(s.peer) ||
        distance(s.position, target.position) > this.radius + this.margin ||
        !Number.isFinite(data.d) ||
        data.d < 0 ||
        data.d > 400 ||
        world.ledger.get(target.peer).dead
      )
        return
      const result = world.ledger.damage(target.peer, data.d, this.now() / 1000)
      const outcome = {
        t: target.peer,
        h: result.health,
        s: s.peer,
        ...(typeof data.z === 'string' && /^[a-z]{1,16}$/.test(data.z) ? { z: data.z } : {}),
        ...(vector(data.r, 3, 1.001) ? { r: data.r } : {}),
      }
      this.outcome(world, target.peer, 'health', outcome)
      if (result.died) this.outcome(world, target.peer, 'death', outcome)
      return
    }
    if (kind === 'reload') {
      if (!this.validate.validReload(data) || this.now() - s.reloadAt < this.reloadInterval * 1000)
        return
      s.reloadAt = this.now()
    } else if (kind === 'fire') {
      if (!this.validate.validFire({ ...data, o: [0, 0, 0] })) return
      if (
        !Number.isInteger(data.w) ||
        data.w < 0 ||
        data.w > 63 ||
        !Number.isInteger(data.k) ||
        data.k < 0 ||
        data.k > 15 ||
        !this.position(world.space, data.o) ||
        !vector(data.d, 3, 1.001) ||
        Math.abs(Math.hypot(...data.d) - 1) > 0.02
      )
        return
    } else return // Explicit event allowlist; outcomes cannot be spoofed.
    for (const other of world.members.values())
      if (
        other.socket &&
        other.visible.has(s.peer) &&
        distance(s.position, other.position) <= this.radius + this.margin
      )
        this.send(other.socket, { type: 'event', peer: s.peer, kind, data })
  }
  entityRequest(s, kind, data) {
    const world = s.world
    const e = world.entities.get(data.i)
    const nearby = e && s.objects.has(e.id) && distance(s.position, e.p) <= 15
    if (kind === 'entity.spawn') {
      if (
        typeof data.i !== 'string' ||
        !ID.test(data.i) ||
        typeof data.y !== 'string' ||
        !ID.test(data.y) ||
        !this.position(world.space, data.p) ||
        !quaternion(data.q) ||
        distance(s.position, data.p) > 50 ||
        Object.keys(data).filter((k) => k.startsWith('_')).length > 8 ||
        Object.entries(data).some(([k, v]) => k.startsWith('_') && Array.isArray(v))
      )
        return
      if (e) {
        if (data.d) return this.entityRequest(s, 'entity.claim', { i: e.id })
        if (nearby) this.event(s.socket, 'entity', entityData(e))
        return
      }
      if (
        world.removed.has(data.i) ||
        world.entities.size >= this.maxEntities ||
        [...world.entities.values()].filter((e) => e.owner === s.peer).length >= this.maxOwnEntities
      )
        return
      if (data.d && world.drivers.has(s.peer)) return
      const created = {
        id: data.i,
        type: data.y,
        p: data.p,
        q: data.q,
        owner: s.peer,
        driver: data.d ? s.peer : null,
        params: Object.fromEntries(Object.entries(data).filter(([k]) => k.startsWith('_'))),
      }
      world.entities.set(created.id, created)
      if (created.driver) world.drivers.set(s.peer, created.id)
      world.objects.set(created.id, created.p)
      this.refresh(world)
    } else if (kind === 'entity.claim' && nearby && (!e.driver || e.driver === s.peer)) {
      if (world.drivers.has(s.peer) && world.drivers.get(s.peer) !== e.id) return
      e.driver = s.peer
      world.drivers.set(s.peer, e.id)
      this.entityOutcome(world, e)
      this.refresh(world)
    } else if (kind === 'entity.release' && e?.driver === s.peer) {
      if (
        data.p !== undefined &&
        (!this.position(world.space, data.p) || distance(s.position, data.p) > 50)
      )
        return
      if (data.q !== undefined && !quaternion(data.q)) return
      if (data.p) e.p = data.p
      if (data.q) e.q = data.q
      e.driver = null
      world.drivers.delete(s.peer)
      world.objects.set(e.id, e.p)
      this.entityOutcome(world, e)
      this.refresh(world)
    } else if (
      kind === 'entity.despawn' &&
      nearby &&
      (!e.driver || e.driver === s.peer) &&
      (e.type === 'item' || e.owner === s.peer)
    ) {
      // Bounded tombstones: reject further deletions rather than resurrect a removed world id.
      if (world.removed.size >= this.maxEntities * 4) return
      world.removed.add(e.id)
      world.entities.delete(e.id)
      if (e.driver) world.drivers.delete(e.driver)
      world.objects.delete(e.id)
      for (const other of world.members.values())
        if (other.socket && other.objects.delete(e.id))
          this.event(other.socket, 'entity.gone', { i: e.id, b: s.peer })
    }
  }
}
