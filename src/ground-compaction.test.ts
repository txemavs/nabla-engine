import { expect, test } from 'vitest'
import { createEntity } from './scene.js'
import { compactGround } from '../services/world-cache/compact-ground.js'

test('ground compaction snaps, welds, removes collapsed and duplicate faces without mutating sources', () => {
  const entity = createEntity('ground', 'solid')
  entity.landcover = { surface: 'grass', isWater: false }
  const position = new Float32Array([
    0.01, 0.02, 0, 1.01, 0.02, 0, 0, 0.02, 1, 0.01, 0.02, 0, 1.01, 0.02, 0, 0, 0.02, 1, 0, 0, 0,
    0.01, 0, 0, 0, 0, 0.01,
  ])
  const normal = new Float32Array(position.length)
  const data = {
    version: 5,
    origin: { latitude: 0, longitude: 0, altitude: 0 },
    key: '0_0',
    entities: [entity],
    geometry: { ground: { position: position.buffer, normal: normal.buffer } },
  }
  const result = compactGround(data, 0.1).geometry.ground
  expect(new Float32Array(result.position).length).toBe(9)
  expect(new Uint32Array(result.index!).length).toBe(3)
  expect(new Float32Array(result.position)).toEqual(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]))
  expect(new Float32Array(result.normal).every(Number.isFinite)).toBe(true)
  expect(data.geometry.ground.position).toBe(position.buffer)
  entity.landcover = undefined
  entity.railway = { part: 'rail' }
  expect(compactGround(data, 1).geometry.ground).toBe(data.geometry.ground)
  expect(() => compactGround(data, 0)).toThrow()
})
