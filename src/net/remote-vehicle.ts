import type { Transform, Vec3Tuple } from '../math/frame/vectors.js'
import { SnapshotBuffer, defaultInterpolation, type InterpolationOptions } from './interpolation.js'
import type { EntityState } from './protocol.js'

/**
 * The part of the simulation a remote entity needs. `Simulation` satisfies it structurally, so
 * this module does not import the simulation coordinator.
 */
export interface KinematicHost {
  setEntityKinematic(id: string, kinematic: boolean): boolean
  moveKinematicEntity(
    id: string,
    transform: Transform,
    velocity?: Vec3Tuple,
    angularVelocity?: Vec3Tuple,
  ): boolean
}

/**
 * A locally spawned body that mirrors one remote peer. It is switched to kinematic so local
 * physics cannot push it, but local bodies still collide against it.
 */
export class RemoteVehicle {
  readonly buffer: SnapshotBuffer
  private attached = false
  constructor(
    readonly entityId: string,
    private readonly host: KinematicHost,
    options: InterpolationOptions = defaultInterpolation,
  ) {
    this.buffer = new SnapshotBuffer(options)
  }

  push(t: number, state: EntityState, receivedAt: number): void {
    this.buffer.push({ t, state }, receivedAt)
  }

  /** Call once per frame before `Simulation.step`. Returns the applied state, if any. */
  update(now: number): EntityState | null {
    const state = this.buffer.sample(now)
    if (!state) return null
    if (!this.attached) this.attached = this.host.setEntityKinematic(this.entityId, true)
    if (!this.attached) return null
    this.host.moveKinematicEntity(
      this.entityId,
      { position: state.position, rotation: state.rotation },
      state.velocity,
      state.angularVelocity,
    )
    return state
  }

  /** Hand the body back to dynamic physics (for example before despawning or taking it over). */
  release(): void {
    if (this.attached) this.host.setEntityKinematic(this.entityId, false)
    this.attached = false
  }
}
