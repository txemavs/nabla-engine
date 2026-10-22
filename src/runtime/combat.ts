/**
 * Character combat: hit volumes on every registered body (local player, remote players, test
 * dummies), shot resolution against them, health, hit reactions, death and respawn.
 *
 * Offline every hit is applied here (this client is the authority). With a network host
 * ({@link Combat.onHit} set), a hit on a networked target is only reported: the relay applies
 * the damage, owns health and sends it back through {@link Combat.applyHealth},
 * {@link Combat.applyDeath} and {@link Combat.applyRespawn}. Targets added with
 * `{ offline: true }` (dummies) stay local in both modes. Contract: docs/combat.md.
 */
import * as THREE from 'three'
import type { Vec3Tuple } from '../entity/schema.js'
import type { PlayerBody } from '../render/entity/player-body.js'
import { HitVolumes } from '../render/entity/hit-volumes.js'
import {
  HealthLedger,
  MAX_HEALTH,
  RESPAWN_DELAY_S,
  zoneDamage,
  type HitZoneId,
} from '../simulation/combat/damage.js'
import type { CombatHud } from '../ui/combat-hud.js'

/** One hit as the shooter sees it: what the shooter sends to the relay. */
export interface CombatHitReport {
  /** Who was hit (the id the target was registered with: the peer id online). */
  targetId: string
  zone: HitZoneId
  /** Weapon preset id. */
  weapon: string
  /** Damage this client computed (base × zone); the relay may recompute it. */
  damage: number
  /**
   * Where the shot left the weapon (the fire origin: muzzle, arrow rest; the same point as
   * the `FireReport`) and the unit direction of the hitting segment, simulation-world metres.
   */
  origin: Vec3Tuple
  direction: Vec3Tuple
  /** Where the shot entered the target, simulation-world metres. */
  point: Vec3Tuple
  /** Who fired (the local id: `combat.localId`). */
  shooterId: string
}

/** Optional details the relay sends with a health change. */
export interface CombatHealthInfo {
  zone?: HitZoneId
  /** Shot direction (simulation world), for the flinch and the fall. */
  direction?: Vec3Tuple
  shooterId?: string
}

export interface CombatTargetOptions {
  /** Resolved on this client even online (offline test dummies). */
  offline?: boolean
  /** Respawn point (simulation world, feet); dummies respawn where they stood. */
  spawn?: Vec3Tuple
}

interface Target {
  id: string
  body: PlayerBody
  volumes: HitVolumes
  offline: boolean
  spawn?: Vec3Tuple
}

export interface CombatHooks {
  /** Seconds, monotonic. */
  now(): number
  /** Scene offset: scene world = simulation world + this (the floating origin). */
  sceneOffset(): THREE.Vector3
  /** Put the local player back at its spawn (or `position`, simulation world). */
  respawnLocal(position?: Vec3Tuple): void
  /** Local player died (holster, stop input…). */
  localDied?(): void
  hud?: CombatHud | null
}

export interface CombatShotHit {
  targetId: string
  zone: HitZoneId
  distance: number
  /** Simulation world. */
  point: Vec3Tuple
  bone: THREE.Object3D
}

/** Entity id that shot queries return for a character hit: `character:<targetId>`. */
export const CHARACTER_HIT_PREFIX = 'character:'

export class Combat {
  readonly ledger = new HealthLedger(MAX_HEALTH, RESPAWN_DELAY_S)
  /** The local player's target id; a network host sets it to the peer id. */
  localId = 'local'
  /**
   * Network host: set to forward hits on networked targets to the relay (the relay then
   * answers with applyHealth / applyDeath / applyRespawn). Null = offline authority.
   */
  onHit: ((hit: CombatHitReport) => void) | null = null
  /** Every health change (any target), after it is applied. */
  readonly listeners = new Set<(id: string, health: number, dead: boolean) => void>()
  private readonly targets = new Map<string, Target>()
  private lastHud = ''

  constructor(private readonly hooks: CombatHooks) {}

  /** Register a body as a target (remote players: their peer id; dummies: offline). */
  addTarget(id: string, body: PlayerBody, options: CombatTargetOptions = {}): void {
    const volumes = new HitVolumes(body.root)
    this.targets.set(id, {
      id,
      body,
      volumes,
      offline: !!options.offline,
      spawn: options.spawn,
    })
    this.ledger.get(id)
    this.notify(id)
  }

