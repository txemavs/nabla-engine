import {
  PROTOCOL_VERSION,
  decodeServerMessage,
  encodeMessage,
  type EntityState,
  type PeerInfo,
  type SnapshotExtra,
  type NetEventData,
  type WheelVisuals,
  quantizeWheels,
  quantizeAvatar,
  decodeAvatar,
  type AvatarSample,
} from './protocol.js'

const wheels = (state: WheelVisuals | null | undefined) =>
  state ? { wheels: quantizeWheels(state) } : {}
import type { Transport } from './transport.js'
import { RemoteVehicle, type KinematicHost } from './remote-vehicle.js'
import { RemoteAvatar, type RemoteAvatarFactory } from './remote-avatar.js'
import { defaultInterpolation, type InterpolationOptions } from './interpolation.js'

/** Reads the local entity state; `Simulation` satisfies it with entityTransform/entityVelocity. */
export interface StateSource {
  entityTransform(id: string): {
    position: EntityState['position']
    rotation: EntityState['rotation']
  }
  entityVelocity(id: string): EntityState['velocity']
  entityAngularVelocity?(id: string): EntityState['angularVelocity']
  /** Optional per-wheel look (steer, suspension, spin) of a wheeled entity; null otherwise. */
  wheelVisualState?(id: string): WheelVisuals | null
}

export interface SnapshotSyncOptions {
  transport: Transport
  room: string
  /** Simulation (or any state source and kinematic host). */
  host: StateSource & KinematicHost
  /** Entity the local player controls right now; null sends nothing. */
  localEntity: () => string | null
  /**
   * Game hook: create a local entity for a new peer and return the id it really got (or null to
   * ignore the peer). May be async, because placement often waits for ground and assigns its own
   * id; snapshots are buffered until it resolves.
   */
  spawnRemote: (peer: PeerInfo) => string | null | Promise<string | null>
  /** Game hook: remove the entity created for a peer that left. */
  despawnRemote: (peer: string, entityId: string) => void
  meta?: Record<string, string | number | boolean>
  /**
   * The local player's on-foot body to send (feet position in scene metres, heading, speed and a
   * game-defined animation index), or null for none. Sent at the snapshot rate, alone when there
   * is no local entity (on foot) or alongside it.
   */
  localAvatar?: () => AvatarSample | null
  /** Game hook: build the view of a remote peer's body on its first avatar sample. */
  remoteAvatar?: RemoteAvatarFactory
  /** Game values sent with each snapshot of the local entity (e.g. a lights bitfield). */
  readExtra?: (entityId: string) => SnapshotExtra | undefined
  /**
   * Apply a peer's latest game values to its local entity; called when they change. Return
   * false when they could not be applied yet (e.g. the model is still loading) to retry.
   */
  applyExtra?: (entityId: string, extra: SnapshotExtra, peer: string) => boolean | void
  /** Game events from other peers (`sendEvent` on their side). */
  onEvent?: (event: { peer: string; kind: string; data: NetEventData }) => void
  /** Called with this client's relay-assigned slot and colour once joined. */
  onWelcome?: (self: { peer: string; slot?: number; color?: string }) => void
  /**
   * Interest management: a peer appears once it is within `show` metres (horizontal) of the local
   * player and disappears beyond `hide` (> show, so the edge does not flicker). Peers outside
   * keep their info and reappear on the next snapshot in range. Off when omitted.
   */
  interest?: InterestRadius
  /** Local player position for interest checks; defaults to the local entity's position. */
  localPosition?: () => EntityState['position'] | null
  /** Snapshots per second, default 20. */
  rate?: number
  interpolation?: InterpolationOptions
  clock?: () => number
}

/** Show/hide distances (metres) of interest management; `hide` should exceed `show`. */
export interface InterestRadius {
  show: number
  hide: number
}

/** Horizontal (x/z) distance in metres. */
export const horizontalDistance = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(a[0] - b[0], a[2] - b[2])

/**
 * Snapshot synchronisation for one room: sends the local entity at a fixed rate and mirrors
 * every other peer onto a kinematic local body through a ~100 ms interpolation buffer.
 * Authority is per owner; there is no prediction or reconciliation yet.
 */
export class SnapshotSync {
  peerId: string | null = null
  /** Relay-assigned slot and colour of this client (undefined with relays that assign none). */
  slot: number | undefined
  color: string | undefined
  private readonly appliedExtra = new Map<string, string>()
  /** Last known info of every other peer (meta, slot, colour), for respawns. */
  private readonly peers = new Map<string, PeerInfo>()
  private meta: Record<string, string | number | boolean>
  readonly remotes = new Map<string, RemoteVehicle>()
  /** Remote on-foot bodies, per peer (only with a `remoteAvatar` factory). */
  readonly avatars = new Map<string, RemoteAvatar>()
  /** Last reported position of every other peer, shown or not (interest management). */
  private readonly lastPosition = new Map<string, EntityState['position']>()
  private seq = 0
  private lastSent = -Infinity
  private readonly interval: number
  private readonly clock: () => number
  private readonly unsubscribe: (() => void)[] = []

