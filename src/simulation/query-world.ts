/**
 * Query-only mirror of a worker-hosted simulation's Rapier world.
 *
 * The worker owns the real {@link Simulation}. After every step (and every command) it sends a
 * {@link QueryWorldDelta}: the colliders of bodies that appeared or changed shape, the ids of bodies
 * that went away, and the world pose of every collider. {@link QueryWorld} rebuilds those colliders
 * (without rigid bodies) in a main-thread Rapier world and copies the poses verbatim, so instant
 * queries (hitscan, camera clearance) run synchronously against bit-identical geometry, through the same
 * {@link nearestShotHit} / {@link cameraClearance} code the inline simulation uses.
 * The mirror is never stepped and never simulates anything.
 */
import RAPIER from '@dimforge/rapier3d-compat/rapier.es.js'
import type { Collider } from '@dimforge/rapier3d-compat'
import { Body, Box, Sphere, Trimesh, World } from './physics.js'
import { cameraClearance, nearestShotHit, type QueryExclusions } from './scene-queries.js'
import type { Simulation } from './simulation.js'
import type { Vec3Tuple } from '../entity/schema.js'

type Quat = [number, number, number, number]

export type QueryShape =
  | { kind: 'sphere'; radius: number }
  | { kind: 'box'; half: Vec3Tuple }
  | { kind: 'trimesh'; vertices: Float32Array; indices: Uint32Array }
  | { kind: 'heightfield'; data: number[][]; elementSize: number }

export interface QueryBody {
  id: number
  shapes: { shape: QueryShape; offset: Vec3Tuple; rotation: Quat; sensor: boolean }[]
}

export interface QueryWorldDelta {
  origin: Vec3Tuple
  added: QueryBody[]
  removed: number[]
  /** Body ids in the worker world's body order; `poses` follows the same order. */
  order: number[]
  /** Per collider of each body in order: raw (origin-relative) translation xyz, rotation xyzw. */
  poses: Float64Array
  /** Worker body ids the queries need. */
  ids: {
    player: number | null
    occupied: number | null
    trailers: number[]
    /** Entity id → body id, in the simulation's map order (first match names a hit). */
    entities: [string, number][]
  }
}

const POSE = 7

function describeShape(shape: Body['shapes'][number]): QueryShape {
  if (shape instanceof Sphere) return { kind: 'sphere', radius: shape.radius }
  if (shape instanceof Box)
    return { kind: 'box', half: [shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z] }
  if (shape instanceof Trimesh)
    return { kind: 'trimesh', vertices: shape.vertices, indices: shape.indices }
  return { kind: 'heightfield', data: shape.data, elementSize: shape.elementSize }
}

function shapeSignature(body: Body): string {
  return body.shapes
    .map((s, i) => {
      const o = body.shapeOffsets[i],
        q = body.shapeOrientations[i]
      return `${shapeId(s)}:${s.collisionResponse ? 1 : 0}:${o.x},${o.y},${o.z}:${q.x},${q.y},${q.z},${q.w}`
    })
    .join('|')
}

const shapeIds = new WeakMap<object, number>()
let nextShapeId = 1
function shapeId(shape: object): number {
  let id = shapeIds.get(shape)
  if (id === undefined) shapeIds.set(shape, (id = nextShapeId++))
  return id
}

/** Worker side: remembers what the main thread already has and produces the next delta. */
export class QueryWorldExporter {
  private readonly sent = new Map<number, string>()
  export(sim: Simulation): QueryWorldDelta {
    const { world, bodies } = sim.queryState()
    const added: QueryBody[] = []
    const seen = new Set<number>()
    const order: number[] = []
    const count = world.bodies.reduce((n, body) => n + body.shapes.length, 0)
    const poses = new Float64Array(count * POSE)
    let at = 0
    world.bodies.forEach((body) => {
      seen.add(body.id)
      order.push(body.id)
      const signature = shapeSignature(body)
      if (this.sent.get(body.id) !== signature) {
        this.sent.set(body.id, signature)
        added.push({
          id: body.id,
          shapes: body.shapes.map((shape, s) => {
            const o = body.shapeOffsets[s],
              q = body.shapeOrientations[s]
            return {
              shape: describeShape(shape),
              offset: [o.x, o.y, o.z],
              rotation: [q.x, q.y, q.z, q.w],
              sensor: !shape.collisionResponse,
            }
          }),
        })
      }
      body.shapes.forEach((_, s) => {
        const collider = body.colliders[s]
        if (collider) {
          const t = collider.translation(),
            r = collider.rotation()
          poses.set([t.x, t.y, t.z, r.x, r.y, r.z, r.w], at)
        }
        at += POSE
      })
    })
    const removed: number[] = []
    for (const id of this.sent.keys())
      if (!seen.has(id)) {
        removed.push(id)
        this.sent.delete(id)
      }
    const exclusions = sim.queryExclusions()
    return {
      origin: [world.origin.x, world.origin.y, world.origin.z],
      added,
      removed,
      order,
      poses,
      ids: {
        player: exclusions.player?.id ?? null,
        occupied: exclusions.occupied?.id ?? null,
        trailers: [...(exclusions.trailers ?? [])].map((b) => b.id),
        entities: [...bodies].map(([id, body]) => [id, body.id]),
      },
    }
  }
}

