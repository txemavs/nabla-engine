import { gzipSync } from 'node:zlib'
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { createRealWorld, type WorldExtract } from '../../src/real-world.js'
import { combineRoadSurfaces } from '../../src/combined-roads.js'
import { roadAreaSnapshotSchema } from '../../src/map-provider.js'
import { parseScene } from '../../src/scene.js'
import { prepareMapGeometry } from '../../playground/map-geometry.js'
const [input, snapshotPath, output] = process.argv.slice(2)
if (!output) throw Error('Usage: prepare-driving-pilot.js <OSM extract> <BTA snapshot> <output>')
const extract = JSON.parse(readFileSync(input, 'utf8')) as WorldExtract
const snapshot = roadAreaSnapshotSchema.parse(JSON.parse(readFileSync(snapshotPath, 'utf8')))
const doc = createRealWorld(extract)
const added = combineRoadSurfaces(doc, snapshot)
doc.name = 'Irún · Ventas · OSM + geoEuskadi'
parseScene(doc)
const geometry = prepareMapGeometry(doc.entities)
const encode = (a: Float32Array | Uint32Array) =>
  Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64')
const wire = Object.fromEntries(
  Object.entries(geometry).map(([id, g]) => [
    id,
    {
      position: encode(g.position),
      normal: encode(g.normal),
      ...(g.index ? { index: encode(g.index) } : {}),
      ...(g.color ? { color: encode(g.color) } : {}),
    },
  ]),
)
const result = JSON.stringify({
  version: 5,
  origin: extract.origin,
  key: '0_0',
  scene: { ...doc, entities: undefined },
  entities: doc.entities,
  geometry: wire,
  recipe: 'ventas-combined-roads-v1',
  revision: snapshot.revision,
  attribution: snapshot.attribution,
})
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output + '.tmp', gzipSync(result, { level: 9 }))
renameSync(output + '.tmp', output)
console.log(
  JSON.stringify({
    surfaces: added,
    entities: doc.entities.length,
    bytes: Buffer.byteLength(result),
  }),
)
