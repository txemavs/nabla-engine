import { describe, expect, it } from 'vitest'
import { Simulation, idleInput } from './simulation.js'
import { createEntity, type SceneDocument, type Entity, rotationDegrees } from './scene.js'

function scene(
  extra: Entity[] = [],
  spawn: [number, number, number] = [0, 0.05, 4],
): SceneDocument {
  const ground = createEntity('ground', 'box', [0, -0.5, 0])
  ground.size = [100, 1, 100]
  return {
    version: 1,
    name: 'Physics test',
    entities: [ground, createEntity('spawn', 'spawn', spawn), ...extra],
  }
}
function advance(sim: Simulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) sim.step(1 / 60)
}
function car(id = 'car', position: [number, number, number] = [0, 1, 0]): Entity {
  return createEntity(id, 'vehicle', position)
}

describe('shared simulation', () => {
  it('settles a character and stops it at a wall', () => {
    const wall = createEntity('wall', 'box', [0, 1.5, 0])
    wall.size = [10, 3, 1]
    const sim = new Simulation(scene([wall]))
    advance(sim, 1)
    expect(sim.player.grounded).toBe(true)
    expect(sim.player.position[1]).toBeCloseTo(0.9, 1)
    sim.setInput({ ...idleInput(), forward: 1 })
    advance(sim, 3)
    expect(sim.player.position[2]).toBeGreaterThan(0.79)
    expect(sim.player.position[2]).toBeLessThan(1)
    sim.dispose()
  })
  it('uses the same elapsed time regardless of frame chunking', () => {
    const a = new Simulation(scene()),
      b = new Simulation(scene())
    a.setInput({ ...idleInput(), forward: 1 })
    b.setInput({ ...idleInput(), forward: 1 })
    for (let i = 0; i < 120; i++) a.step(1 / 120)
    for (let i = 0; i < 30; i++) b.step(1 / 30)
    expect(a.stats.ticks).toBe(60)
    expect(b.stats.ticks).toBe(60)
    a.player.position.forEach((n, i) => expect(b.player.position[i]).toBeCloseTo(n, 7))
    a.dispose()
    b.dispose()
  })
  it('consumes one jump request, lands, and does not jump automatically again', () => {
    const sim = new Simulation(scene())
    advance(sim, 1)
    sim.setInput({ ...idleInput(), jump: true })
    sim.step(1 / 60)
    sim.setInput(idleInput())
    advance(sim, 0.25)
    expect(sim.player.position[1]).toBeGreaterThan(1.5)
    advance(sim, 3)
    expect(sim.player.grounded).toBe(true)
    expect(sim.player.position[1]).toBeCloseTo(0.9, 1)
    sim.dispose()
  })
  it('mounts, drives forward toward -Z, stops and exits onto free ground', () => {
    const sim = new Simulation(scene([car()], [2, 0.05, 0]))
    advance(sim, 1)
    expect(sim.interact()).toContain('Conduciendo')
    expect(sim.player.vehicleId).toBe('car')
    sim.setInput({ ...idleInput(), forward: 1 })
    advance(sim, 2)
    expect(sim.entityTransform('car').position[2]).toBeLessThan(-2)
    expect(sim.interact()).toContain('Detén')
    sim.setInput({ ...idleInput(), brake: true })
    advance(sim, 4)
    expect(sim.interact()).toBe('A pie')
    expect(sim.player.vehicleId).toBeNull()
    expect(sim.player.position[1]).toBeGreaterThan(0.89)
    sim.dispose()
  })
  it('pushes another vehicle in the same world', () => {
    const sim = new Simulation(scene([car(), car('other', [0, 1, -6])], [2, 0.05, 0]))
    advance(sim, 1)
    sim.interact()
    const before = sim.entityTransform('other').position[2]
    sim.setInput({ ...idleInput(), forward: 1 })
    advance(sim, 4)
    expect(sim.entityTransform('other').position[2]).toBeLessThan(before - 0.25)
    sim.dispose()
  })
  it('a dynamic crate responds to a character instead of being a separate world', () => {
    const crate = createEntity('crate', 'box', [0, 0.5, 0])
    crate.size = [1, 1, 1]
    crate.motion = 'dynamic'
    crate.mass = 5
    const sim = new Simulation(scene([crate]))
    advance(sim, 1)
    sim.setInput({ ...idleInput(), forward: 1 })
    advance(sim, 3)
    expect(sim.entityTransform('crate').position[2]).toBeLessThan(-1)
    sim.dispose()
  })
  it('does not mutate the authored document and starts again from the saved scene', () => {
    const doc = scene([car()], [2, 0.05, 0]),
      before = JSON.stringify(doc)
    const sim = new Simulation(doc)
    advance(sim, 1)
    sim.interact()
    sim.setInput({ ...idleInput(), forward: 1 })
    advance(sim, 2)
    expect(JSON.stringify(doc)).toBe(before)
    sim.dispose()
    sim.dispose()
    expect(() => sim.step(0.1)).toThrow('disposed')
    const restart = new Simulation(doc)
    expect(restart.entityTransform('car').position).toEqual([0, 1, 0])
    restart.dispose()
  })
  it('rejects invalid time and reports dropped time explicitly', () => {
    const sim = new Simulation(scene())
    expect(() => sim.step(NaN)).toThrow()
    expect(() => sim.step(-1)).toThrow()
    sim.step(1)
    expect(sim.stats.ticks).toBe(15)
    expect(sim.stats.droppedSeconds).toBeCloseTo(0.75)
    sim.dispose()
  })
  it('moves the camera before a wall', () => {
    const wall = createEntity('wall', 'box', [0, 2, 3])
    wall.size = [10, 4, 0.5]
    const sim = new Simulation(scene([wall], [10, 0, 10]))
    const camera = sim.cameraPosition([0, 2, 0], [0, 2, 8])
    expect(camera[2]).toBeLessThan(2.75)
    expect(camera[2]).toBeGreaterThan(2.4)
    sim.dispose()
  })
  it('uses the transformed collider of a static child', () => {
    const parent = createEntity('parent', 'group', [0, 0, 0])
    parent.transform.rotation = rotationDegrees(0, 90, 0)
    const wall = createEntity('wall', 'box', [0, 1.5, 0])
    wall.size = [1, 3, 10]
    wall.parentId = parent.id
    const sim = new Simulation(scene([parent, wall]))
    advance(sim, 1)
    sim.setInput({ ...idleInput(), forward: 1 })
    advance(sim, 3)
    expect(sim.player.position[2]).toBeGreaterThan(0.79)
    sim.dispose()
  })
})

