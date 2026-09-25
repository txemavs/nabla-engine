/**
 * One Web Mercator tile as a local metre plane, plus the coarse z13 relief.
 * The relief is split into sixteen z15 blocks so one child GLB can replace one block.
 */
import { BufferAttribute, BufferGeometry } from 'three'
import { EARTH_RADIUS, ecef, localFrame, type GeoPoint } from '../math/geo/sphere.js'
import { mapTileId, mapTileSample, type MapTile } from '../scene/mercator.js'
import type { Vec3Tuple } from '../math/frame/vectors.js'
import { planetCollisionChunks } from './collisions/chunks.js'

/** Metric construction plane. Exports are projected onto the planet afterwards. */
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

export function horizonGeometry(tile: MapTile, heights: number[]) {
  const segments = 32,
    frame = planetTileFrame(tile)
  if (tile.z !== 13 || heights.length !== 33 * 33 || !heights.every(Number.isFinite))
    throw Error('Invalid relief grid')
  const position = new Float32Array(heights.length * 3)
  const uv = new Float32Array(heights.length * 2)
  for (let row = 0; row <= segments; row++)
    for (let col = 0; col <= segments; col++) {
      uv[(row * 33 + col) * 2] = col / segments
      uv[(row * 33 + col) * 2 + 1] = 1 - row / segments
      position.set(
        frame.local([
          (col / segments - 0.5) * frame.width,
          heights[row * 33 + col],
          (row / segments - 0.5) * frame.width,
        ]),
        (row * 33 + col) * 3,
      )
    }
  const blocks = []
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const leaf = { z: 15, x: tile.x * 4 + x, y: tile.y * 4 + y },
        indices: number[] = []
      for (let row = y * 8; row < (y + 1) * 8; row++)
        for (let col = x * 8; col < (x + 1) * 8; col++) {
          const a = row * 33 + col,
            b = a + 1,
            c = a + 33,
            d = c + 1
          indices.push(a, c, d, a, d, b)
        }
      const index = new Uint32Array(indices)
      const chunks = planetCollisionChunks([
        {
          name: 'Relief',
          position,
          normal: new Float32Array(),
          index,
          tint: '#304d25',
          side: 0,
          metadata: { category: 'Terrain' },
        },
      ])
      for (const chunk of chunks) chunk.key = mapTileId(leaf) + ':' + chunk.key
      blocks.push({ tile: leaf, index, chunks })
    }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setIndex(blocks.flatMap((b) => Array.from(b.index)))
  geometry.computeVertexNormals()
  const normal = new Float32Array(geometry.getAttribute('normal').array)
  geometry.dispose()
  return { tile, position, normal, uv, blocks }
}
export type HorizonGeometry = ReturnType<typeof horizonGeometry>
