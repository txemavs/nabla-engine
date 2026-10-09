import fs from 'node:fs'
import { createHash } from 'node:crypto'

const directory = 'assets/library/motorcycles/vfr800fi-1999'
const path = `${directory}/vfr800fi-1999.glb`
const bytes = fs.readFileSync(path)
const jsonLength = bytes.readUInt32LE(12)
const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString())
const name = 'VFR silencer subtle reflection'
let index = json.materials.findIndex((material) => material.name === name)
if (index < 0) {
  const original = json.materials.find(
    (material) => material.name === 'Mirror chrome stanchions and silencer',
  )
  if (!original) throw new Error('VFR silencer source material missing')
  const material = structuredClone(original)
  material.name = name
  material.extras = { ...material.extras, nabla: { ...material.extras?.nabla, envFloor: 0.025 } }
  index = json.materials.length
  json.materials.push(material)
}
for (const mesh of json.meshes)
  if (mesh.name === 'Body')
    for (const primitive of mesh.primitives)
      if (json.materials[primitive.material].name === 'Mirror chrome stanchions and silencer')
        primitive.material = index
const source = Buffer.from(JSON.stringify(json))
const padded = Buffer.alloc(Math.ceil(source.length / 4) * 4, 0x20)
source.copy(padded)
const header = Buffer.from(bytes.subarray(0, 20)),
  tail = bytes.subarray(20 + jsonLength)
header.writeUInt32LE(20 + padded.length + tail.length, 8)
header.writeUInt32LE(padded.length, 12)
const output = Buffer.concat([header, padded, tail])
fs.writeFileSync(path, output)
const metadataPath = `${directory}/asset.json`
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
metadata.bytes = output.length
metadata.sha256 = createHash('sha256').update(output).digest('hex')
const edit =
  '2026-10-09 scripts/set-vfr800-exhaust-reflection.mjs: split the silencer material from the fork stanchions; authored envFloor 0.025 keeps only the final exhaust subtly reflective when global reflections are off. Geometry unchanged.'
if (!metadata.provenance.edits.includes(edit)) metadata.provenance.edits.push(edit)
fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n')
