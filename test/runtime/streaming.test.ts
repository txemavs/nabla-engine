import { expect, it, vi } from 'vitest'
import { GameplayStreaming } from '../../src/runtime/streaming.js'
import { createEntity, type Vec3Tuple } from '../../src/entity/schema.js'
import { createPortalPair } from '../../src/entity/portal/portal.js'
import type { SceneDocument } from '../../src/scene/document.js'

function fixture() {
  const doc: SceneDocument = {
    version: 1,
    name: 'Streaming',
    entities: [
      createEntity('vehicle', 'vehicle', [0, 0, 0]),
      createEntity('box', 'box', [0, 0, 0]),
      ...createPortalPair('a', 'b', [0, 0, 0], [100, 0, 0]),
    ],
  }
  const live: Record<string, Vec3Tuple> = { vehicle: [20, 3, 40], a: [5, 0, 5], b: [100, 0, 0] }
  const sim = {
    player: { position: [0, 0, 0] as Vec3Tuple },
    entityTransform: (id: string) => ({ position: live[id] }),
  }
  return { doc, sim, live, world: { update: vi.fn() }, stream: new GameplayStreaming() }
}
it('keeps live vehicles and portal endpoints supported, ignoring ordinary props', () => {
  const { doc, sim, live, world, stream } = fixture()
  stream.update(world, sim, doc, 1000)
  expect(world.update).toHaveBeenLastCalledWith(
    [0, 0, 0],
    [0, 0, 0],
    [
      [20, 3, 40],
      [5, 0, 5],
      [100, 0, 0],
    ],
  )
  live.vehicle[0] = 999
  expect(world.update.mock.calls[0][2][0][0]).toBe(20)
})
it('samples movement at the established cadence without retaining mutable player positions', () => {
  const { doc, sim, world, stream } = fixture()
  stream.update(world, sim, doc, 1000)
  sim.player.position[0] = 10
  expect(stream.update(world, sim, doc, 1500)).toBe(false)
  stream.update(world, sim, doc, 2000)
  expect(world.update.mock.calls[1][1]).toEqual([10, 0, 0])
  const copy = stream.position!
  copy[0] = 999
  expect(stream.position).toEqual([10, 0, 0])
})
it('restarts without predicting movement from the previous world or clock', () => {
  const { doc, sim, world, stream } = fixture()
  stream.update(world, sim, doc, 1000)
  stream.reset()
  sim.player.position = [10000, 0, 0]
  stream.update(world, sim, doc, 1100)
  expect(world.update.mock.calls[1][1]).toEqual([0, 0, 0])
  sim.player.position = [5000, 0, 0]
  stream.update(world, sim, doc, 0)
  expect(world.update.mock.calls[2][1]).toEqual([0, 0, 0])
  expect(stream.update(world, sim, doc, NaN)).toBe(false)
})
