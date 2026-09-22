import { describe, expect, it } from 'vitest'
import { Quaternion, Vec3 } from 'cannon-es'
import { createA3, createCarrier } from './presets.js'
import { createEntity, type SceneDocument } from './scene.js'
import { idleInput, Simulation } from './simulation.js'

function document(): SceneDocument {
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [100, 1, 100]
  return {
    version: 1,
    name: 'Transport',
    entities: [
      floor,
      createEntity('spawn', 'spawn', [-2.5, 0.05, 6]),
      createA3('car', [0, 0.62, 6]),
      createCarrier('carrier', [0, 1.2, -12]),
    ],
  }
}
function step(sim: Simulation, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    sim.step(1 / 60)
    sim.wheelTransforms('car')
    sim.wheelTransforms('carrier')
  }
}
function park(sim: Simulation): void {
  step(sim, 120)
  expect(sim.interact()).toContain('Conduciendo')
  for (let i = 0; i < 600; i++) {
    const z = sim.entityTransform('car').position[2]
    sim.setInput({
      ...idleInput(),
      forward: z > -9 ? 0.28 : 0,
      brake: z <= -9 || sim.player.speed > 2.5,
    })
    step(sim, 1)
  }
  expect(sim.dockingCandidate()).toBe('carrier')
}
function relativePosition(sim: Simulation): number[] {
  const car = sim.entityTransform('car'),
    carrier = sim.entityTransform('carrier')
  const q = new Quaternion(...carrier.rotation).inverse()
  const p = q.vmult(new Vec3(...car.position).vsub(new Vec3(...carrier.position)))
  return [p.x, p.y, p.z]
}

describe('A3 and mobile garage', () => {
  it('drives up the real ramp, locks, travels with the carrier, releases and reverses out', () => {
    const doc = document(),
      original = JSON.stringify(doc),
      sim = new Simulation(doc)
    expect(sim.dockingCandidate('car')).toBeNull()
    park(sim)
    expect(sim.toggleDock()).toContain('sujeto')
    expect(sim.vehicleInfo('carrier').rampMoving).toBe(true)
    step(sim, 150)
    expect(sim.vehicleInfo('carrier').rampClosed).toBe(true)
    const relative = relativePosition(sim)
    expect(sim.transferControls()).toContain('Container')
    const before = sim.entityTransform('carrier').position[2]
    sim.setInput({ ...idleInput(), forward: 0.5 })
    step(sim, 180)
    expect(sim.entityTransform('carrier').position[2]).toBeLessThan(before - 3)
    relativePosition(sim).forEach((value, i) =>
      expect(Math.abs(value - relative[i])).toBeLessThan(0.03),
    )
    expect(sim.transferControls()).toContain('Detén')
    sim.setInput({ ...idleInput(), brake: true })
    step(sim, 240)
    expect(sim.transferControls()).toContain('Audi')
    expect(sim.toggleDock()).toContain('libre')
    expect(sim.vehicleInfo('carrier').rampClosed).toBe(false)
    sim.setInput({ ...idleInput(), forward: -0.3 })
    step(sim, 360)
    expect(relativePosition(sim)[2]).toBeGreaterThan(9)
    expect(sim.entityTransform('car').position[1]).toBeGreaterThan(0.4)
    expect(JSON.stringify(doc)).toBe(original)
    sim.dispose()
  })
  it('can dismount into the hollow garage instead of treating it as one solid box', () => {
    const sim = new Simulation(document())
    park(sim)
    expect(sim.toggleDock()).toContain('sujeto')
    expect(sim.interact()).toBe('A pie')
    step(sim, 60)
    expect(sim.player.grounded).toBe(true)
    expect(sim.player.position[1]).toBeGreaterThan(1)
    expect(sim.interact()).toContain('Audi')
    expect(sim.vehicleInfo('car').dockedTo).toBe('carrier')
    sim.dispose()
  })
  it('retains the relative car transform while the loaded carrier turns', () => {
    const sim = new Simulation(document())
    park(sim)
    sim.toggleDock()
    sim.transferControls()
    const relative = relativePosition(sim)
    sim.setInput({ ...idleInput(), forward: 0.4, right: 0.2 })
    step(sim, 240)
    expect(Math.abs(sim.entityTransform('carrier').rotation[1])).toBeGreaterThan(0.02)
    relativePosition(sim).forEach((value, i) =>
      expect(Math.abs(value - relative[i])).toBeLessThan(0.04),
    )
    sim.dispose()
  })
})

