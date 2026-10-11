/** Restore the engine contract after a Blender export, retaining the supplied geometry bytes. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { readGlb } from './lib/glb.mjs'

const directory = 'assets/library/motorcycles/vfr800fi-1999'
const destination = `${directory}/vfr800fi-1999.glb`
const source = process.argv[2]
if (!source || source === destination) throw new Error('Pass the user-exported GLB as an argument')
const previous = readGlb(destination).json
const { json, bin } = readGlb(source)
const body = json.nodes.find((n) => n.name === 'Body')
for (const old of previous.nodes) {
  const node = json.nodes.find((n) => n.name === old.name)
  if (node) {
    if (old.extras) node.extras = structuredClone(old.extras)
    if (old.extensions) node.extensions = structuredClone(old.extensions)
  } else if (old.mesh === undefined && (old.extras || old.extensions)) {
    const anchor = structuredClone(old)
    delete anchor.children
    body.children.push(json.nodes.length)
    json.nodes.push(anchor)
  }
}
json.extensions = { ...json.extensions, ...previous.extensions }
json.extensionsUsed = [
  ...new Set([...(json.extensionsUsed || []), ...(previous.extensionsUsed || [])]),
]
for (const material of json.materials) {
  const old = previous.materials.find((m) => m.name === material.name)
  if (old?.extras) material.extras = structuredClone(old.extras)
  const zone = {
    Tank_Paint: 'tank',
    Front_Fairing_Paint: 'front',
    Tail_Fairing_Paint: 'tail',
    Front_Rim_Paint: 'rim',
    Rear_Rim_Paint: 'rim',
    'Red rim stripe 6mm': 'rim-stripe',
  }[material.name]
  if (zone)
    material.extras = {
      ...material.extras,
      nabla: {
        ...material.extras?.nabla,
        paint: ['tank', 'front', 'tail'].includes(zone),
        paintZone: zone,
      },
    }
}
const document = Buffer.from(JSON.stringify(json))
const padded = Buffer.concat([document, Buffer.alloc((4 - (document.length % 4)) % 4, 32)])
const header = Buffer.alloc(20),
  chunk = Buffer.alloc(8)
header.writeUInt32LE(0x46546c67)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(28 + padded.length + bin.length, 8)
header.writeUInt32LE(padded.length, 12)
header.writeUInt32LE(0x4e4f534a, 16)
chunk.writeUInt32LE(bin.length)
chunk.writeUInt32LE(0x004e4942, 4)
const bytes = Buffer.concat([header, padded, chunk, bin])
fs.writeFileSync(destination, bytes)
const rigFile = `${directory}/vfr800fi-1999.rig.json`
const rig = JSON.parse(fs.readFileSync(rigFile))
for (const name of Object.keys(rig.nodes)) {
  const index = json.nodes.findIndex((n) => n.name === name)
  if (index < 0) throw new Error(`Missing rig part ${name}`)
  rig.nodes[name] = index
}
rig.passengerFootrests.orientation = 'folded upwards, with repaired closed supports'
fs.writeFileSync(rigFile, JSON.stringify(rig, null, 2) + '\n')
const manifestFile = `${directory}/asset.json`
const manifest = JSON.parse(fs.readFileSync(manifestFile))
manifest.triangles = json.meshes.reduce(
  (sum, m) => sum + m.primitives.reduce((n, p) => n + json.accessors[p.indices].count / 3, 0),
  0,
)
manifest.bytes = bytes.length
manifest.sha256 = createHash('sha256').update(bytes).digest('hex')
manifest.provenance.preparedOn = '2026-10-10'
manifest.provenance.edits.push(
  '2026-10-10: user-approved VFR800FI99.glb, reduced geometry, corrected wheels, brakes, folded footrests, closed supports, original mirrors and lights, no decals; radiator is the only image texture. Restore engine rig, cockpit, light channels and independent body/rim paint zones after Blender export.',
)
manifest.provenance.finalSourceSha256 = createHash('sha256')
  .update(fs.readFileSync(source))
  .digest('hex')
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
console.log({ triangles: manifest.triangles, bytes: manifest.bytes, sha256: manifest.sha256 })
