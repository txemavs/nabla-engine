import { mapCollisionDefaults as tuning } from '../config/simulation.js'
/** Own deferred map-body cooking order and conservative activation around all actors. */
import { Vec3, type Body, type World } from './physics.js'
import { isMapBuilding, type Entity } from '../entity/schema.js'
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
export class MapCollisions {
  readonly deferredMapBodies = new Map<string, { entity: Entity; center: Vec3; radius: number }>()
  readonly mapBodies = new Map<string, Body>()
  private pendingBodyOrder: string[] = []
  private nextBodyOrder = 0
  /** Borrow a physics world; the owning Simulation releases it after this registry is cleared. */
  constructor(private readonly world: World) {}
  /** Force distance ordering to refresh after a streamed batch or visibility change. */
  invalidate(): void {
    this.nextBodyOrder = 0
  }
  /** Cook nearby colliders under a soft time/count budget; immediate safety bodies may exceed it. */
  install(
    actors: readonly Body[],
    buildingsEnabled: boolean,
    collisionDistance: number,
    installBody: (entity: Entity) => void,
  ): void {
    const started = performance.now()
    let installed = 0
    const distance = (pending: { center: Vec3; radius: number }) => {
      let nearest = Infinity
      for (const actor of actors)
        nearest = Math.min(
          nearest,
          actor.position.distanceTo(pending.center) -
            pending.radius -
            actor.boundingRadius -
            actor.velocity.length() * tuning.lookAheadSeconds,
        )
      return nearest
    }
    if (started >= this.nextBodyOrder) {
      const distances = new Map([...this.deferredMapBodies].map(([id, p]) => [id, distance(p)]))
      this.pendingBodyOrder = [...distances.keys()].sort(
        (a, b) => distances.get(a)! - distances.get(b)!,
      )
      this.nextBodyOrder = started + tuning.reorderIntervalMs
    }
    for (const id of this.pendingBodyOrder) {
      const pending = this.deferredMapBodies.get(id)
      if (!pending) continue
      if (!buildingsEnabled && isMapBuilding(pending.entity)) continue
      const gap = distance(pending)
      // Ordered distances are refreshed at most every 200 ms. Keep a travel margin.
      if (gap > collisionDistance + tuning.orderingMargin) break
      if (gap > collisionDistance) continue
      // Immediate safety colliders can exceed this soft budget; distant cooking cannot.
      const critical = gap < tuning.criticalDistance
      if (
        !critical &&
        (installed >= tuning.installCount || performance.now() - started >= tuning.installBudgetMs)
      )
        break
      installBody(pending.entity)
      this.deferredMapBodies.delete(id)
      installed++
    }
  }
  /** Retain terrain/actors, toggling only registered map bodies using velocity look-ahead. */
  update(
    actors: readonly Body[],
    buildingsEnabled: boolean,
    collisionDistance: number,
    entitiesById: ReadonlyMap<string, Entity>,
  ): void {
    // Collider installation has its own per-frame budget in step().
    for (const [id, body] of this.mapBodies) {
      if (!buildingsEnabled && isMapBuilding(entitiesById.get(id))) {
        if (body.world === this.world) this.world.removeBody(body)
        continue
      }
      if (body.aabbNeedsUpdate) body.updateAABB()
      const active = actors.some((actor) => {
        const p = actor.position,
          lo = body.aabb.lowerBound,
          hi = body.aabb.upperBound
        const distance = Math.hypot(
          p.x - clamp(p.x, lo.x, hi.x),
          p.y - clamp(p.y, lo.y, hi.y),
          p.z - clamp(p.z, lo.z, hi.z),
        )
        // Two seconds of look-ahead covers fast flight and the throttled update interval.
        return (
          distance <
          collisionDistance +
            actor.velocity.length() * tuning.lookAheadSeconds +
            actor.boundingRadius
        )
      })
      if (active && body.world !== this.world) this.world.addBody(body)
      else if (!active && body.world === this.world) this.world.removeBody(body)
    }
  }
  /** Drop registry references after the owner removes bodies from the world. */
  clear(): void {
    this.mapBodies.clear()
    this.deferredMapBodies.clear()
    this.pendingBodyOrder.length = 0
    this.nextBodyOrder = 0
  }
}
