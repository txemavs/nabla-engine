/** Bake the S3 driver steering-wheel position into `s3.steering.glb`.
 *
 * The wheel spins about the steering model's +Z (the column axis, pointing away from the driver),
 * and the runtime «Volante» sliders move it on the same axes this script uses:
 *
 * - `columnForward` (metres, + toward the instrument cluster): slides the rim along its column,
 *   i.e. along model +Z — the slider's `distance` axis. It stays on its spin axis.
 * - `height` (metres, + up): moves the rim straight up in chassis space — the slider's `height`
 *   axis. Chassis up is converted into the steering model's space with the shared `steering` body
 *   anchor rotation (from the generated `car` rig). The column is tilted, so this also moves the
 *   rim across its spin axis; the script records the moved axis in `extras.nabla.spinPivot`
 *   (a point on the column in the GLB scene's space), which SceneView spins the wheel about.
 *
 * Baking `{ columnForward: c, height: h }` therefore matches, vertex for vertex, the previous GLB
 * with the sliders at `distance = c - previous columnForward` and `height = h - previous height`.
 * The shared `steering` body anchor (also used by the A3) is untouched.
 *
 * History: 3 cm forward (columnForward 0.03), then +1.0 cm distance / +2.5 cm height from the
 * sliders (columnForward 0.04, height 0.025).
 *
 * Idempotent: the applied values are recorded in `extras.nabla`; reruns only apply the difference.
 * Only the GLB JSON chunk changes; the binary buffer is untouched.
 */
import fs from 'node:fs'
import path from 'node:path'
import { Quaternion, Vector3 } from 'three'
import { extractVehicleRig, readGlbDocument } from './lib/vehicle-rig.mjs'

const file = 'assets/library/cars/a3/s3.steering.glb'
const columnForward = 0.04
const height = 0.025

const preset = JSON.parse(fs.readFileSync('assets/library/cars/a3/s3.json', 'utf8'))
if (
  preset.visual.steering?.url !== '/library/cars/a3/s3.steering.glb' ||
  preset.visual.steering.axis
)
  throw new Error('S3 preset steering changed; review the bake axes')
const body = preset.visual.body
const rig = extractVehicleRig(
  readGlbDocument(fs.readFileSync(path.join('assets', '.' + body.url))),
  body.transform,
)
if (!rig.steering) throw new Error('S3 body has no steering anchor')
// Chassis up in the steering model's space, exactly as steeringWheelOffsetPosition computes it.
const up = new Vector3(0, 1, 0).applyQuaternion(new Quaternion(...rig.steering.rotation).invert())
// The anchor has no roll, so up has no model X; drop the float dust (~1e-34) it leaves.
up.x = Math.abs(up.x) < 1e-12 ? 0 : up.x
const column = new Vector3(0, 0, 1)
const displacement = (forward, lift) =>
  column.clone().multiplyScalar(forward).addScaledVector(up, lift)

const source = fs.readFileSync(file)
const doc = readGlbDocument(source)
const root = doc.nodes[doc.scenes[doc.scene ?? 0].nodes[0]]
if (root.name !== 'S3 steering mesh alignment') throw new Error(`Unexpected root ${root.name}`)
if (root.matrix) throw new Error('S3 steering root uses a matrix; expected TRS')
const applied = root.extras?.nabla ?? {}
const appliedForward = applied.columnForward ?? 0
const appliedHeight = applied.height ?? 0
if (
  Math.abs(appliedForward - columnForward) < 1e-9 &&
  Math.abs(appliedHeight - height) < 1e-9 &&
  Array.isArray(applied.spinPivot) === (height !== 0)
) {
  console.log('S3 steering wheel already baked')
  process.exit(0)
}
const before = new Vector3(...(root.translation ?? [0, 0, 0]))
const after = before
  .clone()
  .add(displacement(columnForward, height))
  .sub(displacement(appliedForward, appliedHeight))
root.translation = after.toArray().map((v) => (Math.abs(v) < 1e-12 ? 0 : v))
const { spinPivot: _old, ...nabla } = applied
root.extras = {
  ...root.extras,
  nabla: {
    ...nabla,
    columnForward,
    height,
    // The column line only moves across itself with height; distance slides along it.
    ...(height !== 0 ? { spinPivot: up.clone().multiplyScalar(height).toArray() } : {}),
  },
}
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
const fmt = (v) =>
  v
    .toArray()
    .map((n) => n.toFixed(5))
    .join(', ')
console.log(
  `S3 steering root [${fmt(before)}] → [${fmt(after)}] m ` +
    `(columnForward ${columnForward}, height ${height}, spinPivot ${JSON.stringify(root.extras.nabla.spinPivot)})`,
)