  removeTarget(id: string): void {
    this.targets.delete(id)
    this.ledger.remove(id)
  }

  /** The local player's body (null on helmet-only pages: then nothing can hit it). */
  setLocalBody(body: PlayerBody | null): void {
    const health = this.ledger.has(this.localId) ? this.ledger.get(this.localId) : null
    this.targets.delete(this.localId)
    if (body) {
      this.targets.set(this.localId, {
        id: this.localId,
        body,
        volumes: new HitVolumes(body.root),
        offline: false,
      })
      if (health?.dead) body.collapseFrom()
    }
    this.ledger.get(this.localId)
    this.lastHud = ''
    this.syncHud()
  }

  /** Change the local id (network join) keeping the current health. */
  setLocalId(id: string): void {
    if (id === this.localId) return
    const target = this.targets.get(this.localId)
    const health = this.ledger.get(this.localId).health
    this.targets.delete(this.localId)
    this.ledger.remove(this.localId)
    this.localId = id
    if (target) this.targets.set(id, { ...target, id })
    this.ledger.set(id, health, this.hooks.now())
    this.syncHud()
  }

  health(id = this.localId): number {
    return this.ledger.get(id).health
  }
  isDead(id = this.localId): boolean {
    return this.ledger.get(id).dead
  }
  get targetIds(): string[] {
    return [...this.targets.keys()]
  }
  body(id: string): PlayerBody | null {
    return this.targets.get(id)?.body ?? null
  }

  /**
   * Nearest character the ray crosses within `far` (simulation world), skipping `shooterId`
   * and the dead.
   */
  raycast(
    origin: Vec3Tuple,
    direction: Vec3Tuple,
    far: number,
    shooterId = this.localId,
  ): CombatShotHit | null {
    if (!this.targets.size) return null
    const offset = this.hooks.sceneOffset()
    const o = new THREE.Vector3(...origin).add(offset)
    const d = new THREE.Vector3(...direction).normalize()
    let best: CombatShotHit | null = null
    for (const target of this.targets.values()) {
      if (target.id === shooterId || this.ledger.get(target.id).dead) continue
      const hit = target.volumes.raycast(o, d, best?.distance ?? far)
      if (hit && (!best || hit.distance < best.distance))
        best = {
          targetId: target.id,
          zone: hit.zone,
          distance: hit.distance,
          point: hit.point.sub(offset).toArray() as Vec3Tuple,
          bone: hit.bone,
        }
    }
    return best
  }

  /**
   * A shot query (`sim.shoot`-like) that also stops at characters: the nearer of the world
   * hit and the character hit wins. A character hit is applied (or reported) right away and
   * returned with entity id `character:<id>`. `base` is the weapon's base damage.
   */
  shotQuery<H extends { point: Vec3Tuple; normal: Vec3Tuple; entityId: string | null }>(
    query: (from: Vec3Tuple, direction: Vec3Tuple, length: number) => H | null,
    weapon: string,
    base: number,
    /** Where the shot left the weapon (muzzle, arrow rest), reported as the hit origin. */
    fireOrigin?: Vec3Tuple | (() => Vec3Tuple | undefined),
  ): (from: Vec3Tuple, direction: Vec3Tuple, length: number) => H | null {
    return (from, direction, length) => {
      const world = query(from, direction, length)
      const far = world
        ? new THREE.Vector3(...world.point).distanceTo(new THREE.Vector3(...from))
        : length
      const hit = this.raycast(from, direction, far)
      if (!hit) return world
      const origin = typeof fireOrigin === 'function' ? fireOrigin() : fireOrigin
      this.shoot(hit, weapon, base, origin ?? from, direction)
      const back = new THREE.Vector3(...direction).normalize().negate().toArray() as Vec3Tuple
      return {
        ...(world ?? ({} as H)),
        point: hit.point,
        normal: back,
        entityId: CHARACTER_HIT_PREFIX + hit.targetId,
        surface: null,
      } as H
    }
  }

