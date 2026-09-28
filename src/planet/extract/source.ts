/**
 * One Web Mercator tile as downloaded, before it becomes a local frame or a GLB.
 * Elevation is an Esri Terrain3D grid. Features are already closed OSM rings.
 */
import { mapTileBounds } from '../../scene/mercator.js'
import type { MapTile } from '../../scene/mercator.js'
import type { MapFeature } from './contract.js'

export interface PlanetTileSource {
  format: 'nabla-planet-source-v1'
  tile: MapTile
  retrievedAt: string
  elevation: {
    segments: number
    heights: number[]
    provider: 'esri-terrain-3d'
    /** Parallel to heights. False where Esri had no ground, including the flat sea fill. */
    measured?: boolean[]
  }
  features: MapFeature[]
}

export function validatePlanetTileSource(source: PlanetTileSource): void {
  if (!source || source.format !== 'nabla-planet-source-v1') throw Error('Invalid planet source')
  const { tile, elevation } = source
  mapTileBounds(tile)
  if (![13, 14, 15].includes(tile.z)) throw Error('Unsupported planet zoom')
  if (
    !elevation ||
    ![32, 64, 128].includes(elevation.segments) ||
    elevation.provider !== 'esri-terrain-3d' ||
    elevation.heights.length !== (elevation.segments + 1) ** 2 ||
    elevation.heights.some((h) => !Number.isFinite(h) || h < -12000 || h > 10000) ||
    !Array.isArray(source.features) ||
    source.features.length > 100000 ||
    !Number.isFinite(Date.parse(source.retrievedAt))
  )
    throw Error('Invalid planet source data')
  for (const feature of source.features) {
    if (
      !feature ||
      typeof feature.id !== 'string' ||
      !feature.tags ||
      !Array.isArray(feature.rings) ||
      feature.rings.some(
        (r) =>
          !Array.isArray(r.coordinates) ||
          r.coordinates.some(
            (p) =>
              !Array.isArray(p) ||
              p.length !== 2 ||
              !p.every(Number.isFinite) ||
              Math.abs(p[0]) > 180 ||
              Math.abs(p[1]) > 85.0511287798066,
          ),
      )
    )
      throw Error('Invalid planet feature')
  }
}
