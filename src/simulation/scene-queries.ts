/**
 * Instant physics queries shared by the inline {@link Simulation} and the main-thread query world
 * that mirrors a worker-hosted simulation. Both call the same code against a world in the same
 * state, so the answers are the same whichever thread owns the simulation.
 */
import { Vec3, type Body, type World } from './physics.js'
import type { Vec3Tuple } from '../entity/schema.js'

const vec = (v: Vec3): Vec3Tuple => [v.x, v.y, v.z]

/** Bodies an instant query ignores: the player capsule, the occupied vehicle and its trailers. */
export interface QueryExclusions {
  player: Body | null
  occupied: Body | null
  trailers?: ReadonlySet<Body>
}

/** Closest hitscan obstruction, or null. `ray` is the normalised direction. */
export function nearestShotHit(
  world: World,
  exclusions: QueryExclusions,
  origin: Vec3Tuple,
  direction: Vec3Tuple,
  range: number,
  excludeBody?: Body,
): { ray: Vec3; point: Vec3; normal: Vec3; body: Body } | null {
  const ray = new Vec3(...direction)
  if (
    !Number.isFinite(range) ||
    range <= 0 ||
    !origin.every(Number.isFinite) ||
    !direction.every(Number.isFinite) ||
    ray.length() < 0.001
  )
    return null
  ray.normalize()
  const from = new Vec3(...origin),
    to = from.vadd(ray.scale(Math.min(range, 1000)))
  let nearest = Infinity
  let point: Vec3 | null = null
  let normal = new Vec3()
  let body: Body | null = null
  world.raycastAll(from, to, { skipBackfaces: true }, (hit) => {
    if (
      hit.body !== exclusions.player &&
      hit.body !== exclusions.occupied &&
      hit.body !== excludeBody &&
      hit.distance < nearest
    ) {
      nearest = hit.distance
      point = hit.hitPointWorld.clone()
      normal = hit.hitNormalWorld.clone()
      body = hit.body
    }
  })
  if (!point || !body) return null
  return { ray, point, normal, body }
}

/** Keep a third-person camera in front of the nearest physical obstruction. */
export function cameraClearance(
  world: World,
  exclusions: QueryExclusions,
  target: Vec3Tuple,
  desired: Vec3Tuple,
): Vec3Tuple {
  const from = new Vec3(...target),
    to = new Vec3(...desired)
  const delta = to.vsub(from),
    total = delta.length()
  if (total < 0.001) return [...target]
  let distance = total
  world.raycastAll(from, to, { skipBackfaces: true }, (hit) => {
    if (
      hit.body !== exclusions.player &&
      hit.body !== exclusions.occupied &&
      !exclusions.trailers?.has(hit.body!)
    )
      distance = Math.min(distance, Math.max(0.15, hit.distance - 0.2))
  })
  return vec(from.vadd(delta.scale(distance / total)))
}
