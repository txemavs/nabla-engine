/**
 * Relay-authoritative shared entities (#298): things every client of a room sees as one object,
 * e.g. a vehicle someone placed or an item lying on the ground. The relay keeps the list (id,
 * type, game parameters, rest transform, owner, driver) and sends it in `welcome`; changes come
 * as reliable events from {@link RELAY_PEER}. The driver, if any, is the physics authority: its
 * snapshots carry the entity id (`e`) and everyone else interpolates a kinematic copy. Entering
 * someone else's entity is a claim on that entity, never a new spawn.
 *
 * Generic: the engine knows nothing of what a type means. The game spawns and removes its local
 * object for a record (`spawn` / `despawn`), and reacts to driver changes (`changed`).
 */
import type { QuatTuple, Vec3Tuple } from '../math/frame/vectors.js'
import { defaultInterpolation, type InterpolationOptions } from './interpolation.js'
import type { EntityState, NetEventData, SnapshotExtra } from './protocol.js'
import type { KinematicHost } from './remote-vehicle.js'
import { RemoteVehicle } from './remote-vehicle.js'

/** Client requests (relay validates and answers with ENTITY_EVENT / ENTITY_GONE_EVENT). */
export const ENTITY_SPAWN = 'entity.spawn'
export const ENTITY_CLAIM = 'entity.claim'
export const ENTITY_RELEASE = 'entity.release'
export const ENTITY_DESPAWN = 'entity.despawn'
/** Relay broadcasts: the full record after any change, and removal (`b` = who removed it). */
export const ENTITY_EVENT = 'entity'
export const ENTITY_GONE_EVENT = 'entity.gone'
/** At most this many game parameters per entity (wire keys `_name`). */
export const MAX_ENTITY_PARAMS = 8

export type EntityParams = Record<string, string | number | boolean>
export interface SharedEntityRecord {
  id: string
  /** Game-defined kind / asset key, e.g. a vehicle preset or an item type. */
  type: string
  params: EntityParams
  /** Rest pose (spawn, or where the last driver left it). */
  position: Vec3Tuple
  rotation: QuatTuple
  owner: string
  driver: string | null
}

const ID = /^[A-Za-z0-9_.:-]{1,64}$/
const fix = (v: readonly number[], digits: number) => v.map((n) => +n.toFixed(digits))

/** Record (or spawn request) as event data: `i y p q o d` and `_param` keys. */
export function encodeEntity(
  e: Pick<SharedEntityRecord, 'id' | 'type' | 'params' | 'position' | 'rotation'> &
    Partial<Pick<SharedEntityRecord, 'owner' | 'driver'>>,
): NetEventData {
  const data: NetEventData = {
    i: e.id,
    y: e.type,
    p: fix(e.position, 3),
    q: fix(e.rotation, 4),
    ...(e.owner ? { o: e.owner } : {}),
    ...(e.driver ? { d: e.driver } : {}),
  }
  for (const [key, value] of Object.entries(e.params).slice(0, MAX_ENTITY_PARAMS))
    data[`_${key}`.slice(0, 32)] = typeof value === 'string' ? value.slice(0, 64) : value
  return data
}

/** Tolerant decode; null when id, type or pose are missing or malformed. */
export function decodeEntity(data: NetEventData): SharedEntityRecord | null {
  const { i, y, p, q, o, d } = data
  if (typeof i !== 'string' || !ID.test(i) || typeof y !== 'string' || !y || y.length > 64)
    return null
  if (!Array.isArray(p) || p.length !== 3 || !Array.isArray(q) || q.length !== 4) return null
  const params: EntityParams = {}
  for (const [key, value] of Object.entries(data))
    if (key.startsWith('_') && !Array.isArray(value)) params[key.slice(1)] = value
  return {
    id: i,
    type: y,
    params,
    position: [p[0], p[1], p[2]],
    rotation: [q[0], q[1], q[2], q[3]],
    owner: typeof o === 'string' ? o : '',
    driver: typeof d === 'string' && d ? d : null,
  }
}

export interface SharedEntityHooks {
  /** Create the local object for a record; return its local id (null: nothing to show). */
  spawn(record: SharedEntityRecord): string | null | Promise<string | null>
  /** Remove the local object (the entity is gone, or the room was left). */
  despawn(record: SharedEntityRecord, localId: string): void
  /** Driver or rest pose changed (also called once after spawn). */
  changed?(record: SharedEntityRecord, localId: string | null): void
  /** The entity was removed by `by` (e.g. an item picked up); called before `despawn`. */
  removed?(record: SharedEntityRecord, by: string | null): void
}

