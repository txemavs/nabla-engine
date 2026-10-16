import { mapTileAt, mapTileId, type MapTile } from '../../scene/mercator.js'

/** Spawn Z15 followed by its three closest neighbours, measured to cell bounds in Mercator. */
export function startupTerrainTiles(latitude: number, longitude: number): MapTile[] {
  const center = mapTileAt(latitude, longitude, 15)
  const n = 2 ** center.z
  const px = (((longitude + 180) % 360 + 360) % 360) / 360 * n
  const py = (1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2 * n
  const neighbours: { tile: MapTile; distance: number; middle: number }[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || center.y + dy < 0 || center.y + dy >= n) continue
      const x = center.x + dx
      const y = center.y + dy
      const ex = Math.max(x - px, 0, px - x - 1)
      const ey = Math.max(y - py, 0, py - y - 1)
      neighbours.push({
        tile: { z: 15, x: (x + n) % n, y },
        distance: ex * ex + ey * ey,
        middle: (x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2,
      })
    }
  }
  neighbours.sort((a, b) => a.distance - b.distance || a.middle - b.middle || mapTileId(a.tile).localeCompare(mapTileId(b.tile)))
  return [center, ...neighbours.slice(0, 3).map(({ tile }) => tile)]
}
