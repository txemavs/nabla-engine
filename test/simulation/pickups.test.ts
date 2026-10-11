import { expect, it } from 'vitest'
import { PickupInventory } from '../../src/simulation/items/pickups.js'

it('starts empty and grants an item only once after collection within reach', () => {
  const inventory = new PickupInventory()
  const item = {
    id: 'ground-hk',
    itemId: 'hk-compact',
    name: 'HK',
    position: [2, 0, 0] as [number, number, number],
  }
  inventory.add(item)
  expect(inventory.has('hk-compact')).toBe(false)
  expect(inventory.take(item.id, [0, 0, 0])).toBeNull()
  expect(inventory.take(item.id, [2, 1, 0], () => false)).toBeNull()
  expect(inventory.take(item.id, [2, 1, 0])).toEqual(item)
  expect(inventory.has('hk-compact')).toBe(true)
  expect(inventory.items).toEqual([])
  expect(inventory.take(item.id, [2, 1, 0])).toBeNull()
  inventory.clear()
  expect(inventory.has('hk-compact')).toBe(false)
})
it('selects the closest reachable visible item and respects absolute planetary coordinates', () => {
  const inventory = new PickupInventory()
  inventory.add({ id: 'blocked', itemId: 'a', name: 'A', position: [6000000, 0, 0] })
  inventory.add({ id: 'visible', itemId: 'b', name: 'B', position: [6000001, 0, 0] })
  expect(inventory.nearest([6000000, 1, 0], 1.8, (item) => item.id !== 'blocked')?.id).toBe(
    'visible',
  )
  expect(inventory.nearest([6000005, 1, 0])).toBeNull()
})
