import { it, expect, vi, afterEach } from 'vitest'
import { decodePrepared, preparedPath, PreparationClient } from '../playground/prepared-world.js'
import { createEntity } from './scene.js'
const origin = { latitude: 43.32969, longitude: -1.819606, altitude: 28.253 }
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
it('uses stable versioned paths and rejects incompatible origins', () => {
  expect(preparedPath(origin, '0_0')).toBe('1/43.329690/-1.819606/28.253/0_0.json')
  const data = {
    version: 1,
    origin,
    key: '0_0',
    entities: [createEntity('box', 'box')],
    geometry: {},
  }
  expect(decodePrepared(data, origin, '0_0').entities).toHaveLength(1)
  expect(() => decodePrepared({ ...data, origin: {} }, origin, '0_0')).toThrow()
  expect(() => decodePrepared({ ...data, version: 2 }, origin, '0_0')).toThrow()
  expect(() => decodePrepared(data, origin, '1_0')).toThrow()
})
it('round trips typed geometry and rejects out-of-range indices', () => {
  const encode = (a: Float32Array | Uint32Array) =>
    btoa(String.fromCharCode(...new Uint8Array(a.buffer)))
  const geometry = {
    box: {
      position: encode(new Float32Array([1, 2, 3])),
      normal: encode(new Float32Array([0, 1, 0])),
      index: encode(new Uint32Array([0])),
    },
  }
  const data = { version: 1, origin, key: '0_0', entities: [createEntity('box', 'box')], geometry }
  expect([...decodePrepared(data, origin, '0_0').geometry.box.position]).toEqual([1, 2, 3])
  geometry.box.index = encode(new Uint32Array([1]))
  expect(() => decodePrepared(data, origin, '0_0')).toThrow()
})
it('does not enqueue repeatedly and stops after an unauthenticated response', async () => {
  vi.stubEnv('VITE_WORLD_PREPARE_API', '/prepare')
  const fetch = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
  vi.stubGlobal('fetch', fetch)
  const client = new PreparationClient()
  await client.enqueue(origin, ['0_0'])
  await client.enqueue(origin, ['1_0'])
  expect(fetch).toHaveBeenCalledTimes(1)
})
