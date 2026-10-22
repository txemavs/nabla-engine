/**
 * Character damage rules, pure and shared by every side (local game, shooter, relay):
 * 100 hit points, damage = weapon base × hit-zone multiplier, death at 0, respawn after
 * {@link RESPAWN_DELAY_S}. Hit zones are data ({@link HIT_ZONES}): each names the skeleton
 * bones it covers by the body asset contract (mixamorig bone names, any prefix), so any body
 * on that skeleton gets the same volumes without per-body code. See docs/combat.md.
 */

export const MAX_HEALTH = 100
export const RESPAWN_DELAY_S = 5

export type HitZoneId = 'head' | 'neck' | 'torso' | 'arm' | 'leg'

export interface HitZoneSpec {
  id: HitZoneId
  /** Damage multiplier on the weapon's base damage. */
  multiplier: number
  /** Bone names (prefix such as `mixamorig:` removed) whose capsule belongs to the zone. */
  bones: RegExp
  /** Capsule radius around the bone segment, m. */
  radius: number
}

/** Zone table, most specific first (a bone takes the first zone that names it). */
export const HIT_ZONES: readonly HitZoneSpec[] = [
  { id: 'head', multiplier: 4, bones: /^Head$/, radius: 0.11 },
  { id: 'neck', multiplier: 2.5, bones: /^Neck$/, radius: 0.065 },
  { id: 'torso', multiplier: 1, bones: /^(Hips|Spine\d?)$/, radius: 0.15 },
  { id: 'arm', multiplier: 0.6, bones: /^(Left|Right)(Shoulder|Arm|ForeArm|Hand)$/, radius: 0.055 },
  { id: 'leg', multiplier: 0.75, bones: /^(Left|Right)(UpLeg|Leg|Foot)$/, radius: 0.075 },
]

/** Bone name without its rig prefix (`mixamorig:Head`, `mixamorigHead` → `Head`). */
export function boneBaseName(name: string): string {
  return name.replace(/^.*[:|]/, '').replace(/^mixamorig\d*_?/, '')
}

/** The zone a bone belongs to, or null (fingers, toes, end bones). */
export function zoneOfBone(name: string): HitZoneSpec | null {
  const base = boneBaseName(name)
  return HIT_ZONES.find((zone) => zone.bones.test(base)) ?? null
}

export function zoneMultiplier(zone: HitZoneId): number {
  return HIT_ZONES.find((entry) => entry.id === zone)?.multiplier ?? 1
}

/** Damage of one hit, whole points. */
export function zoneDamage(base: number, zone: HitZoneId): number {
  return Math.max(0, Math.round(base * zoneMultiplier(zone)))
}

/** Base damage when a preset has no `damage`: by kind (firearm presets have no kind). */
export const DEFAULT_BASE_DAMAGE = { firearm: 20, bow: 35, melee: 30, prop: 0, placeholder: 0 }

/** A preset's base damage: its own `damage`, else the kind default. */
export function weaponBaseDamage(preset: { damage?: number; kind?: string }): number {
  if (preset.damage !== undefined) return preset.damage
  const kind = (preset.kind ?? 'firearm') as keyof typeof DEFAULT_BASE_DAMAGE
  return DEFAULT_BASE_DAMAGE[kind] ?? 0
}

export interface HealthState {
  health: number
  dead: boolean
  /** Seconds (caller's clock) when it died; null while alive. */
  diedAt: number | null
}

export interface DamageResult {
  health: number
  /** True on the hit that killed. */
  died: boolean
  /** Points actually removed. */
  dealt: number
}

/**
 * Who has how much health: the authority's book (the offline game, or the relay online).
 * Hits on the dead are ignored; {@link due} lists who should respawn now.
 */
export class HealthLedger {
  private readonly states = new Map<string, HealthState>()
  constructor(
    readonly maxHealth = MAX_HEALTH,
    readonly respawnDelay = RESPAWN_DELAY_S,
  ) {}
  get(id: string): HealthState {
    let state = this.states.get(id)
    if (!state) this.states.set(id, (state = { health: this.maxHealth, dead: false, diedAt: null }))
    return state
  }
  has(id: string): boolean {
    return this.states.has(id)
  }
  remove(id: string): void {
    this.states.delete(id)
  }
  damage(id: string, points: number, now: number): DamageResult {
    const state = this.get(id)
    if (state.dead) return { health: state.health, died: false, dealt: 0 }
    const dealt = Math.min(state.health, Math.max(0, Math.round(points)))
    state.health -= dealt
    const died = state.health <= 0
    if (died) {
      state.dead = true
      state.diedAt = now
    }
    return { health: state.health, died, dealt }
  }
  /** Ids dead for at least the respawn delay at `now`. */
  due(now: number): string[] {
    return [...this.states]
      .filter(([, s]) => s.dead && s.diedAt !== null && now - s.diedAt >= this.respawnDelay)
      .map(([id]) => id)
  }
  respawn(id: string): HealthState {
    const state = this.get(id)
    state.health = this.maxHealth
    state.dead = false
    state.diedAt = null
    return state
  }
  /** Set from the authority (network): health, and dead when it reaches 0. */
  set(id: string, health: number, now: number): HealthState {
    const state = this.get(id)
    state.health = Math.max(0, Math.min(this.maxHealth, health))
    if (state.health <= 0 && !state.dead) {
      state.dead = true
      state.diedAt = now
    } else if (state.health > 0) {
      state.dead = false
      state.diedAt = null
    }
    return state
  }
  /** Every known id with its health (for a join snapshot). */
  snapshot(): Record<string, number> {
    return Object.fromEntries([...this.states].map(([id, s]) => [id, s.health]))
  }
}
