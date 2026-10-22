/**
 * Bounded wire schema of {@link GameAuthority} requests, shared by RelayAuthority (encodes them
 * as relay events) and LocalAuthority (validates the same shapes in-process), so single player
 * and multiplayer accept exactly the same requests. See docs/net.md.
 */
import { z } from 'zod'
import { ENTITY_CLAIM, ENTITY_DESPAWN, ENTITY_RELEASE, ENTITY_SPAWN } from './shared-entities.js'
import { FIRE_EVENT, HIT_EVENT } from './protocol.js'

const finite = z.number().finite()
export const AUTHORITY_ID = z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/)
const vec3 = z.tuple([finite.min(-1e6).max(1e6), finite.min(-1e6).max(1e6), finite.min(-1e6).max(1e6)])
const quat = z.tuple([finite.min(-1).max(1), finite.min(-1).max(1), finite.min(-1).max(1), finite.min(-1).max(1)])
const unit = z.tuple([finite.min(-1.001).max(1.001), finite.min(-1.001).max(1.001), finite.min(-1.001).max(1.001)])
const pose = z.object({ position: vec3, rotation: quat })

/** Relay event kind of each request (pickup/drop reuse the shared entity protocol). */
export const AUTHORITY_KIND = {
  pickup: ENTITY_DESPAWN,
  drop: ENTITY_SPAWN,
  fire: FIRE_EVENT,
  hit: HIT_EVENT,
  reload: 'reload',
  claim: ENTITY_CLAIM,
  release: ENTITY_RELEASE,
} as const

export const authorityRequestSchema = z.discriminatedUnion('type', [
  /** Take a ground item (shared entity id); the authority grants it to exactly one player. */
  z.object({ type: z.literal('pickup'), item: AUTHORITY_ID }),
  /** Put an item on the ground: `item` the game's item type, `count` 1..999. */
  z.object({ type: z.literal('drop'), item: AUTHORITY_ID, count: z.number().int().min(1).max(999), position: vec3 }),
  /** A shot leaving a weapon (presentation): weapon slot, kind, origin, unit direction. */
  z.object({
    type: z.literal('fire'),
    slot: z.number().int().min(0).max(63),
    kind: z.number().int().min(0).max(15),
    origin: vec3,
    direction: unit,
  }),
  /** The shooter's hit report; the authority applies damage (0..400) and announces health. */
  z.object({
    type: z.literal('hit'),
    target: AUTHORITY_ID,
    damage: finite.min(0).max(400),
    zone: z.string().min(1).max(16).optional(),
    direction: unit.optional(),
  }),
  /** Reload the weapon in `slot` (ammo stays the owner's; announced for presentation). */
  z.object({ type: z.literal('reload'), slot: z.number().int().min(0).max(63) }),
  /** Take the wheel of a shared vehicle. */
  z.object({ type: z.literal('claim'), entity: AUTHORITY_ID }),
  /** Leave a shared vehicle, at rest at `pose`. */
  z.object({ type: z.literal('release'), entity: AUTHORITY_ID, pose: pose.optional() }),
])
export type AuthorityRequest = z.infer<typeof authorityRequestSchema>

/** Validate a request (null when malformed or out of bounds). */
export function parseAuthorityRequest(value: unknown): AuthorityRequest | null {
  const r = authorityRequestSchema.safeParse(value)
  return r.success ? r.data : null
}
