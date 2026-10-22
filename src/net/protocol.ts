/**
 * Wire protocol shared by the browser session and the room relay (services/relay).
 * Messages are JSON text frames. The relay only routes them; it stamps `peer` on forwarded
 * messages so a client cannot impersonate another peer.
 */
import { z } from 'zod'
import type { QuatTuple, Vec3Tuple } from '../math/frame/vectors.js'

export const PROTOCOL_VERSION = 1

const finite = z.number().finite()
const vec3 = z.tuple([finite, finite, finite])
const quat = z.tuple([finite, finite, finite, finite])
const peerId = z.string().min(1).max(64)
const roomId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
/** Free-form, small, game-defined description of a peer (for example its vehicle preset). */
const meta = z.record(z.string(), z.union([z.string().max(128), finite, z.boolean()])).default({})

const perWheel = z.array(finite).max(16)
/**
 * Optional per-wheel look of a wheeled vehicle: steer angle (rad), suspension length (m) and
 * spin rate (rad/s). Quantised before sending (see `quantizeWheels`).
 */
export const wheelVisualsSchema = z.object({
  steer: perWheel,
  suspension: perWheel,
  spinRate: perWheel,
})
export type WheelVisuals = { steer: number[]; suspension: number[]; spinRate: number[] }

/** Rigid-body state of one networked entity, in simulation metres and seconds. */
export const entityStateSchema = z.object({
  position: vec3,
  rotation: quat,
  velocity: vec3,
  angularVelocity: vec3,
  wheels: wheelVisualsSchema.optional(),
})
export type EntityState = {
  position: Vec3Tuple
  rotation: QuatTuple
  velocity: Vec3Tuple
  angularVelocity: Vec3Tuple
  wheels?: WheelVisuals
}

const round = (value: number, step: number) => Math.round(value / step) * step
/**
 * Round wheel values to what the eye can tell apart (1 mrad steer, 1 mm suspension, 0.1 rad/s
 * spin) so a four-wheel car adds roughly 80 bytes of JSON per snapshot.
 */
export function quantizeWheels(wheels: WheelVisuals): WheelVisuals {
  const fix = (values: number[], step: number, digits: number) =>
    values.map((v) => +round(v, step).toFixed(digits))
  return {
    steer: fix(wheels.steer, 0.001, 3),
    suspension: fix(wheels.suspension, 0.001, 3),
    spinRate: fix(wheels.spinRate, 0.1, 1),
  }
}

/**
 * Small game-defined values sent with a snapshot and applied as-is (not interpolated), e.g. a
 * lights bitfield. At most 16 keys.
 */
const extra = z
  .record(z.string().max(32), z.union([finite, z.boolean(), z.string().max(64)]))
  .refine((value) => Object.keys(value).length <= 16)
export type SnapshotExtra = Record<string, number | boolean | string>
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)

/** Game event payload: up to 16 small values; arrays carry vectors (at most 4 numbers). */
const eventData = z
  .record(
    z.string().max(32),
    z.union([finite, z.boolean(), z.string().max(64), z.array(finite).max(4)]),
  )
  .refine((value) => Object.keys(value).length <= 16)
export type NetEventData = Record<string, number | boolean | string | number[]>
const eventKind = z.string().regex(/^[A-Za-z0-9_.-]{1,32}$/)

/**
 * Character damage over the relay (generic; see docs/combat.md). The shooter sends `hit`
 * (`t` target peer, `z` zone, `w` weapon id, `d` damage, `o` origin, `r` unit direction, `p`
 * entry point; all but `t` and `d` optional). The relay owns health and sends, from
 * {@link RELAY_PEER}: `health` (`t`, `h` health, optional `z`, `r`, `s` shooter), `death` (`t`,
 * optional `r`) and `respawn` (`t`, optional `p` feet position). Old relays forward `hit` as a
 * plain event, which clients ignore.
 */
export const HIT_EVENT = 'hit'
export const HEALTH_EVENT = 'health'
export const DEATH_EVENT = 'death'
export const RESPAWN_EVENT = 'respawn'
/** `peer` of events the relay itself sends. */
export const RELAY_PEER = 'relay'
const v3 = (v: unknown): Vec3Tuple | undefined =>
  Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n))
    ? ([v[0], v[1], v[2]] as Vec3Tuple)
    : undefined
