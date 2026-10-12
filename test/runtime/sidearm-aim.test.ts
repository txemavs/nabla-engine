import { expect, it } from 'vitest'
import { Group, PerspectiveCamera, Vector3 } from 'three'
import { sidearmAimRay } from '../../src/runtime/shooting.js'
import type { Sidearm } from '../../src/runtime/sidearm.js'
import type { Simulation } from '../../src/simulation/simulation.js'
import type { SceneView } from '../../src/render/entity/view.js'

it('converges from the third-person muzzle to the camera hit after a floating-origin shift', () => {
  const root = new Group()
  root.position.set(-1000, 0, 0)
  const camera = new PerspectiveCamera()
  camera.position.set(1000, 2, 5)
  const target = new Vector3(1000, 2, -10)
  const sidearm = {
    range: 150,
    worldMuzzle: () => new Vector3(0.5, 1.6, 0),
    aimDirection: () => {
      throw Error('Third person must not inherit bodycam offsets')
    },
  } as unknown as Sidearm
  const sim = {
    renderPlayerPosition: [1000, 2, 0],
    shoot: () => ({ point: target.toArray() }),
  } as unknown as Simulation
  const shot = sidearmAimRay(sidearm, sim, { root } as SceneView, camera, false)
  expect(shot.origin.toArray()).toEqual([1000.5, 1.6, 0])
  expect(shot.direction.dot(target.sub(shot.origin).normalize())).toBeCloseTo(1)
})
