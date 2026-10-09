/**
 * Coordinate device-independent gameplay for editor and browser hosts.
 * Physics uses seconds and metres; camera entrance timestamps use milliseconds.
 * The host owns focus policy, rendering and scheduling, while this coordinator
 * owns session state, held input, camera transitions and local portal events.
 */
import type { GameCameraSettings } from '../config/camera.js'
import { createRuntimeText } from './messages.js'
import { GameplayStreaming } from './streaming.js'
import { Quaternion, Vector3 } from 'three'
import type { SceneDocument } from '../scene/document.js'
import type { Entity } from '../entity/schema.js'
import { idleInput, type PlayerInput } from '../simulation/simulation.js'
import type { RoadCenterline } from '../simulation/road-snap.js'
import type { PavedArea } from '../simulation/wheel-surface.js'
import { overheadDrivingHeight } from '../render/entity/driving-camera.js'
import { PlaySession, type PlayOptions } from './session.js'
import { GameInput, type GameInputSources } from './input.js'
import { HeldKeys } from './held-keys.js'
import { createGameCameraState, cycleGameCamera, updateGameCamera } from './game-camera.js'

/** Notices shown when C / gamepad B changes the view (English keys, see messages.es.ts). */
const cameraNotice = {
  'first-person': 'First person',
  'third-person': 'Third person',
  chase: 'Chase camera',
  cockpit: 'Driver camera',
  map: 'Overhead camera · scroll to zoom',
  cinematic: 'Cinematic camera · scroll to change distance',
} as const

/** Shared game coordination. Hosts supply rendering, device events and editor UI. */
export class GameRuntime {
  /** Per-host text resolver; headless callers default to English. */
  text = createRuntimeText()
  readonly streaming = new GameplayStreaming()
  readonly session = new PlaySession()
  readonly cameraState = createGameCameraState()
  readonly keys = new HeldKeys()
  private readonly input = new GameInput()
  private scene: SceneDocument | null = null
  private vehicle: string | null = null
  private interior: string | null = null
  private portalSequence = 0
  private jumpRequested = false
  private readonly boarded = new Set<string>()
  /**
   * R reset policy. `snapToRoad` moves the car to the nearest road/vía before uprighting;
   * `roads` lets the host add streamed centrelines (OSM navigation roads) to the scene roads.
   */
  readonly recover: {
    snapToRoad: boolean
    roads?: () => Iterable<RoadCenterline>
    /** Paved non-road areas (car parks) for the tyre surface. */
    pavedAreas?: () => Iterable<PavedArea>
  } = {
    snapToRoad: false,
  }

  /** Copy per-application camera overrides; replay retains them. */
  constructor(options: { camera?: Partial<GameCameraSettings> } = {}) {
    Object.assign(this.cameraState, createGameCameraState(options.camera))
  }

  /** Expose the session-owned simulation for presentation, or null outside a live session. */
  get simulation() {
    return this.session.simulation
  }
  /** Read the session phase; this accessor has no lifecycle side effects. */
  get state() {
    return this.session.state
  }

  /** Copy the authored scene, replace physics and initialize camera yaw from the spawn pose. */
  async play(document: SceneDocument, options: PlayOptions = {}) {
    this.releaseInput()
    this.streaming.reset()
    this.scene = structuredClone(document)
    const sim = await this.session.play(document, options)
    Object.assign(this.cameraState, createGameCameraState(this.cameraState.settings))
    const spawn = document.entities.find((e) => e.kind === 'spawn')!
    const forward = new Vector3(0, 0, -1).applyQuaternion(
      new Quaternion(...spawn.transform.rotation),
    )
    this.cameraState.yaw = Math.atan2(-forward.x, -forward.z)
    this.cameraState.mode = options.vehicleId ? 'cockpit' : 'chase'
    this.vehicle = options.vehicleId ?? null
    this.interior = null
    this.portalSequence = 0
    this.boarded.clear()
    if (this.vehicle) this.boarded.add(this.vehicle)
    return sim
  }
  /** Clear held controls, steering history and queued jumps, then idle the active simulation. */
  releaseInput(): void {
    this.keys.clear()
    this.input.reset()
    this.jumpRequested = false
    this.simulation?.setInput(idleInput())
  }
  /** Release controls before suspending physics so resume cannot replay a held command. */
  pause(): void {
    this.releaseInput()
    this.session.pause()
  }
  /** Resume a paused session without restoring previously held controls. */
  resume(): void {
    this.session.resume()
  }
  /** Release controls, discard streaming history and close the current simulation. */
  stop(): void {
    this.releaseInput()
    this.streaming.reset()
    this.session.stop()
    this.scene = null
  }
  /** Stop gameplay and permanently close the session owner. */
  dispose(): void {
    this.stop()
    this.session.dispose()
  }

  /** Register vehicles added to the live simulation so input mixing sees their definitions. */
  addVehicles(added: Entity[]): void {
    this.scene?.entities.push(...structuredClone(added))
  }
  /** Register scenery placed in the live simulation (portals, sprites, lamps). */
  addPlaced(added: Entity[]): void {
    this.scene?.entities.push(...structuredClone(added))
  }
  /** Forget scenery removed from the live simulation. */
  removePlaced(ids: readonly string[]): void {
    if (this.scene) this.scene.entities = this.scene.entities.filter((e) => !ids.includes(e.id))
  }
  /** Forget a vehicle removed from the live simulation. */
  removeVehicle(id: string): void {
    if (this.scene)
      this.scene.entities = this.scene.entities.filter(
        (e) => e.id !== id && !(e.parentId === id && e.portal),
      )
  }

