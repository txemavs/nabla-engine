import { EARTH_RADIUS, ecef, localFrame, type GeoPoint } from './geography.js'
import { mapTileBounds, mapTileId, mapTileSample, type MapTile } from './map-tiles.js'
import type { MapFeature } from './real-world.js'
import type { Vec3Tuple } from './scene.js'

/** Source data is addressed on Earth, never in a document's local coordinate frame. */
export interface PlanetTileSource {
  format: 'nabla-planet-source-v1'
  tile: MapTile
  retrievedAt: string
  elevation: { segments: number; heights: number[]; provider: 'esri-terrain-3d' }
  features: MapFeature[]
}

/** Metric construction plane; all exports are subsequently projected onto the planet. */
export function planetTileFrame(tile: MapTile) {
  mapTileId(tile)
  const anchor = mapTileSample(tile, 1, 1, 2)
  const center = ecef(anchor),
    rotation = localFrame(anchor).invert()
  const scale = Math.cos((anchor.latitude * Math.PI) / 180)
  const circumference = 2 * Math.PI * EARTH_RADIUS
  const width = (circumference / 2 ** tile.z) * scale
  const project = ([longitude, latitude]: [number, number]): Vec3Tuple => {
    longitude += 360 * Math.round((anchor.longitude - longitude) / 360)
    const tx = ((longitude + 180) / 360) * 2 ** tile.z
    const ty = ((1 - Math.asinh(Math.tan((latitude * Math.PI) / 180)) / Math.PI) / 2) * 2 ** tile.z
    return [(tx - tile.x - 0.5) * width, 0, (ty - tile.y - 0.5) * width]
  }
  const point = ([x, y, z]: Vec3Tuple): GeoPoint => ({
    longitude: ((tile.x + 0.5 + x / width) / 2 ** tile.z) * 360 - 180,
    latitude:
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * (tile.y + 0.5 + z / width)) / 2 ** tile.z))) * 180) /
      Math.PI,
    altitude: y,
  })
  return {
    anchor,
    width,
    project,
    point,
    local: (p: Vec3Tuple) => ecef(point(p)).sub(center).applyQuaternion(rotation).toArray(),
  }
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
