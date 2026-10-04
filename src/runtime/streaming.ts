/** Coordinate terrain requests from live gameplay positions, in the current world frame. */
import type { SceneDocument } from '../scene/document.js'
import type { Vec3Tuple } from '../entity/schema.js'

export interface GameplayWorldStream {
  update(position: Vec3Tuple, velocity: Vec3Tuple, protectedPositions: Vec3Tuple[]): void
}
/** Shared terrain request cadence and support under vehicles/portals during play. */
export class GameplayStreaming {
  private sample: { at: number; position: Vec3Tuple } | null = null
  /** Return a defensive copy of the last sampled position, in metres. */
  get position(): Vec3Tuple | null {
    return this.sample ? [...this.sample.position] : null
  }
  /** Discard velocity history before replay, origin changes or a different clock. */
  reset(): void {
    this.sample = null
  }
  /**
   * Request terrain at intervals greater than 500 ms, protecting vehicles and portal endpoints.
   * Time is a monotonic timestamp in milliseconds; velocity is estimated in metres/second.
   * Ignore non-finite timestamps. A backward timestamp restarts sampling with zero velocity.
   * Return whether a request was submitted; store copies so physics cannot mutate history.
   */
  update(
    world: GameplayWorldStream,
    sim: { player: { position: Vec3Tuple }; entityTransform(id: string): { position: Vec3Tuple } },
    document: SceneDocument,
    time: number,
  ): boolean {
    if (!Number.isFinite(time)) return false
    if (this.sample && time >= this.sample.at && time - this.sample.at <= 500) return false
    const position: Vec3Tuple = [...sim.player.position]
    const elapsed = this.sample ? (time - this.sample.at) / 1000 : 0
    const velocity = position.map((value, axis) =>
      this.sample && elapsed > 0 ? (value - this.sample.position[axis]) / elapsed : 0,
    ) as Vec3Tuple
    const protectedPositions = document.entities
      .filter((entity) => entity.kind === 'vehicle' || entity.portal)
      .map((entity) => [...sim.entityTransform(entity.id).position] as Vec3Tuple)
    world.update(position, velocity, protectedPositions)
    this.sample = { at: time, position: [...position] }
    return true
  }
}