  /** Mix controls using elapsed seconds; align camera/input yaw when entering a new interior. */
  readInput(
    elapsed: number,
    sources: Omit<GameInputSources, 'yaw'> & { yaw?: number },
    document = this.scene!,
  ) {
    const sim = this.simulation
    let yaw = sources.yaw ?? this.cameraState.yaw
    if (sim && this.interior !== sim.player.interiorId) {
      this.interior = sim.player.interiorId
      this.cameraState.yaw = sim.player.yaw
      yaw = sim.player.yaw
    }
    return this.input.read(sim, document, elapsed, {
      ...sources,
      yaw,
    })
  }
  /**
   * Advance physics and synchronize boarding and local portal camera transitions.
   * Elapsed time is seconds, water level is metres and now is milliseconds.
   * Preserve a queued jump until a physics tick occurs. Return a newly observed
   * player/vehicle portal crossing, or null when no relevant crossing occurred.
   */
  step(
    elapsed: number,
    input: PlayerInput,
    waterLevel: number,
    now: number,
    document = this.scene!,
  ) {
    const sim = this.simulation
    if (!sim || this.state !== 'playing') return null
    sim.setSurfaceRoads(this.recover.roads?.())
    sim.setSurfaceAreas(this.recover.pavedAreas?.())
    if (input.forward || input.right || input.brake || input.sprint)
      this.cameraState.entrance = null
    const ticks = sim.stats.ticks
    this.session.step(elapsed, { ...input, jump: input.jump || this.jumpRequested }, waterLevel)
    if (sim.stats.ticks !== ticks) this.jumpRequested = false
    const crossing = sim.portalEvent
    let event: typeof crossing = null
    if (crossing && crossing.sequence !== this.portalSequence) {
      this.portalSequence = crossing.sequence
      if (crossing.actorId === sim.player.vehicleId || crossing.actorId === 'player') {
        if (crossing.actorId === 'player') this.cameraState.yaw = sim.player.yaw
        else this.cameraState.yaw += crossing.yawDelta
        this.cameraState.telemetry.update(sim.player.vehicleId, sim.player.speed, 0, elapsed, true)
        event = crossing
      }
    }
    if (this.vehicle !== sim.player.vehicleId) {
      this.vehicle = sim.player.vehicleId
      this.cameraState.entrance = null
      const definition = document.entities.find((e) => e.id === this.vehicle)?.vehicle
      if (
        this.vehicle &&
        definition &&
        !definition.boat &&
        !definition.plane &&
        !definition.interior
      ) {
        this.cameraState.mode = 'cockpit'
        this.cameraState.mapHeight = overheadDrivingHeight(
          0,
          this.cameraState.mapZoom,
          this.cameraState.settings,
        )
        if (!this.boarded.has(this.vehicle)) {
          this.boarded.add(this.vehicle)
          this.cameraState.entrance = { id: this.vehicle, started: now }
        }
      }
      this.cameraState.headYaw = 0
      this.cameraState.headPitch = this.cameraState.settings.headPitch
    }
    return event
  }
  /** Update the host camera from live physics; now is milliseconds and dt is seconds. */
  updateCamera(
    view: Parameters<typeof updateGameCamera>[1],
    camera: Parameters<typeof updateGameCamera>[2],
    now: number,
    dt: number,
    prepare?: Parameters<typeof updateGameCamera>[6],
  ) {
    if (!this.simulation) throw new Error('Camera requires a running game')
    return updateGameCamera(this.simulation, view, camera, this.cameraState, now, dt, prepare)
  }
  /** Device-independent gameplay actions; presentation-only actions stay with the view. */
  action(code: string): string | undefined {
    const sim = this.simulation
    if (!sim || this.state !== 'playing') return
    if (code === 'KeyE') {
      const previous = sim.player.vehicleId
      const message = sim.interact({
        snapToRoad: this.recover.snapToRoad,
        roads: this.recover.snapToRoad ? this.recover.roads?.() : undefined,
      })
      const id = sim.player.vehicleId
      if (id && id !== previous) {
        const forward = new Vector3(0, 0, -1).applyQuaternion(
          new Quaternion(...sim.entityTransform(id).rotation),
        )
        this.cameraState.yaw = Math.atan2(-forward.x, -forward.z)
      }
      return message
    }
    if (code === 'KeyC') {
      const seated = !!sim.player.vehicleId
      const view = cycleGameCamera(this.cameraState, seated)
      return this.text(cameraNotice[view === 'chase' && !seated ? 'third-person' : view])
    }
    if (code === 'KeyV') return sim.toggleFlight()
    if (code === 'KeyF') return sim.toggleHitch() ?? sim.toggleDock()
    if (code === 'KeyM') return sim.cycleHelmMode()
    if (code === 'KeyB') return sim.automaticTransmission()
    if (code === 'KeyR')
      return sim.recoverVehicle({
        snapToRoad: this.recover.snapToRoad,
        roads: this.recover.snapToRoad ? this.recover.roads?.() : undefined,
      })
    if (code === 'PageUp' || code === 'PageDown')
      return sim.shiftVehicle(code === 'PageUp' ? 1 : -1)
    if (code === 'KeyT') {
      this.cameraState.mode = 'chase'
      return sim.transferControls()
    }
    if (code === 'Space' && !sim.player.vehicleId) this.jumpRequested = true
    return undefined
  }
}
