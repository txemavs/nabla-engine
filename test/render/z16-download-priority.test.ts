import { expect, it } from 'vitest'
import { deferZ15Parent } from '../../src/render/planet/startup-tiles.js'
import { mapTileChildren, mapTileId } from '../../src/scene/mercator.js'
const parent = { z: 15, x: 16223, y: 11997 }
const children = mapTileChildren(parent)
const wanted = new Set([parent, ...children].map(mapTileId))
it('does not download the redundant parent while its complete Z16 quartet is healthy', () => {
  expect(deferZ15Parent(parent, wanted, () => false)).toBe(true)
  expect(deferZ15Parent(children[0], wanted, () => false)).toBe(false)
})
it('restores parent fallback if any child is unavailable or failed', () => {
  for (const failed of children)
    expect(deferZ15Parent(parent, wanted, (child) => mapTileId(child) === mapTileId(failed))).toBe(
      false,
    )
})
it('preserves coarse coverage where the budget does not request all four children', () => {
  const partial = new Set(wanted)
  partial.delete(mapTileId(children[0]))
  expect(deferZ15Parent(parent, partial, () => false)).toBe(false)
  expect(deferZ15Parent(parent, new Set([mapTileId(parent)]), () => false)).toBe(false)
})
