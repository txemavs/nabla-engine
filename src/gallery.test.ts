import { expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { createGallery, shotView } from '../playground/gallery.js'
import { Simulation, idleInput } from './simulation.js'
import { createEntity, parseScene } from './scene.js'

it('transports the shooter ray through a window with parallax while keeping the player outside', () => {
  const entities = createGallery('g')
  const doc = parseScene({
    version: 1,
    name: 'Gallery',
    entities: [
      ...entities,
      createEntity('spawn', 'spawn', [-1, 0, 0]),
      { ...createEntity('floor', 'box', [0, -0.5, 0]), size: [100, 1, 100] },
    ],
  })
  const sim = new Simulation(doc, { playerMode: 'hover' }),
    camera = new PerspectiveCamera(70, 1, 0.1, 300)
  camera.position.set(-1, 1.4, 0)
  camera.lookAt(-1, 1.4, -7)
  camera.updateMatrixWorld(true)
  const first = shotView(sim, doc, camera)
  expect(first.throughPortal).toBe(true)
  expect(first.camera.position.x).toBeCloseTo(-140)
  camera.position.x += 0.75
  camera.updateMatrixWorld(true)
  const second = shotView(sim, doc, camera)
  expect(second.camera.position.x - first.camera.position.x).toBeCloseTo(0.75)
  sim.setInput({ ...idleInput(), forward: 1 })
  for (let i = 0; i < 180; i++) sim.step(1 / 60)
  expect(sim.portalEvent).toBeNull()
  expect(sim.player.position[2]).toBeGreaterThan(-4)
  sim.dispose()
})
it('does not transport shots through a closed gate or a solid obstruction', () => {
  const doc = parseScene({
    version: 1,
    name: 'Gallery',
    entities: [
      ...createGallery('g'),
      createEntity('spawn', 'spawn', [0, 0, 10]),
      { ...createEntity('wall', 'box', [-1, 1, -2]), size: [5, 3, 0.5] },
    ],
  })
  const sim = new Simulation(doc),
    camera = new PerspectiveCamera()
  camera.position.set(-1, 1, 0)
  camera.lookAt(new Vector3(-1, 1, -7))
  camera.updateMatrixWorld(true)
  expect(shotView(sim, doc, camera).throughPortal).toBe(false)
  sim.configurePortal('g-window', 'g-back', 'closed')
  expect(shotView(sim, doc, camera).throughPortal).toBe(false)
  sim.dispose()
})
