import * as THREE from 'three'
import type { Entity, Vec3Tuple } from '../entity/schema.js'
import type { SceneDocument } from '../scene/document.js'
import type { SceneView } from '../presentation/scene-view.js'
import type { GameRuntime } from './game.js'
import type { Simulation } from '../simulation/simulation.js'
import { threadedSimulation } from '../simulation/threaded-simulation.js'
import { playGroundClearance } from './placement.js'
import { showLoadingBadge } from './loading-badge.js'
import type { VehicleWarmup } from './vehicle-warmup.js'
import { AccidentReplacement, replacementRoadSpot } from './accident-replacement.js'
import { navigationRoads } from '../render/entity/navigation-places.js'
import type {
  VehicleLampState,
  VehicleLightSwitches,
} from '../render/vehicle-presentation/light-controller.js'
import type { RuntimeText } from './messages.js'

type VehicleLightState = VehicleLightSwitches & VehicleLampState

export interface VehiclePresentationHost {
  readonly canvas: Pick<HTMLCanvasElement, 'dataset' | 'parentElement'>
  readonly session: GameRuntime['session']
  readonly document: SceneDocument
  readonly game: Pick<GameRuntime, 'addVehicles' | 'removeVehicle'>
  readonly view: Pick<
    SceneView,
    | 'addVehicles'
    | 'removeVehicle'
    | 'setVehiclePaint'
    | 'vehicleLightState'
    | 'setVehicleLightState'
    | 'objects'
    | 'destruction'
    | 'wreckParts'
    | 'root'
  >
  readonly disposed: boolean
  readonly smokeEnabled: boolean
  readonly cameraYaw: number
  readonly replacementVehicles: readonly (readonly Entity[])[] | undefined
  text: RuntimeText
  assertAlive(): void
  hasWorld(): boolean
  waitForGround(x: number, z: number, timeoutMs: number): Promise<number>
  sceneGroundHeight(player: Vec3Tuple, x: number, z: number): number
  rebuildMonitors(): void
  createWarmup(): Pick<VehicleWarmup, 'warm' | 'dispose'>
  pause(): void
  resume(): void
  destructionSound(position: Vec3Tuple): void
}

/** Coordinates vehicle presentation while physics, rendering resources and audio retain their owners. */
export class RuntimeVehiclePresentation {
  private vehicleWarmup: Pick<VehicleWarmup, 'warm' | 'dispose'> | null = null
  readonly drivingPrepared = new Set<string>()
  private vehiclePreparationCount = 0
  private finishVehiclePreparation: (() => void) | null = null
  private spawned: string[] = []
  private spawnSequence = 0
  private accidentReplacement?: AccidentReplacement
  constructor(private readonly host: VehiclePresentationHost) {}

  async placeVehicle(
    template: Entity | readonly Entity[],
    position: Vec3Tuple,
    yaw = 0,
    timeoutMs?: number,
  ): Promise<string> {
    this.host.assertAlive()
    const [vehicle, ...hostedTemplates] = Array.isArray(template) ? template : [template as Entity]
    if (!vehicle) throw new Error('A vehicle template is required')
    for (const child of hostedTemplates)
      if (child.parentId !== vehicle.id)
        throw new Error(`Entity ${child.id} must be hosted by ${vehicle.id}`)
    const sim = this.host.session.simulation
    if (!sim) throw new Error('A running game is required')
    const [x, , z] = position
    // Place the parked model now. Full driving preparation is deferred until first entry.
    // Behind an intro (`beforeReveal`) the host's cards cover loading; no badge over them.
    let ground: number
    if (this.host.hasWorld()) {
      const hide =
        this.host.canvas.dataset.reveal === 'preparing'
          ? () => {}
          : showLoadingBadge(this.host.canvas.parentElement, this.host.text('Waiting for terrain…'))
      try {
        ground = await this.host.waitForGround(x, z, timeoutMs ?? 120_000)
      } finally {
        hide()
      }
    } else ground = this.host.sceneGroundHeight(sim.player.position, x, z)
    this.host.assertAlive()
    if (this.host.session.simulation !== sim) throw new Error('Vehicle placement session ended')
    const id = `spawned-${++this.spawnSequence}`
    const entity: Entity = {
      ...structuredClone(vehicle),
      id,
      parentId: null,
      transform: {
        position: [x, 0, z],
        rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
      },
    }
    entity.transform.position[1] = ground + playGroundClearance(entity)
    // `carrier-stern` becomes `spawned-N-stern`; local transforms stay relative to the host.
    const hosted = hostedTemplates.map((child): Entity => ({
      ...structuredClone(child),
      id:
        id + (child.id.startsWith(vehicle.id) ? child.id.slice(vehicle.id.length) : `-${child.id}`),
      parentId: id,
    }))
    const added = [entity, ...hosted]
    // Physics first: with the worker (the default) the ids exist there only after its next
    // step, and the vehicle view reads vehicle state as soon as it is registered.
    sim.addVehicles(added)
    await threadedSimulation(sim)?.whenEntities(added.map((e) => e.id))
    this.host.assertAlive()
    if (this.host.session.simulation !== sim) throw new Error('Vehicle placement session ended')
    const modelsReady = this.host.view.addVehicles(added)
    this.host.game.addVehicles(added)
    // Ships with an interior (carrier) get their helm/telemetry/map/systems/portal monitor
    // panels from the document; a carrier placed after start needs them rebuilt or its screens
    // stay dark.
    if (entity.vehicle?.interior || hosted.some((e) => e.portal)) this.host.rebuildMonitors()
    this.spawned.push(id)
    // Parked geometry must be visible even before its driving presentation is prepared.
    await modelsReady
    return id
  }

