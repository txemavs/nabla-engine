import { describe, expect, it } from 'vitest'
import { createEntity, rotationDegrees } from '../../src/entity/schema.js'
import { presetEntities } from '../../src/catalog/vehicles/library.js'
import { createPlaceable, createPlaceablePortal } from '../../src/catalog/placeables.js'
import { idleInput, Simulation } from '../../src/simulation/simulation.js'
import type { Entity, Vec3Tuple } from '../../src/entity/schema.js'

const scene = () => ({
  version: 1 as const,
  name: 'Placed portals',
  entities: [
    { ...createEntity('floor', 'box', [0, -0.3, 0]), size: [200, 0.6, 200] as Vec3Tuple },
    createEntity('spawn', 'spawn', [0, 0.03, 5]),
  ],
})
/** A placeable portal standing on the floor at `x`, turned like the game does. */
const portalAt = (id: string, x: number, yawDegrees = 0): Entity => {
  const portal = createPlaceablePortal(id)
  portal.transform = {
    position: [x, portal.size[1] / 2, 0],
    rotation: rotationDegrees(0, yawDegrees, 0),
  }
  return portal
}
const walk = (sim: Simulation, ticks = 240) => {
  for (let i = 0; i < ticks; i++) {
    sim.setInput({ ...idleInput(), forward: 1, yaw: sim.player.yaw })
    sim.step(1 / 60)
  }
}

describe('Simulation.addPlaced / removePlaced', () => {
  it('links two placed portals from the panel path and the player walks through', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    sim.addPlaced([portalAt('a', 0), portalAt('b', 40)])
    expect(sim.portalState('a')).toEqual({ pairId: null, mode: 'closed' })
    sim.configurePortal('a', 'b', 'open')
    expect(sim.portalState('b')).toMatchObject({ pairId: 'a', mode: 'open' })
    walk(sim)
    // Crossing a (front at +Z) exits b at x ≈ 40.
    expect(sim.player.position[0]).toBeGreaterThan(30)
    sim.dispose()
  })

  it('removes a placed portal, unlinking the partner that stays, and frees its id', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    sim.addPlaced([portalAt('a', 0)])
    sim.addPlaced([portalAt('b', 40)])
    sim.configurePortal('a', 'b', 'window')
    sim.removePlaced(['b'])
    expect(sim.portalState('a')).toEqual({ pairId: null, mode: 'closed' })
    expect(() => sim.portalState('b')).toThrow(/Unknown portal/)
    // The closed frame of `a` still blocks; the removed one does not.
    sim.addPlaced([portalAt('b', 40)])
    expect(sim.portalState('b').mode).toBe('closed')
    sim.dispose()
  })

  it('links a placed portal to a carrier stern once the garage door is closed', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    sim.addVehicles(presetEntities('carrier', 'ship', [0, 1.2, -30]))
    sim.addPlaced([portalAt('gate', 30)])
    expect(() => sim.configurePortal('gate', 'ship-stern', 'open')).toThrow(/Cierra/)
    sim.setGarageDoor('ship', true)
    for (let i = 0; i < 240; i++) sim.step(1 / 60)
    sim.configurePortal('gate', 'ship-stern', 'open')
    expect(sim.portalState('ship-stern')).toMatchObject({ pairId: 'gate', mode: 'open' })
    sim.dispose()
  })

  it('accepts every add-menu entry, including the linked 2.5D gallery, and removes them', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    const batches = (['portal', 'gallery', 'sprite', 'streetlight', 'globe'] as const).map((kind) =>
      createPlaceable(kind, `p-${kind}`),
    )
    for (const batch of batches) sim.addPlaced(batch)
    expect(sim.portalState('p-gallery-window')).toMatchObject({
      pairId: 'p-gallery-back',
      mode: 'window',
    })
    for (let i = 0; i < 30; i++) sim.step(1 / 60)
    for (const batch of batches) sim.removePlaced(batch.map((e) => e.id))
    for (const batch of batches)
      for (const e of batch) expect(() => sim.entityTransform(e.id)).toThrow(/Unknown entity/)
    sim.dispose()
  })

  it('rejects vehicles, children, duplicates and links to portals outside the batch', () => {
    const sim = new Simulation(scene(), { playerMode: 'walk' })
    sim.addPlaced([portalAt('a', 0)])
    expect(() => sim.addPlaced([portalAt('a', 10)])).toThrow(/in use/)
    expect(() => sim.addPlaced(presetEntities('car', 'car'))).toThrow(/cannot be placed/)
    expect(() => sim.addPlaced([{ ...portalAt('c', 10), parentId: 'a' }])).toThrow(
      /cannot be placed/,
    )
    const linked = portalAt('d', 10)
    linked.portal = { pairId: 'a', mode: 'open' }
    expect(() => sim.addPlaced([linked])).toThrow(/same batch/)
    expect(() => sim.removePlaced(['spawn-missing'])).toThrow(/Unknown entity/)
    sim.dispose()
  })
})