const str = (v: unknown, max = 64): string | undefined =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined
export interface NetHit {
  targetId: string
  damage: number
  zone?: string
  weapon?: string
  origin?: Vec3Tuple
  direction?: Vec3Tuple
  point?: Vec3Tuple
}
export function encodeHit(hit: NetHit): NetEventData {
  const fix = (v: Vec3Tuple, digits: number) => v.map((n) => +n.toFixed(digits))
  return {
    t: hit.targetId,
    d: Math.max(0, Math.min(400, Math.round(hit.damage))),
    ...(hit.zone ? { z: hit.zone } : {}),
    ...(hit.weapon ? { w: hit.weapon } : {}),
    ...(hit.origin ? { o: fix(hit.origin, 2) } : {}),
    ...(hit.direction ? { r: fix(hit.direction, 3) } : {}),
    ...(hit.point ? { p: fix(hit.point, 2) } : {}),
  }
}
export function decodeHit(data: NetEventData): NetHit | null {
  const targetId = str(data.t)
  const damage = data.d
  if (!targetId || typeof damage !== 'number' || !(damage >= 0 && damage <= 400)) return null
  return {
    targetId,
    damage,
    zone: str(data.z, 16),
    weapon: str(data.w),
    origin: v3(data.o),
    direction: v3(data.r),
    point: v3(data.p),
  }
}
export interface NetHealth {
  targetId: string
  health: number
  zone?: string
  direction?: Vec3Tuple
  shooterId?: string
  position?: Vec3Tuple
}
/** Decode a relay `health`, `death` or `respawn` event (null when malformed). */
export function decodeHealthEvent(data: NetEventData): NetHealth | null {
  const targetId = str(data.t)
  if (!targetId) return null
  const health = typeof data.h === 'number' && Number.isFinite(data.h) ? data.h : 0
  return {
    targetId,
    health,
    zone: str(data.z, 16),
    direction: v3(data.r),
    shooterId: str(data.s),
    position: v3(data.p),
  }
}

/** Event kind of {@link fireEventSchema}. */
export const FIRE_EVENT = 'fire'
/**
 * A shot or arrow leaving a weapon (event kind `fire`): `w` the game's weapon slot (0 none), `k`
 * a game-defined weapon kind index, `o` the origin (muzzle, arrow rest; scene metres, 1 cm), `d`
 * the unit direction (1/1000) and optionally `r` the trace length (m) or `s` the launch speed
 * (m/s). Presentation only: hits and damage are not part of it.
 */
export const fireEventSchema = z.object({
  w: z.number().int().min(0).max(63),
  k: z.number().int().min(0).max(15),
  o: z.array(finite.min(-1e6).max(1e6)).length(3),
  d: z.array(finite.min(-1.001).max(1.001)).length(3),
  r: finite.min(0).max(5000).optional(),
  s: finite.min(0).max(500).optional(),
})
export type FireEvent = z.infer<typeof fireEventSchema>

export interface FireSample {
  slot: number
  kind: number
  origin: Vec3Tuple
  direction: Vec3Tuple
  range?: number
  speed?: number
}

/** Wire form of a fire event: 1 cm origin, unit direction to 1/1000. */
export function quantizeFire(fire: FireSample): FireEvent {
  const fix = (v: number, digits: number) => +v.toFixed(digits)
  const n = Math.hypot(...fire.direction) || 1
  return {
    w: Math.max(0, Math.min(63, Math.round(fire.slot))),
    k: Math.max(0, Math.min(15, Math.round(fire.kind))),
    o: fire.origin.map((v) => fix(v, 2)),
    d: fire.direction.map((v) => fix(v / n, 3)),
    ...(fire.range !== undefined ? { r: fix(Math.min(5000, Math.max(0, fire.range)), 2) } : {}),
    ...(fire.speed !== undefined ? { s: fix(Math.min(500, Math.max(0, fire.speed)), 2) } : {}),
  }
}

