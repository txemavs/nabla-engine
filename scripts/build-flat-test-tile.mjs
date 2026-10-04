import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { BufferAttribute, BufferGeometry } from 'three'
import { writeGlb } from './lib/glb.mjs'
import { planetTileFrame } from '../dist/planet/tiles.js'
import { PLANET_GEOMETRY_REVISION, validatePlanetManifest } from '../dist/planet/contract.js'
import { mapTileBounds, mapTileId, mapTileFilename } from '../dist/scene/mercator.js'
import { FLAT_TEST_TILES } from '../dist/examples/flat-tile.js'

// Reproducible original geometry. No network, source datasets or timestamps from the host.
for (const tile of FLAT_TEST_TILES) {
  const directory = new URL(
    `../assets/examples/flat-z15/z/${tile.z}/${tile.x}/${tile.y}/`,
    import.meta.url,
  )
  fs.mkdirSync(directory, { recursive: true })
  const frame = planetTileFrame(tile),
    segments = 32,
    position = [],
    index = []
  for (let row = 0; row <= segments; row++)
    for (let col = 0; col <= segments; col++) {
      position.push(
        frame.local([
          (col / segments - 0.5) * frame.width,
          0,
          (row / segments - 0.5) * frame.width,
        ]),
      )
    }
  for (let row = 0; row < segments; row++)
    for (let col = 0; col < segments; col++) {
      const a = row * (segments + 1) + col,
        b = a + 1,
        c = a + segments + 1,
        d = c + 1
      index.push([a], [c], [d], [a], [d], [b])
    }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position.flat()), 3))
  geometry.setIndex(index.flat())
  geometry.computeVertexNormals()
  const normal = Array.from({ length: position.length }, (_, i) =>
    [0, 1, 2].map((k) => geometry.attributes.normal.array[i * 3 + k]),
  )
  const terrain = {
    asset: { version: '2.0', generator: 'Nabla synthetic planetary fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'Flat test terrain', mesh: 0, extras: { category: 'Terrain', synthetic: true } },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [
      {
        name: 'Test surface',
        pbrMetallicRoughness: {
          baseColorFactor: [0.38, 0.42, 0.36, 1],
          metallicFactor: 0,
          roughnessFactor: 1,
        },
      },
    ],
    accessors: [{ type: 'VEC3' }, { type: 'VEC3' }, { type: 'SCALAR' }],
  }
  const empty = {
    asset: terrain.asset,
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    accessors: [],
  }
  const files = {}
  for (const [layer, stem, json] of [
    ['terrain', 'terra', terrain],
    ['buildings-osm', 'build', empty],
  ]) {
    const path = `${stem}-${tile.z}-${tile.x}-${tile.y}-202610040000.glb`
    const url = new URL(path, directory)
    writeGlb(url, json, (id) => [position, normal, index][id], Buffer.alloc(0))
    const bytes = fs.readFileSync(url)
    files[layer] = {
      path,
      download: mapTileFilename(tile, layer),
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }
  }
  geometry.dispose()
  const manifest = {
    format: 'nabla-planet-tile-v1',
    generator: 'native-xyz-v2',
    geometryRevision: PLANET_GEOMETRY_REVISION,
    id: mapTileId(tile),
    tile,
    anchor: frame.anchor,
    bounds: mapTileBounds(tile),
    files,
  }
  validatePlanetManifest(manifest, tile)
  fs.writeFileSync(new URL('manifest.json', directory), JSON.stringify(manifest, null, 2) + '\n')
  console.log(
    `Generated ${manifest.id}: ${Object.values(files).reduce((sum, file) => sum + file.bytes, 0)} bytes`,
  )
}
