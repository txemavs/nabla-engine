import * as THREE from 'three'
import {
  PlayerBodyRig,
  type PlayerBody,
  type PlayerBodyAssets,
} from '../render/entity/player-body.js'
import type { Vec3Tuple } from '../entity/schema.js'
import type { SettingsStore } from './settings-scope.js'
import {
  actorBodyAssets,
  actorProfile,
  loadActor,
  parseActor,
  saveActor,
  type ActorChoice,
} from './actor.js'
import { HeldWeapon } from './held-weapon.js'
import type { HeldWeaponPreset } from '../catalog/weapons/held-library.js'
import type { Sidearm } from './sidearm.js'
import { weaponSlots } from '../catalog/weapons/slots.js'
import { simulationDefaults } from '../config/simulation.js'

export interface WeaponProp {
  /** Feet origin: place and turn it like the body. */
  readonly root: THREE.Group
  readonly slot: number
  /** Where its shots leave it (gun muzzle, bow arrow rest), simulation world; null when hidden. */
  muzzle(): Vec3Tuple | null
  update(now?: number): void
  dispose(): void
}

export interface PlayerPresentationHooks {
  applyBody(body: PlayerBody | null): void
  currentBody(): PlayerBody | null
  actorHands(choice: ActorChoice): void
  createSidearm(preset: ConstructorParameters<typeof Sidearm>[1]): Sidearm
  rememberArrow(template: THREE.Mesh): void
  sceneOrigin(): THREE.Vector3
  onError(error: unknown): void
}

/** Local presentation lifetime; combat/inventory authority and scene ownership stay outside. */
export class RuntimePlayerPresentation {
  bodyRig: PlayerBodyRig | null = null
  heldWeapon: HeldWeapon | null = null
  heldDrawn = false
  private actorChoice: ActorChoice
  private headOnly = false
  private bodyLoad = 0
  private playerBodyChosen = false
  private disposed = false
  private readonly actorRigs = new Map<string, Promise<PlayerBodyRig>>()

  constructor(
    private readonly settings: SettingsStore,
    private readonly hooks: PlayerPresentationHooks,
    private readonly factories = {
      loadRig: (assets: PlayerBodyAssets) => PlayerBodyRig.load(assets),
      createHeld: (preset: HeldWeaponPreset) => new HeldWeapon(preset),
    },
  ) {
    this.actorChoice = loadActor(settings)
  }

  get actor(): ActorChoice {
    return this.actorChoice
  }
  get profile(): string {
    return actorProfile(this.actorChoice)
  }
  get selectable(): boolean {
    return !this.headOnly
  }

  ensureDefault(): void {
    if (!this.playerBodyChosen)
      void this.loadPlayerBody(actorBodyAssets(this.actorChoice), true).catch((error) =>
        console.warn('player body', error),
      )
  }

  async setPlayerBody(assets: PlayerBodyAssets | null): Promise<PlayerBodyRig | null> {
    this.playerBodyChosen = true
    this.headOnly = assets === null
    return this.loadPlayerBody(assets)
  }

  async setActor(choice: ActorChoice): Promise<PlayerBodyRig | null> {
    this.actorChoice = choice
    saveActor(choice, this.settings)
    if (this.headOnly) return null
    this.playerBodyChosen = true
    this.hooks.actorHands(choice)
    return this.loadPlayerBody(actorBodyAssets(choice))
  }

  actorRig(profile: unknown): Promise<PlayerBodyRig> {
    const key = actorProfile(parseActor(profile))
    let rig = this.actorRigs.get(key)
    if (!rig) {
      rig = this.factories.loadRig(actorBodyAssets(parseActor(key)))
      rig.catch(() => this.actorRigs.delete(key))
      this.actorRigs.set(key, rig)
    }
    return rig
  }
  private async loadPlayerBody(assets: PlayerBodyAssets | null, fallback = false) {
    const load = ++this.bodyLoad
    const rig = assets ? await this.factories.loadRig(assets) : null
    // The default arrives late; a host choice made meanwhile wins, and so does a later choice.
    if (this.disposed || (fallback && this.playerBodyChosen) || load !== this.bodyLoad) return null
    this.bodyRig = rig
    this.hooks.applyBody(this.bodyRig?.create() ?? null)
    return this.bodyRig
  }

  selectHeld(preset: HeldWeaponPreset): void {
    if (this.heldWeapon?.preset.id === preset.id) return
    this.heldWeapon?.dispose()
    this.heldWeapon = this.factories.createHeld(preset)
    void this.heldWeapon.ready.catch((error) => this.hooks.onError(error))
  }

  clearHeld(): void {
    this.heldWeapon?.dispose()
    this.heldWeapon = null
  }

  weaponsToHand(
    weaponDrawn: boolean,
    sidearmObject: THREE.Object3D | null | undefined,
    holsterShown: boolean | null,
  ): void {
    const body = this.hooks.currentBody()
    if (!body) return
    body.setHolstered(holsterShown ?? !(weaponDrawn || this.heldDrawn))
    for (const object of [this.heldWeapon?.worldObject, sidearmObject])
      if (object?.visible) body.holdAtHand(object, true)
  }

  async createWeaponProp(
    slot: number,
    body?: PlayerBody | null,
    options: { grip?: boolean } = {},
  ): Promise<WeaponProp | null> {
    const entry = weaponSlots().find((item) => item.slot === slot)
    if (!entry || entry.kind === 'placeholder') return null
    const root = new THREE.Group()
    root.name = `weapon-prop-${entry.id}`
    // The local weapon hangs from the avatar, whose origin is the standing body centre.
    const frame = new THREE.Group()
    frame.position.y = simulationDefaults.playerHalfHeight
    root.add(frame)
    if (options.grip) {
      // Undo the third-person hip offset so the weapon sits at the root.
      const hip =
        entry.kind === 'firearm'
          ? [0.24, -0.16, -0.32]
          : (entry.preset.world?.position ?? [0, 0, 0])
      frame.position.set(-hip[0], -hip[1], -hip[2])
    }
    const weapon =
      entry.kind === 'firearm'
        ? this.hooks.createSidearm(entry.preset)
        : this.factories.createHeld(entry.preset)
    try {
      await weapon.ready
    } catch (error) {
      weapon.dispose()
      throw error
    }
    if (this.disposed) {
      weapon.dispose()
      return null
    }
    weapon.visible = true
    if (weapon instanceof HeldWeapon && weapon.arrowTemplate)
      this.hooks.rememberArrow(weapon.arrowTemplate)
    const socket = options.grip ? null : (body ?? null)
    return {
      root,
      slot,
      muzzle: () => {
        const at = weapon instanceof HeldWeapon ? weapon.worldOrigin() : weapon.worldMuzzle()
        return at ? (at.sub(this.hooks.sceneOrigin()).toArray() as Vec3Tuple) : null
      },
      update: (now = performance.now()) => {
        weapon.syncWorld(frame, now, false)
        const object = weapon.worldObject
        if (!socket || !object) return
        socket.setHolstered(!root.visible)
        if (root.visible) socket.holdAtHand(object)
      },
      dispose: () => {
        socket?.setHolstered(true)
        weapon.dispose()
        root.removeFromParent()
      },
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    ++this.bodyLoad
    this.clearHeld()
    // SceneView owns the installed body; rigs are shared sources, never disposed here.
  }
}
