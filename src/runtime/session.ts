/**
 * Own the simulation lifetime without owning a renderer or animation clock.
 * Hosts pass elapsed seconds; cancellation generations prevent late initialization
 * from reviving a stopped session. Authored scenes remain isolated from physics.
 */
import { initPhysics } from '../simulation/physics.js'
import { Simulation, idleInput, type PlayerInput } from '../simulation/simulation.js'
import type { SceneDocument } from '../scene/document.js'

export type SessionState = 'stopped' | 'loading' | 'playing' | 'paused' | 'disposed'
export type PlayOptions = NonNullable<ConstructorParameters<typeof Simulation>[1]> & {
  vehicleId?: string
  collisionDistance?: number
}

/** One simulation per play session. No DOM, renderer, input listeners or private clock.
 * The scene passed to play is copied before asynchronous initialization starts.
 */
export class PlaySession {
  private generation = 0
  private current: Simulation | null = null
  private phase: SessionState = 'stopped'

  /** Read the lifecycle phase without advancing initialization or physics. */
  get state(): SessionState {
    return this.phase
  }
  /** Return the owned simulation, or null before initialization and after stop. */
  get simulation(): Simulation | null {
    return this.current
  }

  /**
   * Replace the previous session with a simulation of a copied document.
   * Reject if initialization is cancelled, physics fails or the session is disposed.
   * The returned simulation remains session-owned; callers must not dispose it.
   */
  async play(document: SceneDocument, options: PlayOptions = {}): Promise<Simulation> {
    this.assertAlive()
    this.stop()
    const generation = ++this.generation
    const scene = structuredClone(document)
    const settings = { ...options }
    this.phase = 'loading'
    try {
      await initPhysics()
      if (generation !== this.generation) throw new Error('Play session cancelled')
      const simulation = new Simulation(scene, settings)
      try {
        if (settings.collisionDistance !== undefined)
          simulation.setCollisionDistance(settings.collisionDistance)
        if (settings.vehicleId) simulation.startInVehicle(settings.vehicleId)
      } catch (error) {
        simulation.dispose()
        throw error
      }
      this.current = simulation
      this.phase = 'playing'
      return simulation
    } catch (error) {
      if (generation === this.generation) this.phase = 'stopped'
      throw error
    }
  }

  /** Call once from the owning runtime's frame. Paused time is never accumulated. */
  step(elapsed: number, input: PlayerInput = idleInput(), waterLevel = 0): void {
    this.assertAlive()
    if (this.phase !== 'playing' || !this.current) return
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error('Invalid frame duration')
    this.current.setInput(input)
    this.current.setWaterLevel(waterLevel)
    this.current.step(Math.min(elapsed, 0.1))
  }

  /** Clear movement commands and suspend stepping; retain the simulation for resume. */
  pause(): void {
    this.assertAlive()
    if (this.phase !== 'playing') return
    this.current?.setInput(idleInput())
    this.phase = 'paused'
  }

  /** Resume only a paused simulation; reject use after disposal. */
  resume(): void {
    this.assertAlive()
    if (this.phase === 'paused') this.phase = 'playing'
  }

  /** Cancel pending initialization and release physics. Safe to repeat after disposal. */
  stop(): void {
    if (this.phase === 'disposed') return
    this.generation++
    this.current?.dispose()
    this.current = null
    this.phase = 'stopped'
  }

  /** Stop and permanently close the session. Repeated disposal is harmless. */
  dispose(): void {
    if (this.phase === 'disposed') return
    this.stop()
    this.phase = 'disposed'
  }

  /** Enforce the terminal lifecycle state before operations that require a live owner. */
  private assertAlive(): void {
    if (this.phase === 'disposed') throw new Error('Play session disposed')
  }
}