it('flies the loaded garage, holds altitude, tilts and lands without releasing cargo in midair', () => {
  const doc = document()
  // Cruise flight now travels beyond the old 100 m test platform.
  doc.entities[0]!.size = [2000, 1, 2000]
  const sim = new Simulation(doc)
  park(sim)
  sim.toggleDock()
  sim.transferControls()
  const relative = relativePosition(sim)
  expect(sim.toggleFlight()).toContain('Modo vuelo')
  expect(sim.vehicleInfo('carrier').rampMoving).toBe(true)
  step(sim, 150)
  expect(sim.vehicleInfo('carrier').rampClosed).toBe(true)
  sim.setInput({ ...idleInput(), lift: 1 })
  step(sim, 180)
  const height = sim.entityTransform('carrier').position[1]
  expect(height).toBeGreaterThan(5)
  sim.setInput(idleInput())
  step(sim, 480)
  const held = sim.entityTransform('carrier').position[1]
  expect(Math.abs(held - sim.vehicleInfo('carrier').targetAltitude!)).toBeLessThan(0.2)
  expect(sim.toggleFlight()).toContain('Desciende')
  expect(sim.transferControls()).toContain('Audi')
  expect(sim.toggleDock()).toContain('Aterriza')
  expect(sim.transferControls()).toContain('Container')
  const before = sim.entityTransform('carrier').position
  sim.setInput({ ...idleInput(), forward: 0.6, right: 0.35, turn: 0.25 })
  step(sim, 180)
  const after = sim.entityTransform('carrier')
  expect(Math.hypot(after.position[0] - before[0], after.position[2] - before[2])).toBeGreaterThan(
    2,
  )
  expect(Math.abs(after.rotation[1])).toBeGreaterThan(0.1)
  expect(Math.abs(after.rotation[0]) + Math.abs(after.rotation[2])).toBeGreaterThan(0.04)
  relativePosition(sim).forEach((value, i) =>
    expect(Math.abs(value - relative[i])).toBeLessThan(0.08),
  )
  sim.setInput(idleInput())
  step(sim, 600)
  expect(Math.abs(sim.entityTransform('carrier').position[1] - held)).toBeLessThan(0.25)
  expect(sim.player.speed).toBeLessThan(0.1)
  const q = new Quaternion(...sim.entityTransform('carrier').rotation)
  expect(q.vmult(new Vec3(0, 1, 0)).y).toBeGreaterThan(0.99)
  sim.setInput({ ...idleInput(), lift: -1 })
  step(sim, 360)
  sim.setInput(idleInput())
  step(sim, 120)
  expect(sim.toggleFlight()).toBe('Modo tierra')
  expect(sim.transferControls()).toContain('Audi')
  expect(sim.toggleDock()).toContain('libre')
  sim.dispose()
})

it('supports empty flight and rejects flight commands on ordinary cars', () => {
  const doc = document()
  doc.entities.find((e) => e.id === 'spawn')!.transform.position = [0, 0.1, -15]
  const sim = new Simulation(doc)
  step(sim, 120)
  expect(sim.interact()).toContain('Container')
  expect(sim.toggleFlight()).toContain('Modo vuelo')
  sim.setInput({ ...idleInput(), lift: 0.5 })
  step(sim, 240)
  sim.setInput(idleInput())
  step(sim, 360)
  expect(sim.entityTransform('carrier').position[1]).toBeGreaterThan(5)
  expect(sim.player.speed).toBeLessThan(0.1)
  sim.dispose()
  const car = new Simulation(document())
  step(car, 120)
  car.interact()
  expect(car.toggleFlight()).toContain('Ponte al mando')
  expect(() => car.setInput({ ...idleInput(), lift: NaN })).toThrow('finite')
  car.dispose()
})

it('keeps the A3 attached during accelerated geographic ascent and braking', () => {
  const doc = document()
  doc.geography = { latitude: 40.4166, longitude: -3.70384, altitude: 0, imagery: 'offline' }
  const sim = new Simulation(doc)
  park(sim)
  sim.toggleDock()
  sim.transferControls()
  const relative = relativePosition(sim)
  sim.toggleFlight()
  sim.setInput({ ...idleInput(), lift: 1, sprint: true })
  step(sim, 1800)
  expect(sim.player.position[1]).toBeGreaterThan(100000)
  relativePosition(sim).forEach((value, i) =>
    expect(Math.abs(value - relative[i])).toBeLessThan(0.1),
  )
  sim.setInput(idleInput())
  step(sim, 900)
  expect(sim.player.speed).toBeLessThan(0.2)
  relativePosition(sim).forEach((value, i) =>
    expect(Math.abs(value - relative[i])).toBeLessThan(0.1),
  )
  sim.dispose()
})

it('reaches 1000 km/h in drone flight, holds altitude and brakes on release', () => {
  const doc = document()
  doc.entities[0]!.size = [10000, 1, 10000]
  doc.entities.find((e) => e.id === 'spawn')!.transform.position = [0, 0.1, -15]
  const sim = new Simulation(doc)
  step(sim, 120)
  sim.interact()
  sim.toggleFlight()
  sim.setInput({ ...idleInput(), lift: 1 })
  step(sim, 300)
  sim.setInput(idleInput())
  step(sim, 240)
  const height = sim.entityTransform('carrier').position[1]
  sim.setInput({ ...idleInput(), forward: 1 })
  step(sim, 600)
  expect(sim.player.speed).toBeGreaterThan(995 / 3.6)
  expect(sim.player.speed).toBeLessThan(1001 / 3.6)
  expect(Math.abs(sim.entityTransform('carrier').position[1] - height)).toBeLessThan(0.3)
  sim.setInput(idleInput())
  step(sim, 420)
  expect(sim.player.speed).toBeLessThan(0.1)
  sim.dispose()
})

it('raises the settled A3 chassis by five centimetres while keeping tyres on the ground', () => {
  const raisedDoc = document(),
    oldDoc = document()
  const old = oldDoc.entities.find((e) => e.id === 'car')!.vehicle!
  old.suspensionRest -= 0.05
  for (const hub of old.hubs) hub[1] += 0.05
  const raised = new Simulation(raisedDoc),
    previous = new Simulation(oldDoc)
  step(raised, 300)
  step(previous, 300)
  expect(
    raised.entityTransform('car').position[1] - previous.entityTransform('car').position[1],
  ).toBeCloseTo(0.05, 3)
  for (const wheel of raised.wheelTransforms('car'))
    expect(wheel.position[1]).toBeCloseTo(0.315374, 2)
  const up = new Quaternion(...raised.entityTransform('car').rotation).vmult(new Vec3(0, 1, 0))
  expect(up.y).toBeGreaterThan(0.999)
  raised.dispose()
  previous.dispose()
})
