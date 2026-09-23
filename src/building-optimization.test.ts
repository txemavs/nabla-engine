import { expect, it } from 'vitest'
import { createEntity } from './scene.js'
import { optimizePreparedBuildings } from '../services/world-cache/optimize-buildings.js'
import type { PreparedMapGeometry } from '../playground/map-geometry.js'

it('removes exact repeated triangles while preserving winding and roof color boundaries', () => {
  const building = {
    ...createEntity('b', 'solid'),
    source: {
      provider: 'openstreetmap' as const,
      id: 'way/1',
      retrievedAt: '2026-09-23',
      tags: { building: 'yes' },
    },
  }
  const triangle = [0, 0, 0, 1, 0, 0, 0, 1, 0]
  const buffers: PreparedMapGeometry = {
    b: {
      position: new Float32Array([...triangle, ...triangle, ...triangle]),
      normal: new Float32Array(Array(9).fill([0, 0, 1]).flat()),
      color: new Float32Array([
        ...Array(6).fill([1, 0, 0]).flat(),
        ...Array(3).fill([0, 0, 1]).flat(),
      ]),
    },
  }
  const report = optimizePreparedBuildings([building], buffers)
  expect(report.trianglesBefore).toBe(3)
  expect(report.trianglesAfter).toBe(2)
  expect(report.verticesAfter).toBe(6)
  expect(report.bytesAfter).toBeLessThan(report.bytesBefore)
  expect(buffers.b.color!.filter((_, i) => i % 3 === 2)).toEqual(
    new Float32Array([0, 0, 0, 1, 1, 1]),
  )
  const reversed: PreparedMapGeometry = {
    b: {
      position: new Float32Array(triangle),
      normal: new Float32Array(Array(3).fill([0, 0, 1]).flat()),
      index: new Uint32Array([0, 1, 2, 0, 2, 1]),
    },
  }
  expect(optimizePreparedBuildings([building], reversed).trianglesAfter).toBe(2)
  building.mapEditable = true
  expect(optimizePreparedBuildings([building], buffers).buildings).toBe(0)
})
