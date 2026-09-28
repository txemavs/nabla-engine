import { expect, it } from 'vitest'
import { createJeep } from '../src/catalog/vehicles/jeep.js'
import { replaceLegacyJeeps } from '../src/scene/migrations/jeep.js'
import type { SceneDocument } from '../src/scene/document.js'

it('replaces the retired Jeep without moving it or changing authored identity', () => {
  const jeep = createJeep('my-jeep', [12, 3, -40])
  jeep.name = 'My trail car'
  jeep.color = '#123456'
  jeep.visual!.body.url = '/world/car.jeep.gladiator.glb'
  const doc: SceneDocument = { version: 1, name: 'saved', entities: [jeep] }
  replaceLegacyJeeps(doc)
  expect(jeep.transform.position).toEqual([12, 3, -40])
  expect(jeep.id).toBe('my-jeep')
  expect(jeep.name).toBe('My trail car')
  expect(jeep.color).toBe('#123456')
  expect(jeep.visual!.body.url).toBe('/world/car.jeep.wrangler.glb')
  expect(jeep.visual!.steering).toBeUndefined()
  const once = structuredClone(doc)
  replaceLegacyJeeps(doc)
  expect(doc).toEqual(once)
})
