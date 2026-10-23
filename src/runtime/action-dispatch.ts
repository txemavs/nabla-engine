import type { Group, PerspectiveCamera, SpotLight } from 'three'
import {
  bodySlotForAction,
  DROP_ACTION,
  MAGAZINE_ACTION,
  MAGAZINE_SLOT,
  magazineActionFor,
  type BodySlot,
} from '../character/body-slots.js'
import {
  actionCompletesChord,
  bindingForKey,
  contextualAction,
  legacyInputAction,
  controlsHint,
  type InputContext,
} from '../config/input-bindings.js'
import { disposeObject } from '../render/entity/assets.js'
import { weaponPresets } from '../catalog/weapons/library.js'
import { nextFireMode } from '../simulation/weapons/machine-pistol.js'
import { t } from '../i18n/index.js'
import { vehicleMenuKey } from './vehicle-menu.js'
import type { VehicleLightMode } from '../render/vehicle-presentation/light-controller.js'
import type { SceneView } from '../presentation/scene-view.js'
import type { SceneDocument } from '../scene/document.js'
import type { Simulation } from '../simulation/simulation.js'
import type { PickupInventory, WorldPickup } from '../simulation/items/pickups.js'
import type { WeaponLoadout } from '../character/weapon-loadout.js'
import type { Sidearm } from './sidearm.js'
import type { FirearmSamples } from '../audio/firearm-samples.js'
import type { VehicleAudio } from '../audio/vehicle.js'
import type { GameRuntime } from './game.js'
import type { RuntimeText } from './messages.js'

/** Live action dependencies; resource lifetime and frame state remain with their owners. */
export interface RuntimeActionHost {
  readonly inspector: unknown
  readonly disposed: boolean
  readonly session: GameRuntime['session']
  readonly game: Pick<GameRuntime, 'dispatch'>
  readonly keys: Pick<GameRuntime['keys'], 'values'>
  readonly controlContext: InputContext
  readonly document: SceneDocument
  readonly view: SceneView
  readonly audio: Pick<
    VehicleAudio,
    'weaponSound' | 'horn' | 'musicTrack' | 'fadeOutMusic' | 'playMusic'
  >
  readonly camera: Pick<PerspectiveCamera, 'position'>
  readonly firearmSamples: Pick<FirearmSamples, 'cue'>
  readonly inventory: Pick<PickupInventory, 'take'>
  readonly pickupModels: Map<string, Group>
  readonly loadout: WeaponLoadout | null
  readonly bodySlotHost: { select(slot: BodySlot): boolean; drop(): void } | null
  readonly wheelDebug: { toggle(): void }
  readonly gallery: { reset(): void }
  readonly drivingPrepared: Set<string>
  readonly xrActive: boolean
  readonly weaponOwned: boolean
  readonly headlampEnabled: boolean
  readonly weaponLight: SpotLight | null
  sidearm: Sidearm | null
  weaponDrawn: boolean
  heldDrawn: boolean
  ownedWeaponId: string | null
  fireRequested: boolean
  triggerDown: boolean
  weaponLightOn: boolean
  magazineAction: 'drop' | 'insert' | 'release' | 'automatic' | null
  text: RuntimeText
  report(message: string): void
  nearbyPickup(sim: Simulation): WorldPickup | null
  pickupVisible(sim: Simulation, item: WorldPickup): boolean
  loadoutWeaponFor(id: string): string | undefined
  createSidearm(preset?: ConstructorParameters<typeof Sidearm>[1]): Sidearm
  selectWeaponSlot(slot: number): void
  setHeadlamp(enabled: boolean): void
  prewarmVehicle(entities: SceneDocument['entities']): Promise<unknown>
  skipStartCamera(sim: Simulation): void
  adjustFov(step: string): string
  loadTrailerCars(id: string): Promise<unknown>
}

/** H notices per light switch position (English keys, see messages.es.ts). */
const lightModeNotice: Record<VehicleLightMode, string> = {
  off: 'Lights off',
  position: 'Position lights',
  low: 'Dipped beams',
  auto: 'Automatic lights',
}

/** Ordered action execution shared by host controls, keyboard, XR and gamepads. */
export class RuntimeActionDispatch {
  private enteringVehicle = false
  constructor(private readonly host: RuntimeActionHost) {}

  cycleCamera(): void {
    const host = this.host
    if (host.xrActive) return
    const sim = host.session.simulation
    if (sim) host.skipStartCamera(sim)
    const message = host.game.dispatch('camera')
    if (message) host.report(message)
  }

