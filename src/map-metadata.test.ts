import { expect, it } from 'vitest'
import { compactMapTags } from './map-metadata.js'
it('retains structural tags without copying address, contact or multilingual descriptions', () => {
  const tags = {
    building: 'yes',
    'roof:shape': 'pyramidal',
    'roof:levels': '1',
    highway: 'residential',
    bridge: 'yes',
    layer: '1',
    name: 'Town hall',
    'name:en': 'Town hall',
    'addr:street': 'Main Street',
    website: 'https://example.com',
    description: 'x'.repeat(1000),
  }
  const compact = compactMapTags(tags)
  expect(compact).toEqual({
    building: 'yes',
    'roof:shape': 'pyramidal',
    'roof:levels': '1',
    highway: 'residential',
    bridge: 'yes',
    layer: '1',
  })
  expect(tags.name).toBe('Town hall')
  expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(tags).length / 4)
})
