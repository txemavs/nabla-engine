import { BufferAttribute, BufferGeometry } from 'three'
import { planetTileFrame } from './planet-tile.js'
import { mapTileId, type MapTile } from './map-tiles.js'
import { planetCollisionChunks } from './planet-artifact.js'
/** Coarse relief uses the same XYZ lattice/frame as the detailed GLBs. */
export function horizonGeometry(tile: MapTile, heights: number[]) {
  const segments = 32,
    frame = planetTileFrame(tile)
  if (tile.z !== 13 || heights.length !== 33 * 33 || !heights.every(Number.isFinite))
    throw Error('Invalid relief grid')
  const position = new Float32Array(heights.length * 3)
  for (let row = 0; row <= segments; row++)
    for (let col = 0; col <= segments; col++)
      position.set(
        frame.local([
          (col / segments - 0.5) * frame.width,
          heights[row * 33 + col],
          (row / segments - 0.5) * frame.width,
        ]),
        (row * 33 + col) * 3,
      )
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
  return { tile, position, normal, blocks }
}
export type HorizonGeometry = ReturnType<typeof horizonGeometry>
export function coversTile(parent: MapTile, child: MapTile): boolean {
  const scale = 2 ** (child.z - parent.z)
  return (
    parent.z <= child.z &&
    Math.floor(child.x / scale) === parent.x &&
    Math.floor(child.y / scale) === parent.y
  )
}
