/**
 * Player actor: which robot body the local player wears and, for the default body, its colour.
 * Chosen in Settings → Options → Actor, kept in localStorage and applied live with
 * {@link GameRuntime.setActor} (no reload). Config lives here, in code; hosts that are head-only
 * (the Euskadi home) hide the section with `data-settings-hidden="settings-actor"`.
 */
import type { PlayerBodyAssets } from '../render/entity/player-body.js'

/**
 * Gepeto's prota with belt, holster (holstered USP) and baton. White keeps the authored look and
 * wears the textured v3 set (`prota.v3.glb`, 1 draw call); a colour choice wears the solid v4 low
 * body (soft colour edges) with the v3/v4 low parts, whose colour slots take the actor colour.
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

/** Prota files: textured for the authored (white) look, solid low with colour slots otherwise. */
function protaSet(choice: ActorChoice) {
  return choice.color === 'white'
    ? {
        body: `${PROTA}.v3.glb`,
        hands: `${PROTA}.hands.v3.glb`,
        belt: `${PROTA}.belt.v3.glb`,
        holster: `${PROTA}.holster.v4.glb`,
        baton: `${PROTA}.baton.v3.glb`,
      }
    : {
        body: `${PROTA}.v4.low.glb`,
        hands: `${PROTA}.hands.v4.low.glb`,
        belt: `${PROTA}.belt.v3.low.glb`,
        holster: `${PROTA}.holster.v4.low.glb`,
        baton: `${PROTA}.baton.v3.low.glb`,
      }
}

/** Body assets of each actor (same mixamorig skeleton and clips, 1.70 m). */
export function actorBodyAssets(choice: ActorChoice): PlayerBodyAssets {
  if (choice.kind === 'polibot')
    // Polibot (Gepeto, policia.v5): white robot with HeadSocket and WeaponSocket_R, no belt kit.
    return { model: '/avatar/polibot/polibot.v5.glb', animations: ANIMATIONS }
  const set = protaSet(choice)
  return {
    model: set.body,
    animations: ANIMATIONS,
    attachments: [
      { model: set.belt, socket: 'BeltSocket' },
      { model: set.holster, socket: 'HolsterSocket' },
      { model: `${PROTA}.holster-usp.glb`, socket: 'HolsterGunSocket', role: 'holstered' },
      { model: set.baton, socket: 'BatonSocket' },
    ],
    ...(choice.color === 'white' ? {} : { colors: { primary: ACTOR_COLORS[choice.color] } }),
  }
}

/** VR/AR hands of an actor: a mixamorig-skinned GLB whose hand triangles are kept. */
export interface ActorHandAssets {
  model: string
  colors?: PlayerBodyAssets['colors']
}

/**
 * Hands each actor wears in VR/AR, tinted with the same colour slot as its body. Prota has
 * Gepeto's hands-only file; Polibot has none, so its hands are cut from the body mesh (triangles
 * skinned to the hand and finger bones), see `xr-actor-hand.ts`.
 */
export function actorHandAssets(choice: ActorChoice): ActorHandAssets {
  const body = actorBodyAssets(choice)
  const model = choice.kind === 'polibot' ? body.model : protaSet(choice).hands
  return body.colors ? { model, colors: body.colors } : { model }
}

/** A choice from anything (stored JSON, a peer's profile string); unknown parts fall back. */
export function parseActor(value: unknown): ActorChoice {
  let raw: unknown = value
  if (typeof value === 'string') {
    const [kind, color] = value.split(':')
    raw = { kind, color }
  }
  const o = (raw ?? {}) as Partial<Record<keyof ActorChoice, unknown>>
  const kind = ACTOR_KINDS.includes(o.kind as ActorKind)
    ? (o.kind as ActorKind)
    : DEFAULT_ACTOR.kind
  const color = ACTOR_COLOR_NAMES.includes(o.color as ActorColor)
    ? (o.color as ActorColor)
    : DEFAULT_ACTOR.color
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

export function saveActor(
  choice: ActorChoice,
  storage: Pick<Storage, 'setItem'> | null = safeStorage(),
): void {
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
