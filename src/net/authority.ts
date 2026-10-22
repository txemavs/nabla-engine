/**
 * GameAuthority: the one place that decides who gets an item, who drives a shared vehicle and
 * who has how much health. Games send requests and subscribe to the outcome, and never apply a
 * contested result themselves. RelayAuthority asks the relay (multiplayer); LocalAuthority
 * decides in-process with the same rules (single player). Requests: authority-schema.ts.
 */
import { HealthLedger } from '../simulation/combat/damage.js'
import type { QuatTuple, Vec3Tuple } from '../math/frame/vectors.js'
import { parseAuthorityRequest, type AuthorityRequest } from './authority-schema.js'
import { encodeHit, decodeHealthEvent, type NetEventData } from './protocol.js'
import type { SharedEntities, SharedEntityRecord } from './shared-entities.js'

export type { AuthorityRequest } from './authority-schema.js'

/** A ground item as the authority knows it. */
export interface AuthorityItem {
  id: string
  item: string
  count: number
  position: Vec3Tuple
}
export type ItemChange =
  | { type: 'added'; item: AuthorityItem }
  /** Taken (`by` the player who got it) or removed (`by` null). */
  | { type: 'removed'; id: string; by: string | null }
export interface ClaimChange {
  entity: string
  /** Player driving now; null when released. */
  driver: string | null
  pose?: { position: Vec3Tuple; rotation: QuatTuple }
}
export type HealthChange =
  | { type: 'health'; target: string; health: number; shooter?: string; zone?: string }
  | { type: 'death'; target: string; shooter?: string }
  | { type: 'respawn'; target: string; health: number; position?: Vec3Tuple }
export type Unsubscribe = () => void

export interface GameAuthority {
  /** This player's id (relay peer id online, `local` offline); null before joining. */
  readonly self: string | null
  /**
   * Send a request. True when it was valid and sent (online) or applied (offline); the outcome
   * always arrives through the subscriptions, also for our own requests.
   */
  request(request: AuthorityRequest): boolean
  /** Ground item changes; called at once with every current item as `added`. */
  onItems(listener: (change: ItemChange) => void): Unsubscribe
  /** Vehicle driver changes (claims and releases); called at once for every driven vehicle. */
  onClaims(listener: (change: ClaimChange) => void): Unsubscribe
  /** Health, death and respawn of any player. */
  onHealth(listener: (change: HealthChange) => void): Unsubscribe
  /** Advance timers (respawns) with the game clock in seconds. */
  update(now: number): void
  dispose(): void
}

class Listeners<T> {
  private readonly set = new Set<(v: T) => void>()
  add(fn: (v: T) => void): Unsubscribe {
    this.set.add(fn)
    return () => this.set.delete(fn)
  }
  emit(v: T): void {
    for (const fn of [...this.set]) fn(v)
  }
  clear(): void {
    this.set.clear()
  }
}

/** Single player: decides in-process (first come wins, HealthLedger for damage and respawn). */
export class LocalAuthority implements GameAuthority {
  readonly self = 'local'
  readonly ledger: HealthLedger
  private readonly items = new Map<string, AuthorityItem>()
  private readonly drivers = new Map<string, string>()
  private readonly itemsL = new Listeners<ItemChange>()
  private readonly claimsL = new Listeners<ClaimChange>()
  private readonly healthL = new Listeners<HealthChange>()
  private now = 0
  private next = 0

  constructor(options: { ledger?: HealthLedger; items?: AuthorityItem[] } = {}) {
    this.ledger = options.ledger ?? new HealthLedger()
    for (const item of options.items ?? []) this.items.set(item.id, item)
  }
  request(raw: AuthorityRequest): boolean {
    const r = parseAuthorityRequest(raw)
    if (!r) return false
    switch (r.type) {
      case 'pickup':
        if (!this.items.delete(r.item)) return false
        this.itemsL.emit({ type: 'removed', id: r.item, by: this.self })
        return true
      case 'drop': {
        const item = { id: `${this.self}.${++this.next}`, item: r.item, count: r.count, position: r.position }
        this.items.set(item.id, item)
        this.itemsL.emit({ type: 'added', item })
        return true
      }
      case 'claim': {
        const d = this.drivers.get(r.entity)
        if (d && d !== this.self) return false
        this.drivers.set(r.entity, this.self)
        this.claimsL.emit({ entity: r.entity, driver: this.self })
        return true
      }
      case 'release':
        if (this.drivers.get(r.entity) !== this.self) return false
        this.drivers.delete(r.entity)
        this.claimsL.emit({ entity: r.entity, driver: null, ...(r.pose ? { pose: r.pose } : {}) })
        return true
      case 'hit': {
        if (this.ledger.get(r.target).dead) return false
        const res = this.ledger.damage(r.target, r.damage, this.now)
        this.healthL.emit({ type: 'health', target: r.target, health: res.health, shooter: this.self, zone: r.zone })
        if (res.died) this.healthL.emit({ type: 'death', target: r.target, shooter: this.self })
        return true
      }
      case 'fire':
      case 'reload':
        // Presentation only: nobody else to tell offline.
        return true
    }
  }
  onItems(fn: (c: ItemChange) => void): Unsubscribe {
    for (const item of this.items.values()) fn({ type: 'added', item })
    return this.itemsL.add(fn)
  }
  onClaims(fn: (c: ClaimChange) => void): Unsubscribe {
    for (const [entity, driver] of this.drivers) fn({ entity, driver })
    return this.claimsL.add(fn)
  }
  onHealth(fn: (c: HealthChange) => void): Unsubscribe {
    return this.healthL.add(fn)
  }
  update(now: number): void {
    this.now = now
    for (const id of this.ledger.due(now)) {
      const s = this.ledger.respawn(id)
      this.healthL.emit({ type: 'respawn', target: id, health: s.health })
    }
  }
  dispose(): void {
    for (const l of [this.itemsL, this.claimsL, this.healthL]) l.clear()
  }
}

