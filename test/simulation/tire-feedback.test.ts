import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createA3 } from '../../src/catalog/vehicles/a3.js'
import { createPoliceCar } from '../../src/catalog/vehicles/police.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import { TireMarks } from '../../src/render/entity/tire-marks.js'

for (const factory of [createA3, createPoliceCar])
  it(`produces nondegenerate marks from Rapier handbrake contacts: ${factory.name}`, () => {
    const car = factory('car', [0, 0.7, 0])
    const floor = createEntity('floor', 'box', [0, -0.5, 0])
    floor.size = [2000, 1, 2000]
    const sim = new Simulation({
      version: 1,
      name: 'Tyre feedback',
      entities: [car, floor, createEntity('spawn', 'spawn', [0, 1, 4])],
    })
    const marks = new TireMarks()
    try {
      for (let i = 0; i < 180; i++) sim.step(1 / 60)
      sim.startInVehicle('car')
      sim.setInput({ ...idleInput(), forward: 1 })
      for (let i = 0; i < 240; i++) sim.step(1 / 60)
      sim.setInput({ ...idleInput(), brake: true })
      let maxSlip = 0
      for (let i = 0; i < 35; i++) {
        sim.step(1 / 60)
        const contacts = sim.wheelContactInfo('car')
        for (const c of contacts.filter((c) => c.isInContact))
          expect(new Vector3(...c.contactNormal!).length()).toBeCloseTo(1)
        maxSlip = Math.max(maxSlip, ...contacts.map((c) => c.slip))
        marks.update(1 / 60, 'car', contacts, new Vector3())
      }
      expect(maxSlip).toBeGreaterThan(0.22)
      expect(marks.root.geometry.drawRange.count).toBeGreaterThan(0)
      const pos = marks.root.geometry.attributes.position
      const a = new Vector3().fromBufferAttribute(pos, 0),
        b = new Vector3().fromBufferAttribute(pos, 1),
        c = new Vector3().fromBufferAttribute(pos, 2)
      expect(b.sub(a).cross(c.sub(a)).length()).toBeGreaterThan(0.01)
    } finally {
      marks.dispose()
      sim.dispose()
    }
  })

it('Shift launches the S3 without holding the front brakes and releases wheelspin', () => {
  const car = createA3('car', [0, 0.7, 0])
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [2000, 1, 2000]
  const sim = new Simulation({
    version: 1,
    name: 'Launch',
    entities: [floor, car, createEntity('spawn', 'spawn', [0, 1, 4])],
  })
  try {
    for (let i = 0; i < 180; i++) sim.step(1 / 60)
    sim.startInVehicle('car')
    sim.setInput({ ...idleInput(), sprint: true })
    let rearSlip = 0
    for (let i = 0; i < 120; i++) {
      sim.step(1 / 60)
      rearSlip = Math.max(
        rearSlip,
        ...sim
          .wheelContactInfo('car')
          .slice(2)
          .map((w) => w.slip),
      )
    }
    expect(rearSlip).toBeGreaterThan(0.5)
    expect(sim.vehicleInfo('car').speedKmh).toBeGreaterThan(25)
    sim.setInput(idleInput())
    for (let i = 0; i < 60; i++) sim.step(1 / 60)
    expect(Math.max(...sim.wheelContactInfo('car').map((w) => w.slip))).toBeLessThan(0.22)
  } finally {
    sim.dispose()
  }
})
