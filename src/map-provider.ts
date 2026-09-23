import { z } from 'zod'
import { geoToLocal, type GeoPoint } from './geography.js'
import { drapeLandcoverPolygon } from './real-world.js'
import type { TerrainData } from './terrain.js'
import type { SolidGeometry } from './solid.js'

/** Import provenance is separate from OSM tags and revision-dependent native IDs. */
export interface ProviderFeatureSource {
  provider: string
  dataset: string
  revision: string
  nativeId: string
  kind: 'road-area'
}
const point = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
const ring = z
  .array(point)
  .min(4)
  .refine((r) => r[0][0] === r.at(-1)![0] && r[0][1] === r.at(-1)![1])
const polygon = z.array(ring).min(1)
export const roadAreaSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  provider: z.literal('geoeuskadi'),
  dataset: z.literal('bta5-road-areas-59'),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  recipe: z.literal('road-area-audit-v1'),
  crs: z.literal('EPSG:4326'),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  complete: z.literal(true),
  retrievedAt: z.string(),
  attribution: z.string(),
  license: z.literal('CC-BY-4.0'),
  source: z.string().url(),
  catalog: z.string().url(),
  dictionary: z.string().url(),
  features: z
    .array(
      z.object({
        type: z.literal('Feature'),
        properties: z.object({
          OBJECTID: z.number().int().nonnegative(),
          ID_TIPO: z.string(),
          SITUACION: z.string().nullable(),
          ESTADO: z.string().nullable(),
          COMPONEN2D: z.string().nullable(),
          CODIGOC: z.string().nullable(),
        }),
        geometry: z.discriminatedUnion('type', [
          z.object({ type: z.literal('Polygon'), coordinates: polygon }),
          z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(polygon).min(1) }),
        ]),
      }),
    )
    .max(4000),
})
export type RoadAreaSnapshot = z.infer<typeof roadAreaSnapshotSchema>

/** Deliberately excludes decks/underground/unknown states: XY cannot establish their height. */
export function groundRoadAreas(
  snapshot: RoadAreaSnapshot,
  origin: GeoPoint,
  terrain: TerrainData,
) {
  const surfaces: { source: ProviderFeatureSource; geometry: SolidGeometry }[] = []
  const excluded: Record<string, number> = {}
  for (const feature of snapshot.features) {
    const p = feature.properties
    const reason =
      p.SITUACION !== 'SUP'
        ? 'not-surface'
        : p.ESTADO !== 'USO'
          ? 'not-in-use'
          : p.COMPONEN2D !== 'CGN'
            ? 'hidden-or-unclassified'
            : null
    if (reason) {
      excluded[reason] = (excluded[reason] ?? 0) + 1
      continue
    }
    const polygons =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates
    const source: ProviderFeatureSource = {
      provider: snapshot.provider,
      dataset: snapshot.dataset,
      revision: snapshot.revision,
      nativeId: String(p.OBJECTID),
      kind: 'road-area',
    }
    for (const polygon of polygons) {
      const geometry = drapeLandcoverPolygon(
        polygon.map((coordinates, i) => ({
          role: i === 0 ? 'outer' : 'inner',
          points: coordinates.map(([longitude, latitude]) =>
            geoToLocal(origin, { longitude, latitude, altitude: origin.altitude }),
          ),
        })),
        terrain,
        0.035,
      )
      if (geometry.faces.length) surfaces.push({ source, geometry })
    }
  }
  return { surfaces, excluded }
}