/** The same collider description {@link Body} builds for each shape, without a parent body. */
function colliderDesc(
  shape: QueryShape,
  sensor: boolean,
): ReturnType<typeof RAPIER.ColliderDesc.cuboid> | null {
  let desc: ReturnType<typeof RAPIER.ColliderDesc.cuboid> | null = null
  switch (shape.kind) {
    case 'sphere':
      desc = RAPIER.ColliderDesc.ball(shape.radius)
      break
    case 'box':
      desc = RAPIER.ColliderDesc.cuboid(...shape.half)
      break
    case 'trimesh':
      desc = RAPIER.ColliderDesc.trimesh(shape.vertices, shape.indices)
      break
    case 'heightfield': {
      const columns = shape.data.length
      const rows = shape.data[0]?.length ?? 0
      if (columns < 2 || rows < 2) return null
      const heights = new Float32Array(columns * rows)
      for (let x = 0; x < columns; x++)
        for (let z = 0; z < rows; z++) heights[x * rows + z] = shape.data[x][z]
      desc = RAPIER.ColliderDesc.heightfield(rows - 1, columns - 1, heights, {
        x: (columns - 1) * shape.elementSize,
        y: 1,
        z: (rows - 1) * shape.elementSize,
      })
    }
  }
  return desc.setDensity(0).setSensor(sensor)
}

/** Main-thread side: a never-stepped Rapier world answering instant queries. */
export class QueryWorld {
  readonly world = new World()
  private readonly bodies = new Map<number, Body>()
  private ids: QueryWorldDelta['ids'] = { player: null, occupied: null, trailers: [], entities: [] }

  apply(delta: QueryWorldDelta): void {
    for (const id of delta.removed) this.drop(id)
    for (const description of delta.added) {
      this.drop(description.id)
      // A plain container: hits map back to it through `colliders`, as in the worker world.
      const body = new Body({ mass: 0 })
      body.colliders = description.shapes.map(({ shape, sensor }) => {
        const desc = colliderDesc(shape, sensor)
        return (desc ? this.world.raw.createCollider(desc) : undefined) as Collider
      })
      this.bodies.set(description.id, body)
    }
    this.world.origin.set(...delta.origin)
    // Keep world.bodies in the worker's order so hit callbacks map bodies the same way.
    this.world.bodies = delta.order.map((id) => this.bodies.get(id)!).filter(Boolean)
    let at = 0
    const p = delta.poses
    for (const id of delta.order)
      for (const collider of this.bodies.get(id)?.colliders ?? []) {
        if (collider) {
          collider.setTranslation({ x: p[at], y: p[at + 1], z: p[at + 2] })
          collider.setRotation({ x: p[at + 3], y: p[at + 4], z: p[at + 5], w: p[at + 6] })
        }
        at += POSE
      }
    this.world.raw.updateSceneQueries()
    this.ids = delta.ids
  }

  private drop(id: number): void {
    const body = this.bodies.get(id)
    if (!body) return
    for (const collider of body.colliders)
      if (collider) this.world.raw.removeCollider(collider, false)
    body.colliders = []
    this.bodies.delete(id)
  }

  private exclusions(): QueryExclusions {
    const get = (id: number | null) => (id === null ? null : (this.bodies.get(id) ?? null))
    return {
      player: get(this.ids.player),
      occupied: get(this.ids.occupied),
      trailers: new Set(this.ids.trailers.map((id) => this.bodies.get(id)!).filter(Boolean)),
    }
  }

  /** Same contract as {@link Simulation.shoot} without the impulse (the worker applies that). */
  shoot(
    origin: Vec3Tuple,
    direction: Vec3Tuple,
    range = 150,
    excludeEntityId?: string,
  ): { point: Vec3Tuple; normal: Vec3Tuple; entityId: string | null } | null {
    const exclude = excludeEntityId
      ? this.ids.entities.find(([id]) => id === excludeEntityId)?.[1]
      : undefined
    const hit = nearestShotHit(
      this.world,
      this.exclusions(),
      origin,
      direction,
      range,
      exclude === undefined ? undefined : this.bodies.get(exclude),
    )
    if (!hit) return null
    const bodyId = [...this.bodies].find(([, body]) => body === hit.body)?.[0]
    return {
      point: [hit.point.x, hit.point.y, hit.point.z],
      normal: [hit.normal.x, hit.normal.y, hit.normal.z],
      entityId: this.ids.entities.find(([, id]) => id === bodyId)?.[0] ?? null,
    }
  }

  /** Same contract as {@link Simulation.cameraPosition}. */
  cameraPosition(target: Vec3Tuple, desired: Vec3Tuple): Vec3Tuple {
    return cameraClearance(this.world, this.exclusions(), target, desired)
  }

  get bodyCount(): number {
    return this.bodies.size
  }

  dispose(): void {
    for (const id of [...this.bodies.keys()]) this.drop(id)
    this.world.raw.free()
  }
}
