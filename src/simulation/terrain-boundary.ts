/** Keep actors within finite authored terrain patches while allowing adjacent-tile seams. */
import { Vec3, Quaternion, type Body } from './physics.js'
import { terrainHeight } from '../planet/land/terrain.js'
import type { Entity, Transform } from '../entity/schema.js'
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
/** Clamp bodies near ground to covered terrain; high-altitude flight remains unrestricted. */
export function constrainTerrainBoundary(
  grounds: readonly { e: Entity; pose: Transform }[],
  actors: readonly Body[],
): void {
  if (!grounds.length) return
  for (const b of actors) {
    let nearest: { point: Vec3; distance: number; height: number } | null = null
    for (const { e, pose } of grounds) {
      const t = e.terrain!,
        hx = ((t.columns - 1) * t.spacing) / 2,
        hz = ((t.rows - 1) * t.spacing) / 2
      const q = new Quaternion(...pose.rotation),
        origin = new Vec3(...pose.position)
      const p = q.inverse().vmult(b.position.vsub(origin))
      const neighbor = (dx: number, dz: number) =>
        grounds.some(
          (g) =>
            g.e.id !== e.id &&
            Math.abs(g.pose.position[0] - pose.position[0] - dx) < 0.01 &&
            Math.abs(g.pose.position[2] - pose.position[2] - dz) < 0.01,
        )
      const x = clamp(p.x, -hx + (neighbor(-2 * hx, 0) ? 0 : 8), hx - (neighbor(2 * hx, 0) ? 0 : 8))
      const z = clamp(p.z, -hz + (neighbor(0, -2 * hz) ? 0 : 8), hz - (neighbor(0, 2 * hz) ? 0 : 8))
      const distance = Math.hypot(x - p.x, z - p.z)
      if (!nearest || distance < nearest.distance)
        nearest = {
          point: q.vmult(new Vec3(x, p.y, z)).vadd(origin),
          distance,
          height: terrainHeight(t, x, z) + pose.position[1],
        }
    }
    if (!nearest || nearest.distance < 1e-6 || b.position.y > nearest.height + 20) continue
    if (Math.abs(b.position.x - nearest.point.x) > 1e-6) b.velocity.x = 0
    if (Math.abs(b.position.z - nearest.point.z) > 1e-6) b.velocity.z = 0
    b.position.copy(nearest.point)
    b.aabbNeedsUpdate = true
  }
}
