import { mouseButtons } from '../config/input-bindings.js'
import { Vector3, PerspectiveCamera } from 'three'
import type { Simulation } from '../simulation/simulation.js'
import type { SceneView } from '../render/entity/view.js'
import type { Sidearm } from './sidearm.js'
import type { Gallery } from './gallery.js'
import type { FirearmEvent } from '../simulation/weapons/firearm.js'
import {
  bulletEnergy,
  fitDrag,
  traceBullet,
  zeroAngle,
  type BallisticLoad,
  type Vec3,
} from '../simulation/weapons/ballistics.js'

/**
 * Sidearm button edge. Left click fires even while right-button aim is already held: pointer
 * lock often delivers that second press only as `mousedown`, not `pointerdown`.
 */
export function sidearmButtonAction(
  button: number,
  down: boolean,
): 'fire' | 'aim' | 'release' | 'unaim' | null {
  if (button === mouseButtons.fire) return down ? 'fire' : 'release'
  if (button === mouseButtons.aim) return down ? 'aim' : 'unaim'
  return null
}

export interface SidearmShot extends FirearmEvent {
  /** Where the bullet stopped (hit point or end of the trace), world. */
  end?: Vec3
  /** Bullet kinetic energy at the hit, J. */
  impactJoules?: number
  /** Flight distance to the hit, m. */
  distance?: number
}

/** Straight check for gallery targets after a ballistic miss, m (drop there is ~1 cm). */
const NEAR_MISS_CHECK = 25

/** Fitted drag and zero angle per load (they only depend on the preset). */
const fits = new WeakMap<BallisticLoad, { k: number; angle: number }>()
/** Shared geometric aim for shots and laser convergence; coordinates are simulation-world. */
export function sidearmAimRay(
  sidearm: Sidearm,
  sim: Simulation,
  view: SceneView,
  camera: PerspectiveCamera,
  firstPerson: boolean,
  now = 0,
): { origin: Vector3; direction: Vector3 } {
  const barrel = sidearm.accessoryRay(now, firstPerson, camera.fov, 'Barrel')
  if (barrel) {
    for (const point of [barrel.origin, barrel.target]) {
      if (firstPerson) point.applyQuaternion(camera.quaternion).add(camera.position)
      else point.sub(view.root.position)
    }
    return { origin: barrel.origin, direction: barrel.target.sub(barrel.origin).normalize() }
  }
  const look = firstPerson
    ? sidearm.aimDirection(camera.quaternion)
    : new Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
  const origin = firstPerson ? camera.position.clone() : new Vector3(...sim.renderPlayerPosition)
  if (firstPerson) return { origin, direction: look }
  const muzzle = sidearm.worldMuzzle()
  if (muzzle) origin.copy(muzzle).sub(view.root.position)
  const aimed = sim.shoot(camera.position.toArray(), look.toArray(), sidearm.range, 0)
  const target = aimed
    ? new Vector3(...aimed.point)
    : camera.position.clone().addScaledVector(look, sidearm.range)
  return { origin, direction: target.sub(origin).normalize() }
}
function fitted(load: BallisticLoad): { k: number; angle: number } {
  let fit = fits.get(load)
  if (!fit) {
    const k = fitDrag(load.velocityTable)
    fit = { k, angle: zeroAngle(load, k) }
    fits.set(load, fit)
  }
  return fit
}

/**
 * One trigger press: the firearm decides whether a round goes off; the bullet then flies the
 * load's trajectory (drop and drag, `ballistics.ts`) through the world and hands its momentum
 * to whatever it hits. Presets without ammunition data keep the straight legacy ray.
 * Call before applying the render origin.
 */
export function fireSidearm(
  sidearm: Sidearm,
  gallery: Gallery,
  sim: Simulation,
  view: SceneView,
  camera: PerspectiveCamera,
  now: number,
  firstPerson: boolean,
): SidearmShot | null {
  if (!sidearm.visible) return null
  // Capture the pose before pulling the trigger adds recoil or ends an inspection.
  const { origin, direction } = sidearmAimRay(sidearm, sim, view, camera, firstPerson, now)
  const event: SidearmShot = sidearm.pull(now)
  if (!event.fired) return event
  const spread = sidearm.temperature.spreadRadians
  if (spread > 0) {
    const axis = Math.abs(direction.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
    const right = axis.cross(direction).normalize()
    const up = direction.clone().cross(right).normalize()
    const radius = Math.tan(spread) * Math.sqrt(Math.random())
    const angle = Math.random() * Math.PI * 2
    direction
      .addScaledVector(right, radius * Math.cos(angle))
      .addScaledVector(up, radius * Math.sin(angle))
      .normalize()
  }
  const load = sidearm.simulated ? sidearm.preset!.ammunition! : null
  let destination: Vector3
  let normal: Vec3 | undefined
  let impulse = sidearm.impulse
  if (load) {
    const { k, angle } = fitted(load)
    const result = traceBullet(
      load,
      origin.toArray() as Vec3,
      direction.toArray() as Vec3,
      (from, dir, length) => sim.shoot(from, dir, length, 0),
      { k, angle },
    )
    destination = new Vector3(...result.end)
    if (result.hit) {
      normal = result.hit.normal
      const energy = bulletEnergy(load, result.hit.speed)
      impulse = energy.momentum
      event.impactJoules = energy.joules
      event.distance = result.hit.distance
    }
    event.end = result.end
  } else {
    const aimed = sim.shoot(origin.toArray(), direction.toArray(), sidearm.range, 0)
    destination = aimed
      ? new Vector3(...aimed.point)
      : origin.clone().addScaledVector(direction, sidearm.range)
    normal = aimed?.normal
  }
  // Marks, targets, portals and the push go through the gallery along the chord to the impact.
  // A miss checks only the near stretch (gallery targets): far away the chord to the end of a
  // dropping trajectory would cut through ground the bullet flew over.
  // The XR camera may have an asymmetric eye projection. A gameplay ray must
  // not inherit its off-axis centre, or decals diverge from the ballistic hit.
  const firing = new PerspectiveCamera(50, 1, 0.01, sidearm.range + 1)
  firing.position.copy(origin)
  const missed = load && !event.distance
  firing.lookAt(missed ? firing.position.clone().addScaledVector(direction, 100) : destination)
  firing.updateMatrixWorld(true)
  const range = missed
    ? NEAR_MISS_CHECK
    : Math.max(0.5, firing.position.distanceTo(destination) + 0.25)
  const hit = gallery.shoot(
    sim,
    view,
    firing,
    range,
    impulse,
    Math.min(25, (event.impactJoules ?? 480) / 40),
  )
  sidearm.impact(hit)
  if (hit && !gallery.lastGlassImpact)
    view.sparks.add(destination.toArray() as [number, number, number], now, normal)
  return event
}