/** The relay link RelayAuthority needs (SnapshotSync provides it). */
export interface RelayLink {
  readonly peerId: string | null
  sendEvent(kind: string, data: NetEventData): boolean
}

/**
 * Multiplayer: requests go to the relay, which decides (services/relay); outcomes come back as
 * relay events. Feed every received event to {@link receive} and every shared entity change to
 * {@link entityChanged} / {@link entityRemoved} (SharedEntityHooks `changed` / `removed`).
 */
export class RelayAuthority implements GameAuthority {
  private readonly itemsL = new Listeners<ItemChange>()
  private readonly claimsL = new Listeners<ClaimChange>()
  private readonly healthL = new Listeners<HealthChange>()

  constructor(
    private readonly link: RelayLink,
    private readonly shared: SharedEntities,
  ) {}
  get self(): string | null {
    return this.link.peerId
  }
  request(raw: AuthorityRequest): boolean {
    const r = parseAuthorityRequest(raw)
    if (!r || !this.self) return false
    switch (r.type) {
      case 'pickup':
        return this.shared.remove(r.item)
      case 'drop':
        return this.shared.publish('item', { item: r.item, n: r.count }, { position: r.position, rotation: [0, 0, 0, 1] }, null) !== null
      case 'claim':
        return this.shared.claim(r.entity)
      case 'release':
        return this.shared.release(r.entity, r.pose)
      case 'hit':
        return this.link.sendEvent('hit', encodeHit({ targetId: r.target, damage: r.damage, zone: r.zone, direction: r.direction }))
      case 'fire':
        return this.link.sendEvent('fire', { w: r.slot, k: r.kind, o: [...r.origin], d: [...r.direction] })
      case 'reload':
        return this.link.sendEvent('reload', { w: r.slot })
    }
  }
  /** Relay events: health, death and respawn. */
  receive(kind: string, data: NetEventData): void {
    if (kind !== 'health' && kind !== 'death' && kind !== 'respawn') return
    const h = decodeHealthEvent(data)
    if (!h) return
    if (kind === 'health') this.healthL.emit({ type: 'health', target: h.targetId, health: h.health, shooter: h.shooterId, zone: h.zone })
    else if (kind === 'death') this.healthL.emit({ type: 'death', target: h.targetId, shooter: h.shooterId })
    else this.healthL.emit({ type: 'respawn', target: h.targetId, health: h.health, position: h.position })
  }
  entityChanged(record: SharedEntityRecord): void {
    if (record.type === 'item') this.itemsL.emit({ type: 'added', item: itemOf(record) })
    else this.claimsL.emit({ entity: record.id, driver: record.driver, pose: { position: record.position, rotation: record.rotation } })
  }
  entityRemoved(record: SharedEntityRecord, by: string | null): void {
    if (record.type === 'item') this.itemsL.emit({ type: 'removed', id: record.id, by })
  }
  onItems(fn: (c: ItemChange) => void): Unsubscribe {
    for (const r of this.shared.list()) if (r.type === 'item') fn({ type: 'added', item: itemOf(r) })
    return this.itemsL.add(fn)
  }
  onClaims(fn: (c: ClaimChange) => void): Unsubscribe {
    for (const r of this.shared.list()) if (r.type !== 'item' && r.driver) fn({ entity: r.id, driver: r.driver })
    return this.claimsL.add(fn)
  }
  onHealth(fn: (c: HealthChange) => void): Unsubscribe {
    return this.healthL.add(fn)
  }
  update(): void {
    // The relay runs the respawn timers.
  }
  dispose(): void {
    for (const l of [this.itemsL, this.claimsL, this.healthL]) l.clear()
  }
}

function itemOf(r: SharedEntityRecord): AuthorityItem {
  return { id: r.id, item: String(r.params.item ?? ''), count: Number(r.params.n ?? 1), position: r.position }
}
