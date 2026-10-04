/**
 * Coordinate device-independent gameplay for editor and browser hosts.
 * Physics uses seconds and metres; camera entrance timestamps use milliseconds.
 * The host owns focus policy, rendering and scheduling, while this coordinator
 * owns session state, held input, camera transitions and local portal events.
 */
import { GameplayStreaming } from './streaming.js'
import { Quaternion, Vector3 } from 'three'
import type { SceneDocument } from '../scene/document.js'
import { idleInput, type PlayerInput } from '../simulation/simulation.js'
import { overheadDrivingHeight } from '../render/entity/driving-camera.js'
import { PlaySession, type PlayOptions } from './session.js'
import { GameInput, type GameInputSources } from './input.js'
import { HeldKeys } from './held-keys.js'
import { createGameCameraState, updateGameCamera } from './game-camera.js'

/** Shared game coordination. Hosts supply rendering, device events and editor UI. */
export class GameRuntime {
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
    Object.assign(this.cameraState, createGameCameraState())
    const spawn = document.entities.find((e) => e.kind === 'spawn')!
    const forward = new Vector3(0, 0, -1).applyQuaternion(
      new Quaternion(...spawn.transform.rotation),
    )
    this.cameraState.yaw = Math.atan2(-forward.x, -forward.z)
    this.cameraState.mode = options.vehicleId ? 'cockpit' : 'chase'
    this.vehicle = options.vehicleId ?? null
    this.interior = null
    this.portalSequence = 0
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
        this.cameraState.mapHeight = overheadDrivingHeight(0, this.cameraState.mapZoom)
        this.cameraState.entrance = { id: this.vehicle, started: now }
      }
      this.cameraState.headYaw = 0
      this.cameraState.headPitch = 0.05
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
      const message = sim.interact()
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
      const state = this.cameraState
      state.entrance = null
      if (!sim.player.vehicleId) {
        state.firstPerson = !state.firstPerson
        return state.firstPerson ? 'Primera persona' : 'Tercera persona'
      }
      state.mode = state.mode === 'chase' ? 'cockpit' : state.mode === 'cockpit' ? 'map' : 'chase'
      state.pitch = state.mode === 'cockpit' ? 0.05 : 0.24
      state.headYaw = 0
      state.headPitch = 0.05
      return state.mode === 'map'
        ? 'Cámara cenital · rueda para acercar o alejar'
        : state.mode === 'cockpit'
          ? 'Cámara del conductor'
          : 'Cámara exterior'
    }
    if (code === 'KeyV') return sim.toggleFlight()
    if (code === 'KeyF') return sim.toggleDock()
    if (code === 'KeyM') return sim.cycleHelmMode()
    if (code === 'KeyB') return sim.automaticTransmission()
    if (code === 'KeyR') return sim.recoverVehicle()
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
