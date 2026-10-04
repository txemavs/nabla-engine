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

  get state(): SessionState {
    return this.phase
  }
  get simulation(): Simulation | null {
    return this.current
  }

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

  pause(): void {
    this.assertAlive()
    if (this.phase !== 'playing') return
    this.current?.setInput(idleInput())
    this.phase = 'paused'
  }

  resume(): void {
    this.assertAlive()
    if (this.phase === 'paused') this.phase = 'playing'
  }

  stop(): void {
    if (this.phase === 'disposed') return
    this.generation++
    this.current?.dispose()
    this.current = null
    this.phase = 'stopped'
  }

  dispose(): void {
    if (this.phase === 'disposed') return
    this.stop()
    this.phase = 'disposed'
  }

  private assertAlive(): void {
    if (this.phase === 'disposed') throw new Error('Play session disposed')
  }
}
