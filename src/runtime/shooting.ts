import { Vector3, type PerspectiveCamera } from 'three'
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

export interface SidearmShot extends FirearmEvent {
  /** Where the bullet stopped (hit point or end of the trace), world. */
  end?: Vec3
  /** Bullet kinetic energy at the hit, J (no damage model yet). */
  impactJoules?: number
  /** Flight distance to the hit, m. */
  distance?: number
}

/** Straight check for gallery targets after a ballistic miss, m (drop there is ~1 cm). */
const NEAR_MISS_CHECK = 25

/** Fitted drag and zero angle per load (they only depend on the preset). */
const fits = new WeakMap<BallisticLoad, { k: number; angle: number }>()
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
  if (sim.player.vehicleId || !sidearm.visible) return null
  const event: SidearmShot = sidearm.pull(now)
  if (!event.fired) return event
  const look = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
  const load = sidearm.simulated ? sidearm.preset!.ammunition! : null
  const origin = firstPerson ? camera.position.clone() : new Vector3(...sim.renderPlayerPosition)
  let direction = look.clone()
  if (!firstPerson) {
    // Third person: the shooter aims at what the camera looks at.
    const aimed = sim.shoot(camera.position.toArray(), look.toArray(), sidearm.range, 0)
    const target = aimed
      ? new Vector3(...aimed.point)
      : camera.position.clone().addScaledVector(look, sidearm.range)
    direction = target.sub(origin).normalize()
  }
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
  const firing = camera.clone()
  firing.position.copy(firstPerson ? camera.position : origin)
  const missed = load && !event.distance
  firing.lookAt(missed ? firing.position.clone().addScaledVector(direction, 100) : destination)
  firing.updateMatrixWorld(true)
  const range = missed
    ? NEAR_MISS_CHECK
    : Math.max(0.5, firing.position.distanceTo(destination) + 0.25)
  const hit = gallery.shoot(sim, view, firing, range, impulse)
  sidearm.impact(hit)
  if (hit) view.sparks.add(destination.toArray() as [number, number, number], now, normal)
  return event
}
