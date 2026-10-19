import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { SceneryPhysics } from '../../src/runtime/scenery-physics.js'
import { sceneryPhysicsDefaults } from '../../src/config/scenery-physics.js'
import { Simulation } from '../../src/simulation/simulation.js'
import { createEntity } from '../../src/entity/schema.js'

type Pose = { position: [number, number, number]; rotation: [number, number, number, number] }

/** A stand-in for the simulation that records the bodies it hands out. */
function fakeSimulation(player: [number, number, number] = [0, 0, 0]) {
  const poses = new Map<object, Pose>()
  const handles: ReturnType<typeof makeHandle>[] = []
  const makeHandle = (position: Pose['position'], movable: boolean) => {
    const pose: Pose = { position: [...position], rotation: [0, 0, 0, 1] }
    const handle = {
      movable,
      disposed: false,
      restored: undefined as Pose | undefined,
      impact: vi.fn(),
      pose: () => pose,
      restore: vi.fn((p: Pose['position'], r: Pose['rotation']) => {
        pose.position = [...p]
        pose.rotation = [...r]
        handle.restored = { position: [...p], rotation: [...r] }
      }),
      dispose: vi.fn(() => {
        handle.disposed = true
      }),
    }
    poses.set(handle, pose)
    return handle
  }
  const simulation = {
    renderPlayerPosition: player,
    createSceneryPole: vi.fn((position: Pose['position'], _height: number, movable: boolean) => {
      const handle = makeHandle(position, movable)
      handles.push(handle)
      return handle
    }),
  }
  return { simulation, handles }
}

