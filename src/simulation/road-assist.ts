/** Optional road-centre attraction with a scene-revision spatial index. */
import { Quaternion as RenderQuaternion, Vector3 } from 'three'
import { Vec3 } from './physics.js'
import type { Vehicle } from '../entity/vehicle/vehicle.js'
import type { Entity, Vec3Tuple } from '../entity/schema.js'
import type { SceneGraph } from '../scene/graph.js'
import { terrainHeight } from '../planet/land/terrain.js'
import { nearestRoadCenterline } from '../planet/land/roads/draped-road.js'
export class RoadAssist {
  private assistSource?: readonly Entity[]
  private readonly assistCells = new Map<string, { paths: Vec3Tuple[][]; width: number }[]>()
  enabled = false
  private roadAssistStrength = 0.3
  /** Enable guidance with a normalized strength; manual steering always wins. */
  configure(enabled: boolean, strength = 0.3): void {
    this.enabled = enabled
    this.roadAssistStrength = Math.max(0, Math.min(1, strength))
  }
  /** Return settings without exposing the mutable spatial index. */
  get settings() {
    return { enabled: this.enabled, strength: this.roadAssistStrength }
  }
  /** Apply an optional force to one vehicle; positions are metres, speed is metres/second. */
  apply(
    v: Vehicle,
    steering: number,
    entities: readonly Entity[],
    graph: SceneGraph,
    entitiesById: ReadonlyMap<string, Entity>,
  ): void {
    const speed = v.body.velocity.length()
    if (speed < 0.5 || speed > 40) return

    if (v.definition.flight || Math.abs(steering) > 0.1) return
    if (this.assistSource !== entities) {
      this.assistCells.clear()
      for (const e of entities) {
        if (!e.road || (e.road.elevation && e.road.elevation !== 'terrain')) continue
        const highway = e.source?.tags?.highway
        if (highway && ['footway', 'path', 'pedestrian', 'cycleway', 'steps'].includes(highway))
          continue
        const pose = graph.worldTransform(e.id),
          q = new RenderQuaternion(...pose.rotation)
        const terrain = entitiesById.get(e.road.terrainId)?.terrain
        for (const path of e.road.paths)
          for (let i = 1; i < path.length; i++) {
            const points = [path[i - 1], path[i]].map((p) => {
              const h = terrain ? terrainHeight(terrain, p[0], p[2]) : p[1]
              return new Vector3(p[0], h, p[2])
                .applyQuaternion(q)
                .add(new Vector3(...pose.position))
                .toArray() as Vec3Tuple
            })
            const road = { paths: [points], width: e.road.width }
            for (
              let x = Math.floor((Math.min(points[0][0], points[1][0]) - 20) / 64);
              x <= Math.floor((Math.max(points[0][0], points[1][0]) + 20) / 64);
              x++
            )
              for (
                let z = Math.floor((Math.min(points[0][2], points[1][2]) - 20) / 64);
                z <= Math.floor((Math.max(points[0][2], points[1][2]) + 20) / 64);
                z++
              ) {
                const key = `${x}:${z}`,
                  cell = this.assistCells.get(key) ?? []
                cell.push(road)
                this.assistCells.set(key, cell)
              }
          }
      }
      this.assistSource = entities
    }
    const roads =
      this.assistCells.get(
        `${Math.floor(v.body.position.x / 64)}:${Math.floor(v.body.position.z / 64)}`,
      ) ?? []

    const position: Vec3Tuple = [v.body.position.x, v.body.position.y, v.body.position.z]
    const nearest = nearestRoadCenterline(position, roads, 20, 3)

    if (!nearest || nearest.onRoad) return

    const effectiveStrength = this.roadAssistStrength * Math.min(1, (nearest.distance - 1) / 5)
    if (effectiveStrength < 0.01) return

    const force = effectiveStrength * v.body.mass * 2
    v.body.applyForce(new Vec3(nearest.direction[0] * force, 0, nearest.direction[2] * force))
  }
}
