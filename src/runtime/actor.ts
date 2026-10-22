/**
 * Player actor: which robot body the local player wears and, for the default body, its colour.
 * Chosen in Settings → Options → Actor, kept in localStorage and applied live with
 * {@link GameRuntime.setActor} (no reload). Config lives here, in code; hosts that are head-only
 * (the Euskadi home) hide the section with `data-settings-hidden="settings-actor"`.
 */
import type { PlayerBodyAssets } from '../render/entity/player-body.js'

/**
 * Gepeto's prota v3 with belt, holster (holstered USP) and baton: the solid "low" variant, whose
 * colour slots take the actor choice (the textured `.v3.glb` files ship alongside, not wired).
 */
const PROTA = '/avatar/prota/prota'
const ANIMATIONS = '/avatar/avatar.anims.glb'

export const ACTOR_KINDS = ['default', 'polibot'] as const
export type ActorKind = (typeof ACTOR_KINDS)[number]

/** Default body colours (the `primary` colour slot); `white` keeps the authored look. */
export const ACTOR_COLORS = {
  white: '#e8e8e8',
  black: '#1c1c1e',
  red: '#c62828',
  blue: '#1e5bd8',
  green: '#2e7d32',
  orange: '#ef6c00',
} as const
export type ActorColor = keyof typeof ACTOR_COLORS
export const ACTOR_COLOR_NAMES = Object.keys(ACTOR_COLORS) as ActorColor[]

export interface ActorChoice {
  kind: ActorKind
  /** Default body only; ignored for the other actors. */
  color: ActorColor
}

export const DEFAULT_ACTOR: ActorChoice = { kind: 'default', color: 'white' }
export const ACTOR_STORAGE_KEY = 'nabla.actor'

/** Body assets of each actor (same mixamorig skeleton and clips, 1.70 m). */
export function actorBodyAssets(choice: ActorChoice): PlayerBodyAssets {
  if (choice.kind === 'polibot')
    // Polibot (Gepeto, from policia.v3): white robot with HeadSocket and WeaponSocket_R, no belt kit.
    return { model: '/avatar/polibot/polibot.glb', animations: ANIMATIONS }
  return {
    model: `${PROTA}.v3.low.glb`,
    animations: ANIMATIONS,
    attachments: [
      { model: `${PROTA}.belt.v3.low.glb`, socket: 'BeltSocket' },
      { model: `${PROTA}.holster.v4.low.glb`, socket: 'HolsterSocket' },
      { model: `${PROTA}.holster-usp.glb`, socket: 'HolsterGunSocket', role: 'holstered' },
      { model: `${PROTA}.baton.v3.low.glb`, socket: 'BatonSocket' },
    ],
    ...(choice.color === 'white' ? {} : { colors: { primary: ACTOR_COLORS[choice.color] } }),
  }
}

/** A choice from anything (stored JSON, a peer's profile string); unknown parts fall back. */
export function parseActor(value: unknown): ActorChoice {
  let raw: unknown = value
  if (typeof value === 'string') {
    const [kind, color] = value.split(':')
    raw = { kind, color }
  }
  const o = (raw ?? {}) as Partial<Record<keyof ActorChoice, unknown>>
  const kind = ACTOR_KINDS.includes(o.kind as ActorKind) ? (o.kind as ActorKind) : DEFAULT_ACTOR.kind
  const color = ACTOR_COLOR_NAMES.includes(o.color as ActorColor) ? (o.color as ActorColor) : DEFAULT_ACTOR.color
  return { kind, color }
}

/** The profile string other players get (`kind:color`, e.g. `default:red`, `polibot:white`). */
export function actorProfile(choice: ActorChoice): string {
  return `${choice.kind}:${choice.color}`
}

export function loadActor(storage: Pick<Storage, 'getItem'> | null = safeStorage()): ActorChoice {
  try {
    const saved = storage?.getItem(ACTOR_STORAGE_KEY)
    return saved ? parseActor(saved) : DEFAULT_ACTOR
  } catch {
    return DEFAULT_ACTOR
  }
}

export function saveActor(choice: ActorChoice, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(ACTOR_STORAGE_KEY, actorProfile(choice))
  } catch {
    // Private mode / no storage: the choice lasts for the session.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
