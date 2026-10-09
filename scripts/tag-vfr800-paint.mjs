import fs from 'node:fs'
import { createHash } from 'node:crypto'

const directory = 'assets/library/motorcycles/vfr800fi-1999'
const path = `${directory}/vfr800fi-1999.glb`
const original = fs.readFileSync(path)
const jsonLength = original.readUInt32LE(12)
const json = JSON.parse(original.subarray(20, 20 + jsonLength).toString())
const paint = json.materials.find((m) => m.name === 'Gloss black fairing')
if (!paint) throw new Error('VFR fairing material missing')
paint.extras = { ...paint.extras, nabla: { ...paint.extras?.nabla, paint: true } }
const text = Buffer.from(JSON.stringify(json))
const padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 0x20)
text.copy(padded)
const header = Buffer.from(original.subarray(0, 20))
const tail = original.subarray(20 + jsonLength)
header.writeUInt32LE(20 + padded.length + tail.length, 8)
header.writeUInt32LE(padded.length, 12)
const output = Buffer.concat([header, padded, tail])
fs.writeFileSync(path, output)
const metadataPath = `${directory}/asset.json`
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
metadata.bytes = output.length
metadata.sha256 = createHash('sha256').update(output).digest('hex')
const edit =
  '2026-10-09 scripts/tag-vfr800-paint.mjs: tag the fairing material with extras.nabla.paint for authored body colour selection; geometry, textures and all other material properties are unchanged.'
if (!metadata.provenance.edits.includes(edit)) metadata.provenance.edits.push(edit)
fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n')
