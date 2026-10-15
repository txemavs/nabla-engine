import { mapTileAt, mapTileId, mapTileSample, type MapTile } from '../scene/mercator.js'

/** Closest cell boundary in local geographic distance; exclude the player's cell and loaded cells. */
export function nearestExtraZ15(
  latitude: number,
  longitude: number,
  loaded: readonly string[],
): MapTile | undefined {
  const current = mapTileAt(latitude, longitude, 15)
  const excluded = new Set([...loaded, mapTileId(current)])
  const candidates: { tile: MapTile; distance: number }[] = []
  for (let dy = -8; dy <= 8; dy++)
    for (let dx = -8; dx <= 8; dx++) {
      const tile = { z: 15, x: (current.x + dx + 32768) % 32768, y: current.y + dy }
      if (tile.y < 0 || tile.y >= 32768 || excluded.has(mapTileId(tile))) continue
      const nw = mapTileSample(tile, 0, 0, 1),
        se = mapTileSample(tile, 1, 1, 1)
      const lat = Math.max(se.latitude, Math.min(nw.latitude, latitude))
      const center = (nw.longitude + se.longitude) / 2
      const delta = ((longitude - center + 540) % 360) - 180
      const lonDistance = Math.max(0, Math.abs(delta) - (se.longitude - nw.longitude) / 2)
      candidates.push({
        tile,
        distance: (lat - latitude) ** 2 + (lonDistance * Math.cos((latitude * Math.PI) / 180)) ** 2,
      })
    }
  candidates.sort((a, b) => a.distance - b.distance)
  return candidates[0]?.tile
}