  /** Room this client is in (or joining); see {@link switchRoom}. */
  room: string

  constructor(private readonly options: SnapshotSyncOptions) {
    this.room = options.room
    this.interval = 1000 / (options.rate ?? 20)
    this.meta = { ...(options.meta ?? {}) }
    this.clock = options.clock ?? (() => performance.now())
    const { transport } = options
    const join = () =>
      transport.send(
        encodeMessage({
          type: 'join',
          version: PROTOCOL_VERSION,
          room: this.room,
          meta: this.meta,
        }),
      )
    this.unsubscribe.push(
      transport.onOpen(join),
      transport.onMessage((data) => this.receive(data)),
      transport.onClose(() => this.dropAll()),
    )
    if (transport.status === 'open') join()
  }

  /** Call once per frame before stepping the simulation. */
  update(): void {
    const now = this.clock()
    if (this.options.interest) {
      const here = this.localPosition()
      for (const peer of [...this.remotes.keys()])
        if (!this.within(peer, this.options.interest.hide, here)) this.remove(peer)
      for (const peer of [...this.avatars.keys()])
        if (!this.within(peer, this.options.interest.hide, here)) this.removeAvatar(peer)
    }
    for (const avatar of this.avatars.values()) avatar.update(now)
    for (const [peer, remote] of this.remotes) {
      remote.update(now)
      if (!remote.extra || remote.entityId === null || !this.options.applyExtra) continue
      const key = remote.entityId + JSON.stringify(remote.extra)
      if (this.appliedExtra.get(peer) === key) continue
      if (this.options.applyExtra(remote.entityId, remote.extra, peer) !== false)
        this.appliedExtra.set(peer, key)
    }
    if (this.peerId === null || now - this.lastSent < this.interval) return
    const id = this.options.localEntity()
    const state = id ? this.read(id) : null
    const avatar = this.readAvatar()
    if (!state && !avatar) return
    this.lastSent = now
    const extra = id && state ? this.options.readExtra?.(id) : undefined
    this.options.transport.send(
      encodeMessage({
        type: 'snapshot',
        t: now,
        seq: this.seq++,
        ...(state ? { state } : {}),
        ...(avatar ? { avatar } : {}),
        ...(extra ? { extra } : {}),
      }),
    )
  }

  /**
   * Replace this client's meta (for example after changing vehicle). Other peers receive it as a
   * `profile` and respawn their copy of this client through `spawnRemote`.
   */
  setMeta(meta: Record<string, string | number | boolean>): void {
    this.meta = { ...meta }
    if (this.peerId !== null && this.options.transport.status === 'open')
      this.options.transport.send(encodeMessage({ type: 'profile', meta: this.meta }))
  }

  /**
   * Move this client to another room: every remote car and avatar of the old room is removed
   * (through `despawnRemote` / the avatar views) and the relay is joined again with the same
   * meta. The relay treats a join as leaving the previous room. No-op for the current room.
   */
  switchRoom(room: string): void {
    if (room === this.room) return
    this.room = room
    this.dropAll()
    if (this.options.transport.status === 'open')
      this.options.transport.send(
        encodeMessage({ type: 'join', version: PROTOCOL_VERSION, room, meta: this.meta }),
      )
  }

  /** Send a one-off game event to the other peers of the room; false while not joined. */
  sendEvent(kind: string, data: NetEventData): boolean {
    if (this.peerId === null || this.options.transport.status !== 'open') return false
    this.options.transport.send(encodeMessage({ type: 'event', kind, data }))
    return true
  }

  /** Peer whose remote copy is `entityId`, or null. */
  peerOfEntity(entityId: string): string | null {
    for (const [peer, remote] of this.remotes) if (remote.entityId === entityId) return peer
    return null
  }

  dispose(): void {
    if (this.options.transport.status === 'open')
      this.options.transport.send(encodeMessage({ type: 'leave' }))
    for (const off of this.unsubscribe) off()
    this.dropAll()
  }

  /** Local player position, or null when unknown (interest checks then let everyone in). */
  private localPosition(): EntityState['position'] | null {
    if (this.options.localPosition) return this.options.localPosition()
    const id = this.options.localEntity()
    if (!id) return null
    try {
      return this.options.host.entityTransform(id).position
    } catch {
      return null
    }
  }
  /** Peer within `radius` of `here`; unknown positions count as outside, an unknown `here` as in. */
  private within(peer: string, radius: number, here = this.localPosition()): boolean {
    if (!here) return true
    const there = this.lastPosition.get(peer)
    return !!there && horizontalDistance(here, there) <= radius
  }
  private readAvatar() {
    try {
      const sample = this.options.localAvatar?.()
      return sample ? quantizeAvatar(sample) : null
    } catch {
      return null
    }
  }
  private read(id: string): EntityState | null {
    const { host } = this.options
    try {
      const { position, rotation } = host.entityTransform(id)
      return {
        position,
        rotation,
        velocity: host.entityVelocity(id),
        angularVelocity: host.entityAngularVelocity?.(id) ?? [0, 0, 0],
        ...wheels(host.wheelVisualState?.(id)),
      }
    } catch {
      return null
    }
  }

