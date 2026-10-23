/**
 * The single owner of a character's weapons: what it carries (slots, hands), which weapon is
 * drawn, whether it may fire, its rounds and reloads, and pickup / drop. Keys, VR grabs and AI
 * call the same methods; the renderer and the network only read its state ({@link onChange}).
 *
 * Shared state (ground items, who took one, health) is never decided here: the loadout sends
 * requests to its {@link GameAuthority} (net/authority) and applies what it announces. It makes no
 * relay call of its own. See docs/weapons.md.
 */
import { CharacterInventory, type Hand, type InventoryDefs, type ItemStack } from './inventory.js'
import type { AuthorityItem, GameAuthority, HealthChange, ItemChange } from '../net/authority.js'

type Vec3 = [number, number, number]

/** A weapon item type: its number key, the hand it is drawn to and its ammunition. */
export interface WeaponDef {
  type: string
  /** Number key that draws / holsters it. */
  slot: number
  hand: Hand
  /** Rounds per magazine; undefined = the loadout does not count rounds. */
  magazine?: number
  /** Item type a reload consumes (one per reload); undefined = reloads are free. */
  ammo?: string
}

export type FireRefusal = 'unarmed' | 'holstered' | 'not-a-firearm' | 'empty' | 'dead'
export type FireVerdict = { ok: true; weapon: string } | { ok: false; reason: FireRefusal }
export type LoadoutResult = { ok: true } | { ok: false; reason: string }

export interface WeaponLoadoutOptions {
  /** Name of the character's inventory (default `player`); its authority id is `authority.self`. */
  characterId?: string
  inventory: InventoryDefs
  weapons: readonly WeaponDef[]
  authority: GameAuthority
}

export class WeaponLoadout {
  readonly inventory: CharacterInventory
  private readonly weapons: readonly WeaponDef[]
  private readonly authority: GameAuthority
  private readonly groundItems = new Map<string, AuthorityItem>()
  private readonly pending = new Set<string>()
  private readonly rounds = new Map<string, number>()
  private readonly listeners = new Set<(loadout: WeaponLoadout) => void>()
  private readonly groundListeners = new Set<(change: ItemChange) => void>()
  private drawnType: string | null = null
  private isDead = false
  private readonly unsubscribe: (() => void)[]
  /** Why the last fire was refused (diagnostics), or null after a shot. */
  lastRefusal: FireRefusal | null = null

  constructor(options: WeaponLoadoutOptions) {
    this.weapons = options.weapons
    this.authority = options.authority
    this.inventory = new CharacterInventory(options.characterId ?? 'player', options.inventory)
    this.unsubscribe = [
      this.authority.onItems((change) => this.applyItem(change)),
      this.authority.onHealth((change) => this.applyHealth(change)),
    ]
  }

  // --- state (read by the renderer, the HUD and the network) ---

