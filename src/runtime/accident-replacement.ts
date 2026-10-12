import type { Entity } from '../entity/schema.js'
import { nearestRoadPoint, type RoadCenterline } from '../simulation/road-snap.js'
import type { Vec3Tuple } from '../math/frame/vectors.js'

/** One replacement per occupied-vehicle accident, paced by gameplay time. */
export class AccidentReplacement {
  private pending: { template: readonly Entity[]; seconds: number } | null = null
  constructor(
    private readonly choices: readonly (readonly Entity[])[],
    private readonly random = Math.random,
  ) {}
  schedule(): void {
    if (!this.choices.length || this.pending) return
    this.pending = {
      template: this.choices[Math.floor(this.random() * this.choices.length)],
      seconds: 2,
    }
  }
  step(dt: number): readonly Entity[] | null {
    if (!this.pending) return null
    this.pending.seconds -= Math.max(0, dt)
    if (this.pending.seconds > 1e-6) return null
    const template = this.pending.template
    this.pending = null
    return template
  }
  clear(): void {
    this.pending = null
  }
}

/** Same road-centre projection as R, constrained behind the player and clear of other vehicles. */
export function replacementRoadSpot(
  player: Vec3Tuple,
  yaw: number,
  vehicle: Entity,
  roads: readonly RoadCenterline[],
  occupied: readonly { position: Vec3Tuple; size: Vec3Tuple }[],
): { position: Vec3Tuple; yaw: number } | null {
  const fx = -Math.sin(yaw),
    fz = -Math.cos(yaw)
  const radius = Math.hypot(vehicle.size[0], vehicle.size[2]) / 2
  for (const back of [12, 20, 32, 48, 64]) {
    const x = player[0] - fx * back,
      z = player[2] - fz * back
    const candidates = roads
      .flatMap((road) => {
        if (road.width < vehicle.size[0] + 0.5) return []
        const at = nearestRoadPoint(x, z, [road], 60)
        return at ? [at] : []
      })
      .sort((a, b) => a.distance - b.distance)
    for (const at of candidates) {
      if ((at.x - player[0]) * fx + (at.z - player[2]) * fz > -6) continue
      if (Math.hypot(at.x - player[0], at.z - player[2]) > 100) continue
      if (
        occupied.some(
          (other) =>
            Math.hypot(at.x - other.position[0], at.z - other.position[2]) <
            radius + Math.hypot(other.size[0], other.size[2]) / 2 + 1,
        )
      )
        continue
      const sign = at.dx * fx + at.dz * fz < 0 ? -1 : 1
      return { position: [at.x, player[1], at.z], yaw: Math.atan2(-at.dx * sign, -at.dz * sign) }
    }
  }
  return null
}