  private receive(data: string): void {
    const message = decodeServerMessage(data)
    if (!message) return
    switch (message.type) {
      case 'welcome':
        this.peerId = message.peer
        this.slot = message.slot
        this.color = message.color
        this.options.onWelcome?.({ peer: message.peer, slot: message.slot, color: message.color })
        for (const peer of message.peers) this.add(peer)
        break
      case 'joined':
        this.add({
          peer: message.peer,
          meta: message.meta,
          slot: message.slot,
          color: message.color,
        })
        break
      case 'left':
        this.remove(message.peer)
        this.removeAvatar(message.peer)
        this.peers.delete(message.peer)
        this.lastPosition.delete(message.peer)
        break
      case 'event':
        if (message.peer !== this.peerId)
          this.options.onEvent?.({ peer: message.peer, kind: message.kind, data: message.data })
        break
      case 'profile': {
        if (message.peer === this.peerId) break
        const known = this.peers.get(message.peer) ?? { peer: message.peer, meta: {} }
        // Respawn with the new meta, keeping the relay slot and colour.
        this.remove(message.peer)
        this.add({ ...known, meta: message.meta })
        break
      }
      case 'snapshot':
        if (message.peer === this.peerId) break
        if (!message.state && !message.avatar) break
        this.lastPosition.set(message.peer, message.state?.position ?? message.avatar!.p)
        if (message.state) {
          if (!this.remotes.has(message.peer))
            this.add(this.peers.get(message.peer) ?? { peer: message.peer, meta: {} })
          this.remotes
            .get(message.peer)
            ?.push(message.t, message.state, this.clock(), message.extra)
        }
        if (message.avatar)
          this.receiveAvatar(message.peer, message.t, decodeAvatar(message.avatar))
        break
      case 'error':
        break
    }
  }

  private receiveAvatar(peer: string, t: number, sample: AvatarSample): void {
    const factory = this.options.remoteAvatar
    if (!factory || peer === this.peerId) return
    let avatar = this.avatars.get(peer)
    if (!avatar) {
      if (this.options.interest && !this.within(peer, this.options.interest.show)) return
      const created = new RemoteAvatar(this.options.interpolation ?? defaultInterpolation)
      avatar = created
      this.avatars.set(peer, created)
      const info = this.peers.get(peer) ?? { peer, meta: {} }
      const fail = (error: unknown) => {
        if (this.avatars.get(peer) === created) this.avatars.delete(peer)
        console.warn('[nabla/net] could not create the body of peer', peer, error)
      }
      try {
        const view = factory(info)
        if (view instanceof Promise) view.then((v) => created.attach(v), fail)
        else created.attach(view)
      } catch (error) {
        fail(error)
      }
    }
    avatar.push(t, sample, this.clock())
  }

  private removeAvatar(peer: string): void {
    this.avatars.get(peer)?.dispose()
    this.avatars.delete(peer)
  }

  private add(peer: PeerInfo): void {
    if (peer.peer === this.peerId) return
    this.peers.set(peer.peer, peer)
    if (this.remotes.has(peer.peer)) return
    // Far (or not yet located) peers wait for a snapshot within the show radius.
    if (this.options.interest && !this.within(peer.peer, this.options.interest.show)) return
    const remote = new RemoteVehicle(
      null,
      this.options.host,
      this.options.interpolation ?? defaultInterpolation,
    )
    this.remotes.set(peer.peer, remote)
    const placed = (entityId: string | null) => {
      if (this.remotes.get(peer.peer) === remote) {
        if (entityId) remote.entityId = entityId
        else this.remotes.delete(peer.peer)
      } else if (entityId) {
        // The peer left (or the session closed) while its entity was being placed.
        this.options.despawnRemote(peer.peer, entityId)
      }
    }
    let result: ReturnType<SnapshotSyncOptions['spawnRemote']>
    try {
      result = this.options.spawnRemote(peer)
    } catch (error) {
      this.remotes.delete(peer.peer)
      throw error
    }
    if (result instanceof Promise)
      result.then(placed, (error) => {
        placed(null)
        console.warn('[nabla/net] could not spawn peer', peer.peer, error)
      })
    else placed(result)
  }

  private remove(peer: string): void {
    const remote = this.remotes.get(peer)
    if (!remote) return
    remote.release()
    this.remotes.delete(peer)
    this.appliedExtra.delete(peer)
    if (remote.entityId !== null) this.options.despawnRemote(peer, remote.entityId)
  }

  private dropAll(): void {
    for (const peer of [...this.remotes.keys()]) this.remove(peer)
    for (const peer of [...this.avatars.keys()]) this.removeAvatar(peer)
    this.peers.clear()
    this.lastPosition.clear()
    this.peerId = null
  }
}