interface Local {
  record: SharedEntityRecord
  localId: string | null
  /** Set while placing; snapshots buffer meanwhile. */
  pending: boolean
  remote: RemoteVehicle
  /** Rest pose last applied while nobody drives (kinematic hold). */
  rested: string
  /** True while {@link SharedEntities.update} holds the local object kinematic at rest. */
  held: boolean
  gone: boolean
}

/** Client side of the shared entity list; SnapshotSync owns one when given `shared` hooks. */
export class SharedEntities {
  private readonly entities = new Map<string, Local>()
  /** Local objects this client published, by entity id, until the relay's record arrives. */
  private readonly published = new Map<string, string>()
  private sequence = 0
  self: string | null = null

  constructor(
    private readonly hooks: SharedEntityHooks,
    private readonly host: KinematicHost,
    private readonly send: (kind: string, data: NetEventData) => boolean,
    private readonly interpolation: InterpolationOptions = defaultInterpolation,
  ) {}

  /** All known records. */
  list(): SharedEntityRecord[] {
    return [...this.entities.values()].filter((e) => !e.gone).map((e) => e.record)
  }
  get(id: string): SharedEntityRecord | null {
    const e = this.entities.get(id)
    return e && !e.gone ? e.record : null
  }
  localIdOf(id: string): string | null {
    return this.entities.get(id)?.localId ?? this.published.get(id) ?? null
  }
  /** Shared entity whose local object is `localId`, or null. */
  idOfLocal(localId: string): string | null {
    for (const [id, e] of this.entities) if (e.localId === localId && !e.gone) return id
    for (const [id, local] of this.published) if (local === localId) return id
    return null
  }
  /** True when this client is the driver (physics authority) of `id`. */
  drives(id: string): boolean {
    return !!this.self && this.entities.get(id)?.record.driver === this.self
  }

  /**
   * Publish a local object as a new shared entity (`drive`: we hold it and stream it). `id` may
   * be given for objects every client already has (same id = the second publish is a claim);
   * by default it is `<peer>.<n>`. Returns the entity id, or null while not joined.
   */
  publish(
    type: string,
    params: EntityParams,
    pose: { position: Vec3Tuple; rotation: QuatTuple },
    localId: string | null,
    options: { drive?: boolean; id?: string } = {},
  ): string | null {
    if (!this.self) return null
    const id = options.id ?? `${this.self}.${++this.sequence}`
    if (!ID.test(id)) throw new Error(`Invalid shared entity id ${id}`)
    const data = encodeEntity({ id, type, params, ...pose })
    if (options.drive) data.d = 1
    if (!this.send(ENTITY_SPAWN, data)) return null
    if (localId) this.published.set(id, localId)
    return id
  }
  /** Ask to drive `id` (granted when nobody else does). Local physics is ours at once. */
  claim(id: string): boolean {
    const e = this.entities.get(id)
    if (!e || !this.self) return false
    if (e.record.driver && e.record.driver !== this.self) return false
    e.record = { ...e.record, driver: this.self }
    this.unhold(e)
    // Our own physics now; the rest pose is held again after the next release.
    e.rested = ''
    e.remote.release()
    e.remote = new RemoteVehicle(e.localId, this.host, this.interpolation)
    return this.send(ENTITY_CLAIM, { i: id })
  }
  /** Stop driving `id`; it rests at `pose` for everyone. */
  release(id: string, pose?: { position: Vec3Tuple; rotation: QuatTuple }): boolean {
    const e = this.entities.get(id)
    if (!e || !this.drives(id)) return false
    e.record = { ...e.record, driver: null, ...(pose ?? {}) }
    return this.send(ENTITY_RELEASE, {
      i: id,
      ...(pose ? { p: fix(pose.position, 3), q: fix(pose.rotation, 4) } : {}),
    })
  }
  /** Ask the relay to remove `id` (first request wins; `removed` names who). */
  remove(id: string): boolean {
    return !!this.entities.get(id) && this.send(ENTITY_DESPAWN, { i: id })
  }