  weaponFor(type: string | undefined): WeaponDef | undefined {
    return type ? this.weapons.find((w) => w.type === type) : undefined
  }
  weaponAt(slot: number): WeaponDef | undefined {
    return this.weapons.find((w) => w.slot === slot)
  }
  /** The drawn weapon's type, or null (unarmed or holstered). */
  get drawn(): string | null {
    return this.drawnType
  }
  /** Number key of the drawn weapon, or null. */
  get drawnSlot(): number | null {
    return this.weaponFor(this.drawnType ?? undefined)?.slot ?? null
  }
  /** The character carries weapon slot `slot` (stored or in hand). */
  carries(slot: number): boolean {
    const def = this.weaponAt(slot)
    if (!def) return false
    return (
      this.inventory.inHand(def.hand)?.type === def.type ||
      this.inventory.storedSlots().some(([, stack]) => stack.type === def.type)
    )
  }
  /** Rounds left in `type`'s magazine (Infinity when not counted). */
  roundsOf(type: string): number {
    return this.weaponFor(type)?.magazine === undefined ? Infinity : (this.rounds.get(type) ?? 0)
  }
  get dead(): boolean {
    return this.isDead
  }
  get ground(): readonly AuthorityItem[] {
    return [...this.groundItems.values()]
  }
  /** Nearest ground item within `reach` m of `at`, or null. */
  nearest(at: Vec3, reach = 2): AuthorityItem | null {
    let best: AuthorityItem | null = null
    let distance = reach
    for (const item of this.groundItems.values()) {
      const d = Math.hypot(item.position[0] - at[0], item.position[2] - at[2])
      if (d <= distance && Math.abs(item.position[1] - at[1]) < 2) {
        best = item
        distance = d
      }
    }
    return best
  }
  onChange(listener: (loadout: WeaponLoadout) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  /** Ground item changes as the authority announces them (to show item props). */
  onGround(listener: (change: ItemChange) => void): () => void {
    this.groundListeners.add(listener)
    return () => this.groundListeners.delete(listener)
  }

  // --- actions ---

  /** Ask the authority for ground item `id`; it is ours only when the claim comes back. */
  pickup(id: string): boolean {
    if (this.isDead || this.pending.has(id) || !this.groundItems.has(id)) return false
    this.pending.add(id)
    if (this.authority.request({ type: 'pickup', item: id })) return true
    this.pending.delete(id)
    return false
  }

  /** Number key: draw the weapon of `slot`, or holster it when it is already drawn. */
  toggleSlot(slot: number): LoadoutResult {
    const def = this.weaponAt(slot)
    if (!def) return { ok: false, reason: `no weapon on key ${slot}` }
    if (this.drawnType === def.type) return this.holster()
    return this.draw(def.type)
  }

  /** Take weapon `type` from its slot into its hand (holstering whatever is drawn). */
  draw(type: string): LoadoutResult {
    const def = this.weaponFor(type)
    if (!def) return { ok: false, reason: `${type} is not a weapon` }
    if (this.isDead) return { ok: false, reason: 'dead' }
    if (this.drawnType === type) return { ok: true }
    if (this.drawnType) {
      const put = this.holster()
      if (!put.ok) return put
    }
    if (this.inventory.inHand(def.hand)?.type === type) {
      this.drawnType = type
      this.changed()
      return { ok: true }
    }
    const from = this.inventory.storedSlots().find(([, stack]) => stack.type === type)?.[0]
    if (!from) return { ok: false, reason: `not carrying ${type}` }
    const result = this.inventory.draw(from, def.hand)
    if (!result.ok) return result
    this.drawnType = type
    this.changed()
    return { ok: true }
  }

  /** Put the drawn weapon back in a slot. */
  holster(): LoadoutResult {
    const def = this.weaponFor(this.drawnType ?? undefined)
    if (!def) return { ok: false, reason: 'nothing drawn' }
    const result = this.inventory.stow(def.hand)
    if (!result.ok) return result
    this.drawnType = null
    this.changed()
    return { ok: true }
  }

  /** Holster key: holster what is drawn, or draw the first weapon carried. */
  toggleHolster(): LoadoutResult {
    if (this.drawnType) return this.holster()
    const first = this.weapons.find((w) => this.carries(w.slot))
    return first ? this.draw(first.type) : { ok: false, reason: 'unarmed' }
  }

  /** Drop what is in a hand (the drawn weapon first) at `at`, through the authority. */
  drop(at: Vec3): LoadoutResult {
    const drawn = this.weaponFor(this.drawnType ?? undefined)
    const hand: Hand | null = drawn
      ? drawn.hand
      : this.inventory.inHand('right')
        ? 'right'
        : this.inventory.inHand('left')
          ? 'left'
          : null
    if (!hand) return { ok: false, reason: 'hands empty' }
    const stack = this.inventory.inHand(hand)!
    if (stack.count === Infinity) {
      this.inventory.stow(hand)
      this.changed()
      return { ok: true }
    }
    this.inventory.release(hand)
    if (drawn) this.drawnType = null
    this.changed()
    if (
      !this.authority.request({
        type: 'drop',
        item: stack.type,
        count: stack.count,
        position: [...at],
      })
    ) {
      // Not accepted: keep it rather than lose it.
      this.inventory.pickup(stack)
      this.changed()
      return { ok: false, reason: 'drop refused' }
    }
    return { ok: true }
  }

  /** Whether a shot may leave the drawn weapon now (no side effects). */
  canFire(): FireVerdict {
    if (this.isDead) return { ok: false, reason: 'dead' }
    if (!this.drawnType) {
      const armed = this.weapons.some((w) => this.carries(w.slot))
      return { ok: false, reason: armed ? 'holstered' : 'unarmed' }
    }
    const def = this.weaponFor(this.drawnType)!
    if (def.magazine === 0) return { ok: false, reason: 'not-a-firearm' }
    if (this.roundsOf(def.type) <= 0) return { ok: false, reason: 'empty' }
    return { ok: true, weapon: def.type }
  }

  /**
   * Fire once: the loadout's checks decide; the shot is then announced to the authority (fire is
   * presentation there, so an unjoined relay never blocks a shot). Spends a round.
   */
  fire(origin: Vec3, direction: Vec3): FireVerdict {
    const verdict = this.canFire()
    if (!verdict.ok) return this.refuse(verdict.reason)
    const length = Math.hypot(...direction) || 1
    this.authority.request({
      type: 'fire',
      slot: this.weaponFor(verdict.weapon)!.slot,
      kind: 0,
      origin: [...origin],
      direction: [direction[0] / length, direction[1] / length, direction[2] / length],
    })
    if (this.weaponFor(verdict.weapon)!.magazine !== undefined)
      this.rounds.set(verdict.weapon, this.roundsOf(verdict.weapon) - 1)
    this.lastRefusal = null
    this.changed()
    return verdict
  }

  /** R: refill the drawn weapon's magazine (one ammo item spent when it uses one). */
  reload(): LoadoutResult {
    const def = this.weaponFor(this.drawnType ?? undefined)
    if (!def) return { ok: false, reason: 'nothing drawn' }
    if (def.magazine === undefined) return { ok: true }
    if (this.roundsOf(def.type) >= def.magazine) return { ok: false, reason: 'full' }
    let from: string | undefined
    if (def.ammo) {
      from = this.inventory.storedSlots().find(([, stack]) => stack.type === def.ammo)?.[0]
      if (!from) return { ok: false, reason: `no ${def.ammo}` }
    }
    this.authority.request({ type: 'reload', slot: def.slot })
    if (from) {
      // Spend one: take it to the free hand and let it go.
      const other: Hand = def.hand === 'right' ? 'left' : 'right'
      if (this.inventory.inHand(other)) return { ok: false, reason: `${other} hand is full` }
      this.inventory.draw(from, other)
      this.inventory.release(other)
    }
    this.rounds.set(def.type, def.magazine)
    this.changed()
    return { ok: true }
  }

  /**
   * A weapon the host collected outside the authority's ground (the runtime's own world pickup):
   * it goes into the kit and, like a claimed ground item, to its hand when nothing is drawn.
   */
  collect(item: ItemStack): LoadoutResult {
    if (this.isDead) return { ok: false, reason: 'dead' }
    const result = this.grant(item)
    if (!result.ok) return result
    this.drawPicked(item.type)
    return { ok: true }
  }

  /** Put an item straight into the kit (spawn loadout), not through the ground. */
  grant(item: ItemStack, slot?: string): LoadoutResult {
    const result = this.inventory.pickup(item, slot)
    if (!result.ok) return result
    this.armed(item.type)
    this.changed()
    return { ok: true }
  }

  dispose(): void {
    for (const stop of this.unsubscribe) stop()
    this.listeners.clear()
    this.groundListeners.clear()
  }

  // --- authority announcements ---

  private applyItem(change: ItemChange): void {
    if (change.type === 'added') this.groundItems.set(change.item.id, { ...change.item })
    else this.taken(change.id, change.by)
    for (const listener of [...this.groundListeners]) listener(change)
  }

  private applyHealth(change: HealthChange): void {
    const self = this.authority.self
    if (!self || change.target !== self) return
    const dead =
      change.type === 'death' ? true : change.type === 'respawn' ? false : change.health <= 0
    if (dead === this.isDead) return
    this.isDead = dead
    this.changed()
  }

  /** Item `id` left the ground, into `by`'s kit (null: removed). */
  private taken(id: string, by: string | null): void {
    const item = this.groundItems.get(id)
    this.groundItems.delete(id)
    const asked = this.pending.delete(id)
    if (!by || by !== this.authority.self || !item) return
    if (!asked) console.info(`[weapon] ${id} claimed for us without asking`)
    const result = this.inventory.pickup({ type: item.item, count: item.count })
    if (!result.ok) {
      console.info(`[weapon] cannot keep ${item.item}: ${result.reason}; back to the ground`)
      this.authority.request({
        type: 'drop',
        item: item.item,
        count: item.count,
        position: [...item.position],
      })
      return
    }
    this.armed(item.item)
    this.drawPicked(item.item)
    this.changed()
  }

  /** A picked-up weapon goes to its hand at once when nothing else is drawn. */
  private drawPicked(type: string): void {
    const def = this.weaponFor(type)
    if (def && !this.drawnType && !this.inventory.inHand(def.hand)) this.draw(def.type)
  }

  /** A weapon newly owned starts with a full magazine. */
  private armed(type: string): void {
    const def = this.weaponFor(type)
    if (def?.magazine !== undefined && !this.rounds.has(type)) this.rounds.set(type, def.magazine)
  }

  private refuse(reason: FireRefusal): FireVerdict {
    if (this.lastRefusal !== reason) console.info(`[weapon] fire refused: ${reason}`)
    this.lastRefusal = reason
    return { ok: false, reason }
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener(this)
  }
}