describe('SceneryPhysics', () => {
  it('has one set of code defaults', () => {
    const physics = new SceneryPhysics(() => null)
    expect(physics.enabled).toBe(sceneryPhysicsDefaults.enabled)
    expect(physics.radius).toBe(sceneryPhysicsDefaults.radius)
    expect(sceneryPhysicsDefaults.maxBodies).toBe(48)
  })

  it('clamps the editable radius and ignores invalid values', () => {
    const physics = new SceneryPhysics(() => null)
    physics.setRadius(1)
    expect(physics.radius).toBe(sceneryPhysicsDefaults.radiusMin)
    physics.setRadius(9999)
    expect(physics.radius).toBe(sceneryPhysicsDefaults.radiusMax)
    physics.setRadius(Number.NaN)
    expect(physics.radius).toBe(sceneryPhysicsDefaults.radiusMax)
    physics.setRadius(42.4)
    expect(physics.radius).toBe(42)
  })

  it('gives bodies only inside the shared radius, to every layer alike', () => {
    const { simulation } = fakeSimulation()
    const physics = new SceneryPhysics(() => simulation)
    physics.setRadius(20)
    const signs = physics.layer('signs', { movable: true })
    const lights = physics.layer('traffic-lights', { movable: false })
    for (const layer of [signs, lights]) {
      layer.begin()
      layer.add('near', 5, 0, 5, 3)
      layer.add('far', 50, 0, 0, 3)
      layer.end()
    }
    expect(simulation.createSceneryPole).toHaveBeenCalledTimes(2)
    expect(physics.diagnostics().map((d) => [d.name, d.active])).toEqual([
      ['signs', 1],
      ['traffic-lights', 1],
    ])
    physics.setRadius(60)
    signs.begin()
    signs.add('near', 5, 0, 5, 3)
    signs.add('far', 50, 0, 0, 3)
    signs.end()
    expect(signs.stats().active).toBe(2)
  })

  it('passes the movable flag and rest height to the body', () => {
    const { simulation } = fakeSimulation()
    const physics = new SceneryPhysics(() => simulation)
    const signs = physics.layer('signs', { movable: true })
    signs.begin()
    signs.add('a', 1, 2, 3, 4)
    expect(simulation.createSceneryPole).toHaveBeenCalledWith([1, 4, 3], 4, true)
    const fixed = physics.layer('fixed', { movable: false })
    fixed.begin()
    fixed.add('b', 1, 0, 1, 3.3)
    expect(simulation.createSceneryPole).toHaveBeenLastCalledWith([1, 1.65, 1], 3.3, false)
  })

  it('caps live bodies per layer', () => {
    const { simulation } = fakeSimulation()
    const physics = new SceneryPhysics(() => simulation)
    const layer = physics.layer('small', { movable: true, maxBodies: 3 })
    layer.begin()
    for (let i = 0; i < 10; i++) layer.add('p' + i, i, 0, 0, 3)
    expect(layer.stats().active).toBe(3)
    const defaults = physics.layer('default', { movable: true })
    defaults.begin()
    for (let i = 0; i < 100; i++) defaults.add('p' + i, i * 0.1, 0, 0, 3)
    expect(defaults.stats().active).toBe(48)
  })

  it('creates nothing while disabled and retires bodies on the next refresh', () => {
    const { simulation, handles } = fakeSimulation()
    const physics = new SceneryPhysics(() => simulation)
    const layer = physics.layer('signs', { movable: true })
    layer.begin()
    layer.add('a', 1, 0, 1, 3)
    layer.end()
    expect(layer.stats().active).toBe(1)
    physics.setEnabled(false)
    layer.begin()
    layer.add('a', 1, 0, 1, 3)
    expect(layer.stats().active).toBe(0)
    expect(handles[0]!.disposed).toBe(true)
    expect(simulation.createSceneryPole).toHaveBeenCalledTimes(1)
  })

  it('remembers a knocked-down movable pole and restores it when it streams back in', () => {
    const { simulation, handles } = fakeSimulation()
    const physics = new SceneryPhysics(() => simulation)
    const signs = physics.layer('signs', { movable: true })
    signs.begin()
    signs.add('a', 2, 0, 2, 3)
    signs.end()
    handles[0]!.pose().position[0] = 9
    handles[0]!.pose().rotation = [0.7, 0, 0, 0.7]
    signs.begin()
    signs.end()
    expect(signs.stats()).toMatchObject({ active: 0, fallen: 1 })
    const matrix = new THREE.Matrix4().identity()
    signs.transform('a', matrix)
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).not.toBe(0)
    signs.begin()
    signs.add('a', 2, 0, 2, 3)
    expect(handles[1]!.restore).toHaveBeenCalledWith([9, 1.5, 2], [0.7, 0, 0, 0.7])
  })

  it('does not remember fixed poles', () => {
    const { simulation } = fakeSimulation()
    const physics = new SceneryPhysics(() => simulation)
    const fixed = physics.layer('traffic-lights', { movable: false })
    fixed.begin()
    fixed.add('a', 2, 0, 2, 3.3)
    fixed.end()
    fixed.begin()
    fixed.end()
    expect(fixed.stats()).toMatchObject({ active: 0, fallen: 0 })
  })

  it('leaves the matrix alone for unknown poles and forwards impacts to live ones', () => {
    const { simulation, handles } = fakeSimulation()
    const physics = new SceneryPhysics(() => simulation)
    const layer = physics.layer('signs', { movable: true })
    const matrix = new THREE.Matrix4().makeTranslation(1, 2, 3)
    layer.transform('nope', matrix)
    expect(matrix.elements).toEqual(new THREE.Matrix4().makeTranslation(1, 2, 3).elements)
    layer.begin()
    layer.add('a', 1, 0, 1, 3)
    layer.impact('a', [0, 1, 0], [1, 0, 0], 5)
    layer.impact('missing', [0, 0, 0], [1, 0, 0], 5)
    expect(handles[0]!.impact).toHaveBeenCalledTimes(1)
  })

  it('does nothing without a running simulation and disposes every layer', () => {
    let current: ReturnType<typeof fakeSimulation>['simulation'] | null = null
    const physics = new SceneryPhysics(() => current)
    const layer = physics.layer('signs', { movable: true })
    layer.begin()
    layer.add('a', 1, 0, 1, 3)
    expect(layer.stats().active).toBe(0)
    const fake = fakeSimulation()
    current = fake.simulation
    layer.begin()
    layer.add('a', 1, 0, 1, 3)
    expect(layer.stats().active).toBe(1)
    physics.dispose()
    expect(fake.handles[0]!.disposed).toBe(true)
    expect(physics.diagnostics()).toEqual([])
    physics.dispose()
  })
})

describe('SceneryPhysics with the real simulation', () => {
  it.each([true, false])('a layer body responds to impacts, movable=%s', (movable) => {
    const sim = new Simulation(
      { version: 1, name: 'Layer pole', entities: [createEntity('spawn', 'spawn', [0, 1, 0])] },
      { playerMode: 'walk' },
    )
    const physics = new SceneryPhysics(() => sim)
    const layer = physics.layer('signs', { movable })
    layer.begin()
    layer.add('a', 3, 0, 3, 3)
    layer.end()
    expect(layer.stats().active).toBe(1)
    const matrix = new THREE.Matrix4().makeTranslation(3, 1.5, 3)
    layer.transform('a', matrix)
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo(3, 3)
    layer.impact('a', [3, 2, 3], [1, 0, 0], 10)
    physics.dispose()
    sim.dispose()
  })
})

