/**
 * One downloaded district, before it becomes a scene.
 *
 * `MapFeature` is an OSM way or relation already closed into rings.
 * `WorldExtract` is the origin, the heightfield and those features.
 * `IRUN_VENTAS` is the example district and the default origin for tests.
 */
import type { GeoPoint } from '../../math/geo/sphere.js'
import { type TerrainData } from '../land/terrain.js'

/** One OSM way or relation, already assembled into outer and inner rings. */
export interface MapFeature {
  id: string
  tags: Record<string, string>
  rings: { role: string; coordinates: [number, number][] }[]
}

/** One downloaded district: origin, heightfield, and the features to turn into a scene. */
export interface WorldExtract {
  name: string
  origin: GeoPoint
  terrain: TerrainData
  features: MapFeature[]
  source: { retrievedAt: string; [key: string]: unknown }
}

/** Irún · Ventas. The example district and the default origin for real-world tests. */
export const IRUN_VENTAS: GeoPoint = { latitude: 43.32969, longitude: -1.819606, altitude: 28.253 }