/** A received fire event, or null when it is not one (bad or out-of-range data). */
export function decodeFire(data: unknown): FireSample | null {
  const parsed = fireEventSchema.safeParse(data)
  if (!parsed.success) return null
  const f = parsed.data
  const n = Math.hypot(f.d[0], f.d[1], f.d[2])
  if (!(n > 0.5)) return null
  return {
    slot: f.w,
    kind: f.k,
    origin: [f.o[0], f.o[1], f.o[2]],
    direction: [f.d[0] / n, f.d[1] / n, f.d[2] / n],
    ...(f.r !== undefined ? { range: f.r } : {}),
    ...(f.s !== undefined ? { speed: f.s } : {}),
  }
}

/**
 * Optional on-foot body of the sender (compact keys, quantised by {@link quantizeAvatar}):
 * `p` feet position in scene metres, `y` heading in radians (0 faces −Z), `s` horizontal speed
 * in m/s and `a` a game-defined animation index (the game keeps the name table). Optional `w` is
 * a game-defined held-item index (0 or absent: empty hands); older clients leave it out.
 * Optional character state (see `@nabla/engine/character`): `i` stored stacks as [slot, item,
 * count] (count −1 infinite), `h` item index in each hand [left, right] (0 empty) and `v` the aim
 * [yaw, pitch] in radians while something is held (yaw as `y`, pitch up positive).
 */
export const avatarBlockSchema = z.object({
  p: vec3,
  y: finite,
  s: finite.nonnegative(),
  a: z.number().int().min(0).max(63),
  w: z.number().int().min(0).max(63).optional(),
  i: z
    .array(
      z.tuple([
        z.number().int().min(0).max(63),
        z.number().int().min(1).max(63),
        z.number().int().min(-1).max(9999),
      ]),
    )
    .max(32)
    .optional(),
  h: z.tuple([z.number().int().min(0).max(63), z.number().int().min(0).max(63)]).optional(),
  v: z.tuple([finite.min(-3.2).max(3.2), finite.min(-1.6).max(1.6)]).optional(),
  /** Held item pose in body space: grip position (m, 1 cm) and quaternion (1e-3). */
  g: z
    .tuple([
      finite.min(-3).max(3),
      finite.min(-3).max(3),
      finite.min(-3).max(3),
      finite.min(-1.001).max(1.001),
      finite.min(-1.001).max(1.001),
      finite.min(-1.001).max(1.001),
      finite.min(-1.001).max(1.001),
    ])
    .optional(),
})
export type AvatarBlock = z.infer<typeof avatarBlockSchema>

/** Decoded on-foot body sample (see {@link avatarBlockSchema}). */
export interface AvatarSample {
  position: Vec3Tuple
  yaw: number
  speed: number
  anim: number
  /** Game-defined held-item index; 0 (or absent) is empty hands. */
  weapon?: number
  /** Character inventory in its wire form (stored stacks, item in each hand). */
  inventory?: { i: [number, number, number][]; h: [number, number] }
  /** Aim [yaw, pitch] in radians while something is held. */
  aim?: [number, number]
  /** Held item pose in body space (see render/entity/held-pose.ts). */
  held?: { position: Vec3Tuple; quaternion: [number, number, number, number] }
}

/** Angle wrapped to (−π, π]. */
export function wrapAngle(angle: number): number {
  const turn = Math.PI * 2
  const wrapped = angle - turn * Math.floor((angle + Math.PI) / turn)
  return wrapped === -Math.PI ? Math.PI : wrapped
}

/** Wire form of an avatar sample: 1 cm position, 1 mrad yaw (wrapped), 1 cm/s speed. */
export function quantizeAvatar(sample: AvatarSample): AvatarBlock {
  const fix = (v: number, digits: number) => +v.toFixed(digits)
  return {
    p: [fix(sample.position[0], 2), fix(sample.position[1], 2), fix(sample.position[2], 2)],
    y: fix(wrapAngle(sample.yaw), 3),
    s: fix(Math.max(0, sample.speed), 2),
    a: Math.max(0, Math.min(63, Math.round(sample.anim))),
    ...(sample.weapon ? { w: Math.max(0, Math.min(63, Math.round(sample.weapon))) } : {}),
    ...(sample.inventory
      ? { i: sample.inventory.i.slice(0, 32), h: sample.inventory.h }
      : {}),
    ...(sample.aim
      ? {
          v: [
            fix(wrapAngle(sample.aim[0]), 3),
            fix(Math.max(-1.57, Math.min(1.57, sample.aim[1])), 3),
          ] as [number, number],
        }
      : {}),
    ...(sample.held ? { g: quantizeHeld(sample.held) } : {}),
  }
}