  async prewarmVehicle(
    template: Entity | readonly Entity[],
    progress?: (phase: string) => Promise<void>,
  ): Promise<void> {
    this.host.assertAlive()
    const entities = Array.isArray(template) ? template : [template as Entity]
    this.vehicleWarmup ??= this.host.createWarmup()
    let started = false
    let badge: ReturnType<typeof showLoadingBadge> | undefined
    try {
      await this.vehicleWarmup.warm(entities, async (phase) => {
        if (!started && this.host.canvas.dataset.reveal !== 'preparing') {
          started = true
          if (this.vehiclePreparationCount++ === 0 && this.host.session.state === 'playing') {
            const simulation = this.host.session.simulation
            this.host.pause()
            this.finishVehiclePreparation = () => {
              if (
                !this.host.disposed &&
                this.host.session.simulation === simulation &&
                this.host.session.state === 'paused'
              )
                this.host.resume()
            }
          }
          badge = showLoadingBadge(this.host.canvas.parentElement, '')
        }
        const vehicle = entities[0]?.vehicle
        const module = vehicle?.twoWheeled
          ? 'motos'
          : vehicle?.hitch && !vehicle.passive
            ? 'camión articulado'
            : (entities[0]?.name ?? 'vehículo')
        badge?.update(`PLEASE WAIT · Cargando módulo de simulación de ${module} · ${phase}`)
        await progress?.(phase)
      })
    } finally {
      badge?.()
      if (started && --this.vehiclePreparationCount === 0) {
        const finish = this.finishVehiclePreparation
        this.finishVehiclePreparation = null
        finish?.()
      }
    }
  }

  setVehiclePaint(id: string, color: string, finish: 'paint' | 'chrome' = 'paint'): void {
    this.host.assertAlive()
    this.host.view.setVehiclePaint(id, color, finish)
  }

  vehicleLightState(id: string): VehicleLightState | null {
    const switches = this.host.view.vehicleLightState(id)
    const sim = this.host.session.simulation
    if (!switches || !sim) return null
    const info = sim.vehicleInfo(id)
    return {
      ...switches,
      powered: sim.player.vehicleId === id || info.ignition === 'running',
      braking: info.braking,
      reversing: info.reversing,
    }
  }

  setVehicleLightState(id: string, state: VehicleLightState | null): boolean {
    this.host.assertAlive()
    if (!state) return this.host.view.setVehicleLightState(id, null, null)
    const { powered, braking, reversing, ...switches } = state
    return this.host.view.setVehicleLightState(id, switches, { powered, braking, reversing })
  }

  removeSpawnedVehicle(id: string): void {
    this.host.assertAlive()
    if (!this.spawned.includes(id)) throw new Error(`Not a spawned vehicle: ${id}`)
    this.removeWorldVehicle(id)
  }

  removeWorldVehicle(id: string): void {
    this.host.assertAlive()
    const sim = this.host.session.simulation
    if (sim) sim.removeVehicle(id)
    this.host.view.removeVehicle(id)
    this.host.game.removeVehicle(id)
    this.spawned = this.spawned.filter((other) => other !== id)
    this.host.rebuildMonitors()
  }

  get spawnedVehicles(): { id: string; name: string }[] {
    return this.spawned.map((id) => ({
      id,
      name: this.host.document.entities.find((e) => e.id === id)?.name ?? id,
    }))
  }

  updateDamage(sim: Simulation, dt: number, playing: boolean): void {
    const replacement = playing ? this.accidentReplacement?.step(dt) : null
    if (replacement && this.host.hasWorld()) {
      const occupied = sim.vehicleList().map(({ id, entity }) => ({
        position: sim.entityTransform(id).position,
        size: entity.size,
      }))
      const spot = replacementRoadSpot(
        sim.player.position,
        sim.player.vehicleId ? sim.player.yaw : this.host.cameraYaw,
        replacement[0],
        navigationRoads().filter((road) => road.carriageway),
        occupied,
      )
      if (spot)
        void this.placeVehicle(replacement, spot.position, spot.yaw, 8000).catch((error) =>
          console.warn('Accident replacement unavailable', error),
        )
    }
    for (const explosion of sim.consumeExplosions()) {
      const object = this.host.view.objects.get(explosion.entityId)
      if (object)
        this.host.view.destruction.explode(
          explosion.entityId,
          object,
          this.host.view
            .wreckParts(explosion.entityId)
            .filter((part) => part.parent === this.host.view.root),
        )
      this.host.destructionSound(explosion.position)
      if (
        (explosion.occupied || sim.playerEjection?.vehicleId === explosion.entityId) &&
        explosion.cause === 'impact'
      ) {
        this.accidentReplacement ??= new AccidentReplacement(this.host.replacementVehicles ?? [])
        this.accidentReplacement.schedule()
      }
    }
    for (const entity of this.host.document.entities) {
      if (entity.kind !== 'vehicle') continue
      const object = this.host.view.objects.get(entity.id)
      if (object)
        this.host.view.destruction.setDamage(entity.id, object, sim.vehicleDamage(entity.id).health)
    }
    this.host.view.destruction.update(
      dt,
      this.host.smokeEnabled,
      (from, direction, length, excludeEntityId) => {
        const hit = sim.shoot(
          from.toArray() as Vec3Tuple,
          direction.toArray() as Vec3Tuple,
          length,
          0,
          excludeEntityId,
        )
        return hit
          ? { point: new THREE.Vector3(...hit.point), normal: new THREE.Vector3(...hit.normal) }
          : null
      },
    )
  }

  reset(): void {
    this.accidentReplacement?.clear()
    this.drivingPrepared.clear()
  }

  dispose(): void {
    this.vehicleWarmup?.dispose()
  }
}
