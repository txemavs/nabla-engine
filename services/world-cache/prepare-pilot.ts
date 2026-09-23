/** Offline comparison assets. Not a replacement for the production tile/collision recipe. */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { BufferGeometry, Float32BufferAttribute, Color, Matrix4, Vector3, Quaternion } from 'three'
import { roadAreaSnapshotSchema, groundRoadAreas } from '../../src/map-provider.js'
import { createRealWorld, type WorldExtract } from '../../src/real-world.js'
import { prepareMapGeometry, geometryFromBuffers } from '../../playground/map-geometry.js'

const [extractPath, snapshotPath, output, combinedPath] = process.argv.slice(2)
if (!extractPath || !snapshotPath || !output || !combinedPath)
  throw new Error(
    'Usage: prepare-pilot.js <OSM extract> <official snapshot> <output directory> <combined pack>',
  )
const extract = JSON.parse(readFileSync(extractPath, 'utf8')) as WorldExtract
const snapshot = roadAreaSnapshotSchema.parse(JSON.parse(readFileSync(snapshotPath, 'utf8')))
const scene = createRealWorld(extract)
const selected = scene.entities.filter(
  (e) => e.terrain || e.road || (e.source && e.geometry && !e.landcover && !e.railway),
)
const buffers = prepareMapGeometry(selected)
const groups: Record<string, number[]> = { terrain: [], osm: [], official: [], buildings: [] }
function append(target: string, geometry: BufferGeometry, color: string) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry
  if (!flat.getAttribute('normal')) flat.computeVertexNormals()
  const positions = flat.getAttribute('position'),
    normals = flat.getAttribute('normal')
  const colors = flat.getAttribute('color'),
    tint = new Color(color)
  for (let i = 0; i < positions.count; i++) {
    groups[target].push(
      positions.getX(i),
      positions.getY(i),
      positions.getZ(i),
      normals.getX(i),
      normals.getY(i),
      normals.getZ(i),
      colors ? colors.getX(i) : tint.r,
      colors ? colors.getY(i) : tint.g,
      colors ? colors.getZ(i) : tint.b,
    )
  }
  if (flat !== geometry) flat.dispose()
  geometry.dispose()
}
for (const e of selected) {
  const b = buffers[e.id]
  if (b) {
    const g = geometryFromBuffers(b)
    g.applyMatrix4(
      new Matrix4().compose(
        new Vector3(...e.transform.position),
        new Quaternion(...e.transform.rotation),
        new Vector3(1, 1, 1),
      ),
    )
    append(e.terrain ? 'terrain' : e.road ? 'osm' : 'buildings', g, e.color)
  }
}
const official = groundRoadAreas(snapshot, extract.origin, extract.terrain)
for (const { geometry } of official.surfaces) {
  const buffer = new BufferGeometry()
  buffer.setAttribute('position', new Float32BufferAttribute(geometry.vertices.flat(), 3))
  buffer.setIndex(geometry.faces.flat())
  append('official', buffer, '#42494d')
}
if (combinedPath) {
  const combined = JSON.parse(gunzipSync(readFileSync(combinedPath)).toString())
  groups.combined = []
  groups.officialTerrain = []
  for (const e of combined.entities as typeof scene.entities) {
    const kind = e.terrain
      ? 'officialTerrain'
      : (e.road && !e.road.renderSuppressed) || (e.parentId === 'world-roads' && e.landcover)
        ? 'combined'
        : null
    const wire = combined.geometry[e.id]
    if (!kind || !wire) continue
    const decode = (s: string) => {
      const b = Buffer.from(s, 'base64')
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
    }
    append(
      kind,
      geometryFromBuffers({
        position: new Float32Array(decode(wire.position)),
        normal: new Float32Array(decode(wire.normal)),
        ...(wire.index ? { index: new Uint32Array(decode(wire.index)) } : {}),
        ...(wire.color ? { color: new Float32Array(decode(wire.color)) } : {}),
      }),
      e.color,
    )
  }
}
const chunks: Buffer[] = []
const ranges: Record<string, { offset: number; count: number }> = {}
let offset = 0
for (const [key, values] of Object.entries(groups)) {
  const data = new Float32Array(values)
  const bytes = Buffer.from(data.buffer)
  ranges[key] = { offset, count: data.length / 9 }
  chunks.push(bytes)
  offset += bytes.length
}
const binary = Buffer.concat(chunks)
const compressed = gzipSync(binary, { level: 9 })
const recipe = 'geoeuskadi-comparison-v1'
const hash = createHash('sha256').update(compressed).digest('hex')
const manifest = {
  version: 1,
  recipe,
  file: `pilot-${hash.slice(0, 16)}.pack`,
  bytes: binary.length,
  downloadBytes: compressed.length,
  sha256: hash,
  groups: ranges,
  origin: extract.origin,
  bbox: snapshot.bbox,
  source: { ...snapshot, features: undefined },
  terrain: 'Existing Esri terrain; official elevation is not imported yet.',
  featureCount: snapshot.features.length,
  drawnPolygons: official.surfaces.length,
  excluded: official.excluded,
  attribution: `${snapshot.attribution} CC BY 4.0. OSM © OpenStreetMap contributors (ODbL). Terrain © Esri and its data providers.`,
}
mkdirSync(output, { recursive: true })
writeFileSync(join(output, manifest.file), compressed)
const target = resolve(output, 'manifest.json')
writeFileSync(target + '.tmp', JSON.stringify(manifest, null, 2) + '\n')
renameSync(target + '.tmp', target)
console.log(JSON.stringify({ bytes: binary.length, groups: ranges, excluded: official.excluded }))
