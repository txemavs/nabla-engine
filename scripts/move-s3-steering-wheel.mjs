/** Move the S3 steering wheel 3 cm forward along its column, toward the instrument cluster.
 *
 * The S3 rim sat ~2–3 cm too far back from the dashboard. The wheel spins about the steering
 * model's +Z (the column axis, pointing away from the driver), so sliding the alignment root of
 * `s3.steering.glb` along +Z moves the rim toward the gauges and keeps it centred on its spin
 * axis. The shared `steering` body anchor (also used by the A3) is untouched.
 *
 * Idempotent: the applied offset is recorded in `extras.nabla.columnForward`. Only the GLB JSON
 * chunk changes; the binary buffer is untouched.
 */
import fs from 'node:fs'
import { readGlbDocument } from './lib/vehicle-rig.mjs'

const file = 'assets/library/cars/a3/s3.steering.glb'
const forward = 0.03
const source = fs.readFileSync(file)
const doc = readGlbDocument(source)
const root = doc.nodes[doc.scenes[doc.scene ?? 0].nodes[0]]
if (root.name !== 'S3 steering mesh alignment') throw new Error(`Unexpected root ${root.name}`)
const applied = root.extras?.nabla?.columnForward ?? 0
if (Math.abs(applied - forward) < 1e-9) {
  console.log('S3 steering wheel already moved forward')
  process.exit(0)
}
const [x, y, z] = root.translation ?? [0, 0, 0]
root.translation = [x, y, z + forward - applied]
root.extras = { ...root.extras, nabla: { ...root.extras?.nabla, columnForward: forward } }
const json = Buffer.from(JSON.stringify(doc))
const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)])
const rest = source.subarray(20 + source.readUInt32LE(12))
const header = Buffer.alloc(20)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(20 + padded.length + rest.length, 8)
header.writeUInt32LE(padded.length, 12)
header.writeUInt32LE(0x4e4f534a, 16)
fs.writeFileSync(file, Buffer.concat([header, padded, rest]))
console.log(
  `S3 steering root z ${z.toFixed(4)} → ${root.translation[2].toFixed(4)} m (column, toward dash)`,
)
