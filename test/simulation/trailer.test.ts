import { expect, it } from 'vitest'
import { Vector3, Quaternion } from 'three'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { parseScene } from '../../src/scene/document.js'

const scenario = () => {
  const tractor = presetVehicle('white-truck', 'tractor', [0, 1.45, 0])
  const trailer = presetVehicle('white-trailer', 'trailer', [0, 1.45, 7.33])
  trailer.vehicle!.tow = {
    vehicleId: tractor.id,
    hitch: [0, 0, 1.766745487],
    anchor: [0, 0, -5.565219856],
  }
  return parseScene({
    version: 1,
    name: 'Trailer test',
    entities: [
      createEntity('spawn', 'spawn', [-3, 1, 0]),
      { ...createEntity('floor', 'box', [0, -0.5, 0]), size: [1000, 1, 1000] },
      tractor,
      trailer,
    ],
  })
}
it('tows six passive wheels through a turn and recovers both bodies with their hitch aligned', () => {
  const sim = new Simulation(scenario())
  const anchorError = () => {
    const point = (id: string, local: number[]) => {
      const pose = sim.entityTransform(id)
      return new Vector3(...local)
        .applyQuaternion(new Quaternion(...pose.rotation))
        .add(new Vector3(...pose.position))
    }
    return point('tractor', [0, 0, 1.766745487]).distanceTo(point('trailer', [0, 0, -5.565219856]))
  }
  try {
    expect(() => sim.startInVehicle('trailer')).toThrow()
    sim.startInVehicle('tractor')
    expect(sim.cameraPosition([0, 3, 0], [0, 5, 26])[2]).toBeGreaterThan(25)
    for (let i = 0; i < 180; i++) sim.step(1 / 60)
    const before = sim.entityTransform('trailer').position[2]
    sim.setInput({ ...idleInput(), forward: 1, right: 0.25 })
    for (let i = 0; i < 240; i++) sim.step(1 / 60)
    expect(sim.player.speed).toBeGreaterThan(2)
    expect(sim.entityTransform('trailer').position[2]).toBeLessThan(before - 2)
    expect(anchorError()).toBeLessThan(0.1)
    sim.recoverVehicle()
    expect(anchorError()).toBeLessThan(0.001)
    sim.setInput(idleInput())
    for (let i = 0; i < 180; i++) sim.step(1 / 60)
    expect(anchorError()).toBeLessThan(0.1)
  } finally {
    sim.dispose()
  }
})
it('rejects a missing tractor before constructing physics', () => {
  const doc = scenario()
  doc.entities.find((e) => e.id === 'trailer')!.vehicle!.tow!.vehicleId = 'missing'
  expect(() => parseScene(doc)).toThrow(/towing vehicle/)
})
