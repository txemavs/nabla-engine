import { expect, it } from 'vitest'
import { combineRoadSurfaces } from './combined-roads.js'
import { createRealWorld } from './real-world.js'
import { localToGeo } from './geography.js'
import { roadAreaSnapshotSchema } from './map-provider.js'
import { parseScene } from './scene.js'
import fixture from '../assets/geography/geoeuskadi-ventas.json'
const origin = { latitude: 43.33, longitude: -1.82, altitude: 0 }
const coordinate = (x: number, z: number): [number, number] => {
  const p = localToGeo(origin, [x, 0, z])
  return [p.longitude, p.latitude]
}
it('cuts only official overlap, preserves centerlines and bridges, and survives save/load', () => {
  const doc = createRealWorld({
    name: 'test',
    origin,
    terrain: { columns: 11, rows: 11, spacing: 10, heights: Array(121).fill(0) },
    source: { retrievedAt: '2026-09-23' },
    features: [
      {
        id: 'way/1',
        tags: { highway: 'residential' },
        rings: [{ role: 'outer', coordinates: [coordinate(-40, 0), coordinate(40, 0)] }],
      },
      {
        id: 'way/2',
        tags: { highway: 'residential', bridge: 'yes' },
        rings: [{ role: 'outer', coordinates: [coordinate(-40, 25), coordinate(40, 25)] }],
      },
      {
        id: 'way/3',
        tags: { highway: 'residential' },
        rings: [{ role: 'outer', coordinates: [coordinate(-40, -25), coordinate(40, -25)] }],
      },
    ],
  })
  const snapshot = roadAreaSnapshotSchema.parse(fixture)
  snapshot.features = [
    {
      type: 'Feature',
      properties: {
        OBJECTID: 1,
        ID_TIPO: '0029',
        ESTADO: 'USO',
        SITUACION: 'SUP',
        COMPONEN2D: 'CGN',
        CODIGOC: null,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-10, -10],
            [10, -10],
            [10, 10],
            [-10, 10],
            [-10, -10],
          ].map(([x, z]) => coordinate(x, z)),
        ],
      },
    },
  ]
  const paths = structuredClone(doc.entities.find((e) => e.id === 'osm-way-1')!.road!.paths)
  const baseline = doc.entities.find((e) => e.terrain)!.mapBaseline
  expect(combineRoadSurfaces(doc, snapshot)).toBeGreaterThan(0)
  expect(doc.entities.find((e) => e.id === 'osm-way-1')!.road).toMatchObject({
    paths,
    renderSuppressed: true,
  })
  expect(doc.entities.find((e) => e.id === 'osm-way-2')!.road!.renderSuppressed).toBeUndefined()
  expect(doc.entities.find((e) => e.id === 'osm-way-3')!.road!.renderSuppressed).toBeUndefined()
  for (const e of doc.entities.filter((e) => e.geometry && e.source?.id === 'way/1')) {
    expect(e.motion).toBe('none')
    for (const face of e.geometry!.faces) {
      const x = face.reduce((sum, i) => sum + e.geometry!.vertices[i][0], 0) / face.length
      expect(Math.abs(x)).toBeGreaterThanOrEqual(9.999)
    }
  }
  expect(doc.entities.find((e) => e.terrain)!.mapBaseline).toBe(baseline)
  expect(parseScene(JSON.parse(JSON.stringify(doc))).entities).toHaveLength(doc.entities.length)
})
