import { test, expect } from 'vitest'
import { BoxGeometry, Mesh } from 'three'
import { createEntity } from '../../src/entity/schema.js'
import { entityTileAsset } from '../../src/render/planet/tile-asset.js'

test('OSM sports buildings and building parts keep their volume category, outdoor pitches do not', () => {
  const cases: Record<string, string>[] = [
    { building: 'pitch', leisure: 'pitch' },
    { 'building:part': 'yes', leisure: 'pitch' },
    { building: 'no', leisure: 'pitch' },
    { leisure: 'pitch' },
  ]
  for (const [i, tags] of cases.entries()) {
    const e = createEntity('osm-way-205359440', 'solid')
    e.source = { provider: 'openstreetmap', id: 'way/205359440', retrievedAt: '2026-09-28', tags }
    const shape = new BoxGeometry(2, 9, 2).toNonIndexed()
    const data = {
      entities: [e],
      geometry: {
        [e.id]: {
          position: shape.attributes.position.array.buffer as ArrayBuffer,
          normal: shape.attributes.normal.array.buffer as ArrayBuffer,
        },
      },
    }
    const root = entityTileAsset(data, 'fixture', {})
    const mesh = root.children[0].children[0] as Mesh
    expect(mesh.userData.category).toBe(i < 2 ? 'Buildings' : 'Pitch')
    mesh.geometry.computeBoundingBox()
    expect(mesh.geometry.boundingBox!.max.y - mesh.geometry.boundingBox!.min.y).toBe(9)
    expect(mesh.userData.source.tags).toEqual(tags)
    root.traverse((n) => {
      if (n instanceof Mesh) {
        n.geometry.dispose()
        const m = Array.isArray(n.material) ? n.material : [n.material]
        m.forEach((x) => x.dispose())
      }
    })
    shape.dispose()
  }
})