function quantizeHeld(held: NonNullable<AvatarSample['held']>): AvatarBlock['g'] {
  const c = (v: number, m: number) => Math.max(-m, Math.min(m, v))
  const [x, y, z, w] = held.quaternion
  const n = Math.hypot(x, y, z, w) || 1
  return [
    +c(held.position[0], 3).toFixed(2),
    +c(held.position[1], 3).toFixed(2),
    +c(held.position[2], 3).toFixed(2),
    +(x / n).toFixed(3),
    +(y / n).toFixed(3),
    +(z / n).toFixed(3),
    +(w / n).toFixed(3),
  ]
}

export function decodeAvatar(block: AvatarBlock): AvatarSample {
  return {
    position: [block.p[0], block.p[1], block.p[2]],
    yaw: block.y,
    speed: block.s,
    anim: block.a,
    weapon: block.w ?? 0,
    ...(block.i || block.h ? { inventory: { i: block.i ?? [], h: block.h ?? [0, 0] } } : {}),
    ...(block.v ? { aim: [block.v[0], block.v[1]] as [number, number] } : {}),
    ...(block.g
      ? {
          held: {
            position: [block.g[0], block.g[1], block.g[2]] as Vec3Tuple,
            quaternion: [block.g[3], block.g[4], block.g[5], block.g[6]] as [number, number, number, number],
          },
        }
      : {}),
  }
}

/**
 * Snapshot of one sender: the rigid body it drives (`state`), its on-foot body (`avatar`), or
 * both. Protocol 1 stays: `avatar` is additive, a state-less (on-foot only) snapshot is simply
 * dropped by older relays and clients.
 */
export const snapshotSchema = z.object({
  type: z.literal('snapshot'),
  /** Sender clock in milliseconds; only differences between one sender's samples matter. */
  t: finite,
  seq: z.number().int().nonnegative(),
  state: entityStateSchema.optional(),
  avatar: avatarBlockSchema.optional(),
  extra: extra.optional(),
  peer: peerId.optional(),
})
export type SnapshotMessage = z.infer<typeof snapshotSchema>

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), version: z.literal(PROTOCOL_VERSION), room: roomId, meta }),
  snapshotSchema,
  /** One-off game event (e.g. a shot), relayed to the room with the sender stamped. */
  z.object({ type: z.literal('event'), kind: eventKind, data: eventData }),
  /** Replace this peer's `meta` (e.g. it changed vehicle); relayed to the room as `profile`. */
  z.object({ type: z.literal('profile'), meta }),
  z.object({ type: z.literal('leave') }),
])
export type ClientMessage = z.input<typeof clientMessageSchema>

/** `slot` and `color` are assigned by the relay per room (first free entry of its palette). */
const peerInfo = z.object({
  peer: peerId,
  meta,
  slot: z.number().int().nonnegative().optional(),
  color: color.optional(),
})
export type PeerInfo = z.infer<typeof peerInfo>

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('welcome'),
    peer: peerId,
    room: roomId,
    peers: z.array(peerInfo),
    slot: z.number().int().nonnegative().optional(),
    color: color.optional(),
    /** Health per peer from the relay's ledger (combat; absent on older relays). */
    health: z.record(peerId, z.number().min(0).max(10000)).optional(),
  }),
  peerInfo.extend({ type: z.literal('joined') }),
  z.object({ type: z.literal('left'), peer: peerId }),
  z.object({ type: z.literal('profile'), peer: peerId, meta }),
  z.object({ type: z.literal('event'), peer: peerId, kind: eventKind, data: eventData }),
  snapshotSchema.extend({ peer: peerId }),
  z.object({ type: z.literal('error'), message: z.string() }),
])
export type ServerMessage = z.infer<typeof serverMessageSchema>

export function encodeMessage(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message)
}

/** Parse a relay frame; malformed or unknown frames return null instead of throwing. */
export function decodeServerMessage(data: string): ServerMessage | null {
  try {
    const parsed = serverMessageSchema.safeParse(JSON.parse(data))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** True when `room` is usable as a relay room id (letters, digits, `_` and `-`). */
export function isValidRoom(room: string): boolean {
  return roomId.safeParse(room).success
}