  menuKey(id: string, code: string, repeat: boolean): ReturnType<typeof vehicleMenuKey> {
    const host = this.host
    return vehicleMenuKey(
      host.view,
      host.document,
      id,
      code,
      repeat,
      (message) => host.report(message),
      (entityId, patch) => {
        const entity = host.document.entities.find((e) => e.id === entityId)
        if (entity) Object.assign(entity, patch)
      },
      host.text,
      (entityId, mode) =>
        host.session.simulation?.setEngineMode(entityId, mode) ??
        t('game.this-vehicle-has-a-single-engine-mode'),
      (step) => host.adjustFov(step),
      (action) => {
        const track = host.audio.musicTrack
        if (!track) return t('game.no-music')
        if (action === 'stop') {
          host.audio.fadeOutMusic(0.8)
          return t('game.music-stopped')
        }
        return host.audio.playMusic()
          ? t('game.music-track', { title: track.title ?? t('game.track') })
          : t('game.music-muted-in-settings-to-audio')
      },
      (action) => {
        const sim = host.session.simulation!
        if (action === 'cargo') {
          void host.loadTrailerCars(id).catch((error) => host.report(String(error)))
          return 'Preparando carga del portacoches'
        }
        if (['extend', 'retract', 'angle-up', 'angle-down'].includes(action))
          return sim.adjustTrailerRamp(id, action)
        return sim.setTrailerPlatform(id, action === 'flat')
      },
    )
  }

