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

/** Rigid-body state of one networked entity, in simulation metres and seconds. */
export const entityStateSchema = z.object({
  position: vec3,
  rotation: quat,
  velocity: vec3,
  angularVelocity: vec3,
})
export type EntityState = {
  position: Vec3Tuple
  rotation: QuatTuple
  velocity: Vec3Tuple
  angularVelocity: Vec3Tuple
}

export const snapshotSchema = z.object({
  type: z.literal('snapshot'),
  /** Sender clock in milliseconds; only differences between one sender's samples matter. */
  t: finite,
  seq: z.number().int().nonnegative(),
  state: entityStateSchema,
  peer: peerId.optional(),
})
export type SnapshotMessage = z.infer<typeof snapshotSchema>

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), version: z.literal(PROTOCOL_VERSION), room: roomId, meta }),
  snapshotSchema,
  z.object({ type: z.literal('leave') }),
])
export type ClientMessage = z.input<typeof clientMessageSchema>

const peerInfo = z.object({ peer: peerId, meta })
export type PeerInfo = z.infer<typeof peerInfo>

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('welcome'), peer: peerId, room: roomId, peers: z.array(peerInfo) }),
  z.object({ type: z.literal('joined'), peer: peerId, meta }),
  z.object({ type: z.literal('left'), peer: peerId }),
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