describe('vehicle safety and orientation', () => {
  it('turns right when right input is positive', () => {
    const sim = new Simulation(scene([car()], [2, 0.05, 0]))
    advance(sim, 1)
    sim.interact()
    sim.setInput({ ...idleInput(), forward: 1, right: 1 })
    advance(sim, 2)
    expect(sim.player.position[0]).toBeGreaterThan(2)
    expect(sim.player.position[2]).toBeLessThan(-2)
    sim.dispose()
  })
  it('does not exit into either blocked doorway', () => {
    const left = createEntity('left', 'box', [-1.7, 1.5, 0])
    left.size = [0.5, 3, 5]
    const right = createEntity('right', 'box', [1.7, 1.5, 0])
    right.size = [0.5, 3, 5]
    const sim = new Simulation(scene([car(), left, right], [0, 0.05, 2.8]))
    advance(sim, 1)
    expect(sim.interact()).toContain('Conduciendo')
    expect(sim.interact()).toBe('Las salidas están bloqueadas')
    expect(sim.player.vehicleId).toBe('car')
    sim.dispose()
  })
  it('does not exit into unsupported space', () => {
    const doc = scene([car()], [0, 0.05, 2.8])
    doc.entities[0].size = [2.4, 1, 8]
    const sim = new Simulation(doc)
    advance(sim, 1)
    expect(sim.interact()).toContain('Conduciendo')
    expect(sim.interact()).toBe('Las salidas están bloqueadas')
    sim.dispose()
  })
  it('visual children follow the simulated vehicle with the same rotation', () => {
    const body = car()
    body.transform.rotation = rotationDegrees(0, 90, 0)
    const child = createEntity('child', 'box', [0, 1, -1])
    child.motion = 'none'
    child.parentId = 'car'
    const sim = new Simulation(scene([body, child]))
    advance(sim, 1)
    const parent = sim.entityTransform('car'),
      visual = sim.entityTransform('child')
    expect(visual.position[0] - parent.position[0]).toBeCloseTo(-1, 1)
    expect(visual.position[1] - parent.position[1]).toBeCloseTo(1, 1)
    expect(visual.position[2] - parent.position[2]).toBeCloseTo(0, 1)
    sim.dispose()
  })
})