  /** Full list from `welcome`: entities not in it are removed. */
  reset(records: SharedEntityRecord[]): void {
    const keep = new Set(records.map((r) => r.id))
    for (const id of [...this.entities.keys()]) if (!keep.has(id)) this.drop(id, null)
    for (const record of records) this.apply(record)
  }
  /** Relay event (ENTITY_EVENT or ENTITY_GONE_EVENT); false when it is not one. */
  receive(kind: string, data: NetEventData): boolean {
    if (kind === ENTITY_GONE_EVENT) {
      if (typeof data.i === 'string') this.drop(data.i, typeof data.b === 'string' ? data.b : null)
      return true
    }
    if (kind !== ENTITY_EVENT) return false
    const record = decodeEntity(data)
    if (record) this.apply(record)
    return true
  }
  /** Driver snapshot for entity `id`. */
  push(id: string, t: number, state: EntityState, receivedAt: number, extra?: SnapshotExtra): void {
    const e = this.entities.get(id)
    if (!e || e.gone || this.drives(id)) return
    e.remote.push(t, state, receivedAt, extra)
  }
  /** Per frame: interpolate entities driven by others; hold undriven ones at rest. */
  update(now: number): void {
    for (const [id, e] of this.entities) {
      if (e.gone || e.localId === null || this.drives(id)) continue
      if (e.record.driver) {
        e.remote.update(now)
        continue
      }
      const key = `${e.record.position}|${e.record.rotation}`
      if (e.rested === key) continue
      try {
        if (!this.host.setEntityKinematic(e.localId, true)) continue
        this.host.moveKinematicEntity(
          e.localId,
          { position: e.record.position, rotation: e.record.rotation },
          [0, 0, 0],
          [0, 0, 0],
        )
      } catch {
        // Not a physics object (e.g. a ground item): nothing to hold.
      }
      e.rested = key
      e.held = true
    }
  }
  /** Give a held rest pose back to physics (a claimed vehicle must drive, not stay kinematic). */
  private unhold(e: Local): void {
    if (!e.held) return
    e.held = false
    if (e.localId === null) return
    try {
      this.host.setEntityKinematic(e.localId, false)
    } catch {
      // Not a physics object: nothing was held.
    }
  }
  /** Extras (lights…) last received for entities driven by others, by local id. */
  extras(): [string, SnapshotExtra][] {
    const out: [string, SnapshotExtra][] = []
    for (const [id, e] of this.entities)
      if (e.localId && e.remote.extra && !this.drives(id)) out.push([e.localId, e.remote.extra])
    return out
  }
  /** Leave the room: every local object goes. */
  clear(): void {
    for (const id of [...this.entities.keys()]) this.drop(id, null)
    this.published.clear()
  }

  private apply(record: SharedEntityRecord): void {
    let e = this.entities.get(record.id)
    if (e?.gone) return
    if (!e) {
      const localId = this.published.get(record.id) ?? null
      this.published.delete(record.id)
      e = {
        record,
        localId,
        pending: !localId,
        remote: new RemoteVehicle(localId, this.host, this.interpolation),
        rested:
          localId && record.driver === this.self ? `${record.position}|${record.rotation}` : '',
        held: false,
        gone: false,
      }
      this.entities.set(record.id, e)
      if (!localId) this.place(e)
      else this.hooks.changed?.(record, localId)
      return
    }
    const was = e.record.driver
    e.record = record
    if (record.driver !== was) {
      if (record.driver) this.unhold(e)
      e.remote.release()
      e.remote = new RemoteVehicle(e.localId, this.host, this.interpolation)
      // Rest pose applies again once nobody drives.
      e.rested = record.driver === this.self ? `${record.position}|${record.rotation}` : ''
    } else if (!record.driver) e.rested = ''
    this.hooks.changed?.(record, e.localId)
  }

  private place(e: Local): void {
    const done = (localId: string | null) => {
      e.pending = false
      if (e.gone || this.entities.get(e.record.id) !== e) {
        if (localId) this.hooks.despawn(e.record, localId)
        return
      }
      e.localId = localId
      e.remote.entityId = localId
      this.hooks.changed?.(e.record, localId)
    }
    try {
      const result = this.hooks.spawn(e.record)
      if (result instanceof Promise)
        result.then(done, (error) => {
          console.warn('[nabla/net] could not spawn shared entity', e.record.id, error)
          done(null)
        })
      else done(result)
    } catch (error) {
      console.warn('[nabla/net] could not spawn shared entity', e.record.id, error)
      done(null)
    }
  }

  private drop(id: string, by: string | null): void {
    const e = this.entities.get(id)
    this.published.delete(id)
    if (!e) return
    e.gone = true
    this.entities.delete(id)
    e.remote.release()
    this.hooks.removed?.(e.record, by)
    if (e.localId) this.hooks.despawn(e.record, e.localId)
  }
}