  dispatch(value: string): void {
    const host = this.host
    if (host.inspector) return
    const sim = host.session.simulation
    if (!sim) return
    const context = host.controlContext
    const raw = legacyInputAction(value) ?? bindingForKey(value, context)
    if (!raw || (context.menu && !raw.startsWith('menu.'))) return
    const action = contextualAction(raw, context)
    if (
      (action === 'lean.left' || action === 'lean.right' || action === 'interact') &&
      !sim.player.vehicleId &&
      host.weaponDrawn &&
      host.sidearm?.isAiming
    )
      return
    if (!sim.player.vehicleId && actionCompletesChord(host.keys.values, 'prone', action, context)) {
      sim.setStance('prone')
      host.report('Cuerpo a tierra · ' + controlsHint({ mode: 'walk' }, ['stance']))
      return
    }
    if (action === 'interact') {
      const nearby = host.nearbyPickup(sim)
      // With a loadout the weapon must land in it (it decides what may fire); a world pickup it
      // cannot keep stays on the ground.
      const kept = nearby && host.loadout ? host.loadoutWeaponFor(nearby.itemId) : undefined
      const item =
        nearby &&
        (!host.loadout || kept) &&
        host.inventory.take(nearby.id, sim.renderPlayerPosition, (pickup) =>
          host.pickupVisible(sim, pickup),
        )
      if (item) {
        const root = host.pickupModels.get(item.id)
        if (root) {
          root.removeFromParent()
          disposeObject(root)
          host.pickupModels.delete(item.id)
        }
        host.ownedWeaponId = item.itemId
        if (host.loadout && kept) {
          const result = host.loadout.collect({ type: kept, count: 1 })
          if (!result.ok) console.info(`[weapon] cannot keep ${item.itemId}: ${result.reason}`)
          host.report(
            host.text('Picked up {0}', item.name) + ' · ' + controlsHint(context, ['holster']),
          )
          return
        }
        if (host.sidearm?.preset?.id !== item.itemId) {
          host.sidearm?.dispose()
          host.sidearm = host.createSidearm(
            weaponPresets().find((preset) => preset.id === item.itemId),
          )
        }
        host.weaponDrawn = true
        host.sidearm.visible = true
        host.report(
          host.text('Picked up {0}', item.name) + ' · ' + controlsHint(context, ['holster']),
        )
        return
      }
    }
    if (action === 'debug.wheels') {
      host.wheelDebug.toggle()
      return
    }
    if (action === DROP_ACTION) {
      if (!sim.player.vehicleId) host.bodySlotHost?.drop()
      return
    }
    const bodySlot = bodySlotForAction(action)
    // The magazine pocket with the pistol drawn is the reload, handled below with the weapon keys.
    if (bodySlot && !(bodySlot === MAGAZINE_SLOT && host.weaponDrawn)) {
      if (sim.player.vehicleId || host.bodySlotHost?.select(bodySlot)) return
      if (/^\d$/.test(bodySlot.key)) host.selectWeaponSlot(Number(bodySlot.key))
      return
    }
    if (action === 'holster' && host.loadout) {
      const result = host.loadout.toggleHolster()
      if (!result.ok) host.report(result.reason)
      return
    }
    if (action === 'holster' && host.heldDrawn) {
      host.heldDrawn = false
      host.report(host.text('Weapon holstered'))
      return
    }
    if (action === 'holster') {
      if (!host.weaponOwned) return
      host.weaponDrawn = !host.weaponDrawn
      host.fireRequested = false
      host.triggerDown = false
      if (host.weaponDrawn && !host.sidearm) host.sidearm = host.createSidearm()
      host.sidearm?.setAiming(false)
      host.view.laser.enabled = host.weaponDrawn && !!host.sidearm?.laserEnabled
      if (host.weaponLight)
        host.weaponLight.intensity = host.weaponDrawn && host.weaponLightOn ? 35 : 0
      host.report(host.weaponDrawn ? host.text('Weapon drawn') : host.text('Weapon holstered'))
      return
    }
    if (
      host.xrActive &&
      host.weaponDrawn &&
      [MAGAZINE_ACTION, 'weapon.slide', 'weapon.auto', 'weapon.chamber', 'weapon.inspect'].includes(
        action,
      )
    )
      return
    if ((action === MAGAZINE_ACTION || action === 'weapon.slide') && host.weaponDrawn) {
      if (host.sidearm?.state.reload !== 'none') return
      host.magazineAction =
        action === 'weapon.slide'
          ? 'release'
          : (magazineActionFor({
              drawn: true,
              seated: !!host.sidearm?.state.magazineSeated,
            }) as 'drop' | 'insert')
      return
    }
    if (
      (action === 'weapon.inspect' || action === 'weapon.chamber') &&
      host.weaponDrawn &&
      host.sidearm
    ) {
      host.sidearm.inspect(performance.now(), action === 'weapon.chamber')
      if (action === 'weapon.chamber')
        host.firearmSamples.cue(host.sidearm?.preset, 'slide-back', host.camera.position.toArray())
      return
    }
    if (
      (action === 'weapon.laser' || action === 'weapon.light') &&
      host.weaponDrawn &&
      host.sidearm
    ) {
      if (action === 'weapon.laser') {
        const on = host.sidearm.toggleLaser()
        host.view.laser.enabled = on
        host.report(on ? host.text('Laser on') : host.text('Laser off'))
      } else {
        host.weaponLightOn = !host.weaponLightOn
        host.sidearm.setLightEnabled(host.weaponLightOn)
        host.report(host.weaponLightOn ? 'Linterna encendida' : 'Linterna apagada')
      }
      return
    }
    // Experimental full-auto: M on foot with the pistol drawn. At a ship helm (or on foot without
    // the pistol) M keeps its game meaning (helm mode / its notice).
    if (
      action === 'weapon.auto' &&
      host.weaponDrawn &&
      !sim.player.vehicleId &&
      host.sidearm?.selectFire
    ) {
      host.sidearm.setFireMode(nextFireMode(host.sidearm.fireMode))
      host.triggerDown = false
      host.audio.weaponSound('safety', host.camera.position.toArray())
      host.report(host.sidearm.fireMode === 'semi' ? 'SEMI' : 'AUTO')
      return
    }
    if (action === 'weapon.auto' && host.weaponDrawn && !sim.player.vehicleId && host.sidearm) {
      host.magazineAction = 'automatic'
      host.triggerDown = false
      return
    }
    if (action === 'headlamp' && !sim.player.vehicleId) {
      host.setHeadlamp(!host.headlampEnabled)
      return
    }
    if (action === 'horn' && sim.player.vehicleId) {
      host.audio.horn()
      return
    }
    if (action === 'gallery.reset') host.gallery.reset()
    if (action === 'interact' && !sim.player.vehicleId) {
      const id = sim.nearestVehicle()
      if (id && !host.drivingPrepared.has(id)) {
        if (this.enteringVehicle) return
        const entity = host.document.entities.find((e) => e.id === id)
        if (!entity) return
        this.enteringVehicle = true
        const assembly = [entity, ...host.document.entities.filter((e) => e.parentId === id)]
        void host
          .prewarmVehicle(assembly)
          .then(() => {
            if (host.disposed || host.session.simulation !== sim) return
            host.drivingPrepared.add(id)
            if (
              host.session.state === 'playing' &&
              !sim.player.vehicleId &&
              sim.nearestVehicle() === id
            )
              this.dispatch('interact')
          })
          .catch((error) => {
            host.report(t('game.could-not-prepare-the-vehicle-you-can-try-again'))
            console.error('Vehicle preparation failed', error)
          })
          .finally(() => {
            this.enteringVehicle = false
          })
        return
      }
    }
    let message = host.game.dispatch(action)
    if ((action === 'signal.left' || action === 'signal.right') && sim.player.vehicleId) {
      host.view.signal(sim.player.vehicleId, action === 'signal.left' ? -1 : 1)
      message = controlsHint(context, ['signal.left', 'signal.right'])
    }
    if (action === 'lights') {
      if (sim.player.vehicleId) {
        const mode = host.view.cycleVehicleLights(sim.player.vehicleId)
        if (mode !== null) message = host.text(lightModeNotice[mode])
      }
    }
    if (action === 'gps' && sim.player.vehicleId) {
      const open = host.view.toggleVehicleGps(sim.player.vehicleId)
      if (open !== null) message = open ? host.text('GPS on') : host.text('GPS off')
    }
    if (action === 'highBeam' && sim.player.vehicleId) {
      const high = host.view.toggleVehicleHighBeam(sim.player.vehicleId)
      if (high !== null)
        message = high ? host.text('High beams selected') : host.text('Low beams selected')
    }
    if (message) host.report(message)
  }
}
