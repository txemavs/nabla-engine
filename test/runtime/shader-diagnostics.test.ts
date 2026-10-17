import { expect, it } from 'vitest'
import { describePrograms, latestProgramId } from '../../src/runtime/shader-diagnostics.js'
it('identifies new programs even when old programs were released and the total did not increase', () => {
  const before = [
    { id: 4, name: 'road' },
    { id: 8, name: 'glass' },
  ]
  const after = [
    { id: 4, name: 'road' },
    { id: 9, name: 'headlight', type: 'MeshStandardMaterial', cacheKey: 'new-light-layout' },
  ]
  expect(describePrograms(after, latestProgramId(before))).toEqual([
    { id: 9, name: 'headlight', type: 'MeshStandardMaterial', variant: 'new-light-layout' },
  ])
})
it('labels unnamed materials without making up an owner', () => {
  expect(describePrograms([{ id: 1, name: '', type: 'MeshPhysicalMaterial' }])[0].name).toBe(
    'MeshPhysicalMaterial',
  )
})
