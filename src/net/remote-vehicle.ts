import type { Transform, Vec3Tuple } from '../math/frame/vectors.js'
import { SnapshotBuffer, defaultInterpolation, type InterpolationOptions } from './interpolation.js'
import type { EntityState, SnapshotExtra, WheelVisuals } from './protocol.js'

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
  /** Optional: show received wheel values (steer, suspension, spin) instead of local raycasts. */
  setWheelVisualState?(id: string, state: WheelVisuals | null): boolean
}

/**
 * A locally spawned body that mirrors one remote peer. It is switched to kinematic so local
 * physics cannot push it, but local bodies still collide against it.
 */
export class RemoteVehicle {
  readonly buffer: SnapshotBuffer
  private attached = false
  private wheelsDriven = false
  /**
   * Local entity mirroring the peer; null while the game is still placing it (snapshots are
   * buffered meanwhile). Hosts often assign their own ids on placement, so set it from there.
   */
  entityId: string | null
  constructor(
    entityId: string | null,
    private readonly host: KinematicHost,
    options: InterpolationOptions = defaultInterpolation,
  ) {
    this.entityId = entityId
    this.buffer = new SnapshotBuffer(options)
  }

  /** Latest game-defined values received (applied as-is, not interpolated). */
  extra: SnapshotExtra | null = null
  push(t: number, state: EntityState, receivedAt: number, extra?: SnapshotExtra): void {
    this.buffer.push({ t, state }, receivedAt)
    if (extra) this.extra = extra
  }

  /** Call once per frame before `Simulation.step`. Returns the applied state, if any. */
  update(now: number): EntityState | null {
    const state = this.buffer.sample(now)
    if (!state || this.entityId === null) return null
    if (!this.attached) this.attached = this.host.setEntityKinematic(this.entityId, true)
    if (!this.attached) return null
    this.host.moveKinematicEntity(
      this.entityId,
      { position: state.position, rotation: state.rotation },
      state.velocity,
      state.angularVelocity,
    )
    if (state.wheels && this.host.setWheelVisualState) {
      this.host.setWheelVisualState(this.entityId, state.wheels)
      this.wheelsDriven = true
    }
    return state
  }

  /** Hand the body back to dynamic physics (for example before despawning or taking it over). */
  release(): void {
    if (this.wheelsDriven && this.entityId !== null)
      this.host.setWheelVisualState?.(this.entityId, null)
    this.wheelsDriven = false
    if (this.attached && this.entityId !== null) this.host.setEntityKinematic(this.entityId, false)
    this.attached = false
  }
}
