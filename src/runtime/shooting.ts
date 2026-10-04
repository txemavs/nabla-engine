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
  const aimed = sim.shoot(camera.position.toArray(), direction.toArray(), sidearm.range, 0)
  const destination = aimed
    ? new Vector3(...aimed.point)
    : camera.position.clone().addScaledVector(direction, sidearm.range)
  const firing = camera.clone()
  if (!firstPerson) {
    firing.position.fromArray(sim.renderPlayerPosition)
    firing.lookAt(destination)
  }
  firing.updateMatrixWorld(true)
  sidearm.impact(gallery.shoot(sim, view, firing, sidearm.range, sidearm.impulse))
  return true
}
