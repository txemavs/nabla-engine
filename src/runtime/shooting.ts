import { Vector3, type PerspectiveCamera } from 'three'
import type { Simulation } from '../simulation/simulation.js'
import type { SceneView } from '../render/entity/view.js'
import type { Sidearm } from './sidearm.js'
import type { Gallery } from './gallery.js'

/** Shared aim correction and shot routing. Call before applying the render origin. */
export function fireSidearm(
  sidearm: Sidearm,
  gallery: Gallery,
  sim: Simulation,
  view: SceneView,
  camera: PerspectiveCamera,
  now: number,
  firstPerson: boolean,
): boolean {
  if (sim.player.vehicleId || !sidearm.visible || !sidearm.fire(now)) return false
  const direction = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
  const origin = camera.position.clone()
  if (firstPerson) {
    origin.add(sidearm.muzzleViewOffset(now).applyQuaternion(camera.quaternion))
  } else {
    origin.fromArray(sim.renderPlayerPosition)
  }
  const aimed = sim.shoot(origin.toArray(), direction.toArray(), sidearm.range, 0)
  const destination = aimed
    ? new Vector3(...aimed.point)
    : origin.clone().addScaledVector(direction, sidearm.range)
  const firing = camera.clone()
  if (!firstPerson) {
    firing.position.fromArray(sim.renderPlayerPosition)
    firing.lookAt(destination)
  } else {
    // Hitscan from the camera look (player aim); muzzle only offsets VFX / laser feel.
    firing.position.copy(camera.position)
  }
  firing.updateMatrixWorld(true)
  const hit = gallery.shoot(sim, view, firing, sidearm.range, sidearm.impulse)
  sidearm.impact(hit)
  if (hit) {
    const normal = aimed?.normal
    view.sparks.add(
      destination.toArray() as [number, number, number],
      now,
      normal as [number, number, number] | undefined,
    )
  }
  return true
}