  /** Apply (offline) or report (online) a resolved hit, with the immediate local flinch. */
  shoot(
    hit: CombatShotHit,
    weapon: string,
    base: number,
    origin: Vec3Tuple,
    direction: Vec3Tuple,
  ): CombatHitReport {
    const report: CombatHitReport = {
      targetId: hit.targetId,
      zone: hit.zone,
      weapon,
      damage: zoneDamage(base, hit.zone),
      origin,
      direction,
      point: hit.point,
      shooterId: this.localId,
    }
    const target = this.targets.get(hit.targetId)
    target?.body.flinch(hit.bone, new THREE.Vector3(...direction), flinchStrength(report.damage))
    if (this.onHit && target && !target.offline) this.onHit(report)
    else this.applyDamage(report)
    return report
  }

  /** Authority side (offline): take the damage, die at 0. */
  applyDamage(report: CombatHitReport): void {
    const now = this.hooks.now()
    const result = this.ledger.damage(report.targetId, report.damage, now)
    if (!result.dealt) return
    if (report.targetId === this.localId) this.hooks.hud?.hit()
    if (result.died) this.die(report.targetId, report.direction)
    this.notify(report.targetId)
  }

  /** From the relay: a target's health (a drop flashes the victim's screen). */
  applyHealth(targetId: string, health: number, info: CombatHealthInfo = {}): void {
    const before = this.ledger.get(targetId).health
    const state = this.ledger.set(targetId, health, this.hooks.now())
    if (health < before) {
      if (targetId === this.localId) this.hooks.hud?.hit()
      // Shooters already flinched their own hit; other clients see it now.
      if (info.direction && info.shooterId !== this.localId) {
        const target = this.targets.get(targetId)
        const bone = target?.volumes.capsules.find((c) => c.zone === (info.zone ?? 'torso'))?.bone
        if (target && bone) target.body.flinch(bone, new THREE.Vector3(...info.direction))
      }
    }
    if (state.dead) this.die(targetId, info.direction)
    this.notify(targetId)
  }

  /** From the relay: the target died. */
  applyDeath(targetId: string, info: CombatHealthInfo = {}): void {
    this.ledger.set(targetId, 0, this.hooks.now())
    this.die(targetId, info.direction)
    this.notify(targetId)
  }

  /** From the relay (or the offline timer): back to full health, standing at `position`. */
  applyRespawn(targetId: string, position?: Vec3Tuple): void {
    this.ledger.respawn(targetId)
    const target = this.targets.get(targetId)
    target?.body.revive()
    if (targetId === this.localId) this.hooks.respawnLocal(position)
    else if (target && (position ?? target.spawn))
      target.body.root.position.fromArray(position ?? target.spawn!)
    this.notify(targetId)
  }

  /** Every frame: offline respawn timers and the HUD countdown. */
  update(): void {
    const now = this.hooks.now()
    if (!this.onHit) for (const id of this.ledger.due(now)) this.applyRespawn(id)
    else
      for (const id of this.ledger.due(now))
        if (this.targets.get(id)?.offline) this.applyRespawn(id)
    this.syncHud()
  }

  /** Health of every known target, for a join snapshot built by an offline/host authority. */
  snapshot(): Record<string, number> {
    return this.ledger.snapshot()
  }

  private die(id: string, direction?: Vec3Tuple): void {
    const target = this.targets.get(id)
    target?.body.collapseFrom(direction ? new THREE.Vector3(...direction) : undefined)
    if (id === this.localId) this.hooks.localDied?.()
  }

  private notify(id: string): void {
    const state = this.ledger.get(id)
    for (const listener of this.listeners) listener(id, state.health, state.dead)
    if (id === this.localId) this.syncHud()
  }

  private syncHud(): void {
    const hud = this.hooks.hud
    if (!hud) return
    const state = this.ledger.get(this.localId)
    const visible = this.targets.has(this.localId)
    const remaining =
      state.dead && state.diedAt !== null
        ? Math.ceil(this.ledger.respawnDelay - (this.hooks.now() - state.diedAt))
        : null
    const key = `${visible}|${state.health}|${remaining}`
    if (key === this.lastHud) return
    this.lastHud = key
    hud.setHealth(state.health, this.ledger.maxHealth, visible)
    hud.setRespawnIn(visible && state.dead ? Math.max(0, remaining ?? 0) : null)
  }
}

/** Bigger hits flinch harder (radians). */
function flinchStrength(damage: number): number {
  return Math.min(0.6, 0.15 + damage / 120)
}