describe('world layer (lamp posts and tree trunks)', () => {
  const handle = () => ({
    impact: vi.fn(),
    pose: () => ({
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
    }),
    restore: vi.fn(),
    dispose: vi.fn(),
  })
  function world(actors: [number, number, number][]) {
    const handles: ReturnType<typeof handle>[] = []
    const simulation = {
      renderPlayerPosition: actors[0],
      sceneryActors: () => actors,
      createSceneryPole: vi.fn(() => {
        const h = handle()
        handles.push(h)
        return h
      }),
    }
    const physics = new SceneryPhysics(() => simulation as never)
    const layer = physics.layer('field-lights', {
      movable: false,
      maxBodies: Infinity,
      world: { reach: 65, budgetMs: 3 },
    })
    return { simulation, handles, physics, layer }
  }

  it('creates static solid bodies with their own half size, uncapped', () => {
    const { simulation, layer } = world([[0, 0, 0]])
    // A frozen clock: the creation budget is covered by its own test.
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000)
    layer.begin()
    for (let i = 0; i < 200; i++)
      layer.add('p' + i, (i % 50) * 0.5, 0, Math.floor(i / 50), 3.6, 0.07)
    layer.end()
    expect(layer.stats().active).toBe(200)
    clock.mockRestore()
    expect(simulation.createSceneryPole).toHaveBeenCalledWith([0, 1.8, 0], 3.6, false, {
      half: [0.07, 1.8, 0.07],
      solid: true,
    })
  })

  it('ignores the shared on/off switch and the editable radius', () => {
    const { physics, layer } = world([[0, 0, 0]])
    physics.setEnabled(false)
    physics.setRadius(5)
    layer.begin()
    layer.add('far', 60, 0, 0, 3, 0.6)
    layer.end()
    expect(layer.stats().active).toBe(1)
  })

  it('selects by the distance of the pole box to ANY actor, 65 m, like the trimesh set', () => {
    const { layer } = world([
      [0, 0, 0],
      [200, 0, 0],
    ])
    layer.begin()
    layer.add('near-player', 64, 0, 0, 3, 0.6)
    layer.add('near-vehicle', 190, 0, 0, 3, 0.6)
    layer.add('too-far', 100, 0, 0, 3, 0.6)
    layer.add('over-the-edge', 66, 0, 0, 3, 0.6)
    layer.add('box-reaches', 65.4, 0, 0, 3, 0.6)
    layer.end()
    expect(layer.stats().active).toBe(3)
    expect(layer.actors()).toHaveLength(2)
  })

  it('retires posts that stream out and never remembers poses', () => {
    const { handles, layer } = world([[0, 0, 0]])
    layer.begin()
    layer.add('a', 1, 0, 1, 3, 0.6)
    layer.end()
    layer.begin()
    layer.end()
    expect(handles[0]!.dispose).toHaveBeenCalled()
    expect(layer.stats()).toMatchObject({ active: 0, fallen: 0 })
  })

  it('builds at most the time budget per refresh, nearest first, and reports what is pending', () => {
    const { simulation, layer } = world([[0, 0, 0]])
    let now = 1000
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
    try {
      simulation.createSceneryPole.mockImplementation(() => {
        now += 2
        return handle()
      })
      layer.begin()
      for (let i = 0; i < 5; i++) layer.add('p' + i, i, 0, 0, 3, 0.6)
      layer.end()
      // 3 ms budget, 2 ms per body: the first is always built, then one more fits.
      expect(layer.stats().active).toBe(2)
      expect(layer.pending).toBe(3)
      layer.begin()
      for (let i = 0; i < 5; i++) layer.add('p' + i, i, 0, 0, 3, 0.6)
      layer.end()
      expect(layer.stats().active).toBe(4)
      expect(layer.pending).toBe(1)
      layer.begin()
      for (let i = 0; i < 5; i++) layer.add('p' + i, i, 0, 0, 3, 0.6)
      layer.end()
      expect(layer.stats().active).toBe(5)
      expect(layer.pending).toBe(0)
    } finally {
      clock.mockRestore()
    }
  })

  it('does not change the two-argument body call of sign layers', () => {
    const { simulation, physics } = world([[0, 0, 0]])
    const signs = physics.layer('signs', { movable: true })
    signs.begin()
    signs.add('s', 1, 0, 1, 3)
    expect(simulation.createSceneryPole).toHaveBeenLastCalledWith([1, 1.5, 1], 3, true)
  })
})