describe('vehicle reach', () => {
  it('does not mount through a wall', () => {
    const wall = createEntity('wall', 'box', [1.6, 1.5, 0])
    wall.size = [0.2, 3, 5]
    const sim = new Simulation(scene([car(), wall], [2.8, 0.05, 0]))
    advance(sim, 1)
    expect(sim.nearestVehicle()).toBeNull()
    expect(sim.interact()).toBe('Acércate a un coche detenido')
    expect(sim.player.vehicleId).toBeNull()
    sim.dispose()
  })
})

describe('hover monitor and shooting', () => {
  it('floats over a curb without jumping and still stops at a wall', () => {
    const curb = createEntity('curb', 'box', [0, 0.2, 0])
    curb.size = [4, 0.4, 4]
    const wall = createEntity('wall', 'box', [0, 2, -5])
    wall.size = [10, 4, 0.5]
    const sim = new Simulation(scene([curb, wall]), { playerMode: 'hover' })
    advance(sim, 1)
    expect(sim.player.position[1]).toBeCloseTo(1.25, 1)
    sim.setInput({ ...idleInput(), forward: 1 })
    advance(sim, 1)
    expect(sim.player.position[2]).toBeLessThan(1)
    expect(sim.player.position[1]).toBeGreaterThan(1.5)
    advance(sim, 3)
    expect(sim.player.position[2]).toBeGreaterThan(-4.5)
    expect(sim.player.position[2]).toBeLessThan(-4)
    sim.dispose()
  })
  it('follows a rising ramp without a foot collider catching its edge', () => {
    const ramp = createEntity('ramp', 'box', [0, 0.6, 0])
    ramp.size = [4, 0.15, 6]
    ramp.transform.rotation = rotationDegrees(12, 0, 0)
    const sim = new Simulation(scene([ramp], [0, 0.05, 4]), { playerMode: 'hover' })
    advance(sim, 1)
    sim.setInput({ ...idleInput(), forward: 1 })
    advance(sim, 1.6)
    expect(sim.player.position[2]).toBeLessThan(-2)
    expect(sim.player.position[1]).toBeGreaterThan(2)
    sim.dispose()
  })
  it('hits the closest solid, misses outside range, and pushes dynamic props', () => {
    const wall = createEntity('wall', 'box', [0, 1, 0])
    wall.size = [4, 2, 0.5]
    const prop = createEntity('prop', 'box', [0, 1, -3])
    prop.motion = 'dynamic'
    prop.mass = 2
    const sim = new Simulation(scene([wall, prop]))
    expect(sim.shoot([0, 1, 4], [0, 0, -1])?.entityId).toBe('wall')
    expect(sim.shoot([0, 1, 4], [0, 0, -1], 1)).toBeNull()
    expect(sim.shoot([0, 1, 4], [0, 0, 0])).toBeNull()
    expect(sim.shoot([0, 1, -1], [0, 0, -1])?.entityId).toBe('prop')
    advance(sim, 0.1)
    expect(sim.entityTransform('prop').position[2]).toBeLessThan(-3.2)
    sim.dispose()
  })
})
