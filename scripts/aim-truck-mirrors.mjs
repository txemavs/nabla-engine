/** Aim the stock tractor's right mirror glass for the left-hand-drive driver.
 *
 * The stock asset mirrors the right lens of the left one about the chassis centre line (X = 0),
 * but the driver sits on the left. Seen from `driver.eyes`, the symmetric right glass reflected a
 * view about 28° outward to the right instead of back along the right flank.
 *
 * This idempotent asset migration rotates only the `mirror.right` anchor (lens centre and roll
 * kept) so that the driver's reflected ray off the right glass is the X-mirror of the ray off the
 * left glass. Only the GLB JSON chunk changes; the binary buffer is untouched.
 */
import fs from 'node:fs'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { readGlbDocument } from './lib/vehicle-rig.mjs'

const file = 'assets/library/trucks/white-truck/assets/tractor.modern.glb'
const source = fs.readFileSync(file)
const doc = readGlbDocument(source)
const parents = new Map()
doc.nodes.forEach((node, i) => (node.children ?? []).forEach((c) => parents.set(c, i)))
const local = (node) =>
  node.matrix
    ? new Matrix4().fromArray(node.matrix)
    : new Matrix4().compose(
        new Vector3(...(node.translation ?? [0, 0, 0])),
        new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
        new Vector3(...(node.scale ?? [1, 1, 1])),
      )
const world = (i) => {
  const m = local(doc.nodes[i])
  for (let p = parents.get(i); p !== undefined; p = parents.get(p))
    m.premultiply(local(doc.nodes[p]))
  return m
}
const anchor = (name) => {
  const i = doc.nodes.findIndex((node) => node.extras?.nabla?.anchor === name)
  if (i < 0) throw new Error(`Missing ${name} anchor (run author-truck-mirrors.mjs first)`)
  return i
}
/** Driver view direction reflected by the glass of one mirror anchor. */
function reflected(eye, matrix) {
  const centre = new Vector3().setFromMatrixPosition(matrix)
  const normal = new Vector3(0, 0, 1).transformDirection(matrix)
  const d = centre.sub(eye).normalize()
  return d.addScaledVector(normal, -2 * d.dot(normal)).normalize()
}
const eye = new Vector3().setFromMatrixPosition(world(anchor('driver.eyes')))
const left = world(anchor('mirror.left'))
const rightIndex = anchor('mirror.right')
const right = world(rightIndex)
const target = reflected(eye, left).multiply(new Vector3(-1, 1, 1))
const before = reflected(eye, right)
const error = (before.angleTo(target) * 180) / Math.PI
if (error < 0.01) {
  console.log('Truck right mirror already aimed')
  process.exit(0)
}
// The plane normal that reflects the incident ray onto the target direction.
const incident = new Vector3().setFromMatrixPosition(right).sub(eye).normalize()
const wanted = target.clone().sub(incident).normalize()
const current = new Vector3(0, 0, 1).transformDirection(right)
const parentWorld = world(parents.get(rightIndex))
const parentRotation = new Quaternion().setFromRotationMatrix(parentWorld)
const correction = new Quaternion().setFromUnitVectors(current, wanted)
const node = doc.nodes[rightIndex]
// world = parent * local  =>  local' = parent^-1 * correction * parent * local
const rotation = parentRotation
  .clone()
  .invert()
  .multiply(correction)
  .multiply(parentRotation)
  .multiply(new Quaternion(...(node.rotation ?? [0, 0, 0, 1])))
  .normalize()
node.rotation = rotation.toArray()
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
  `right mirror re-aimed by ${((current.angleTo(wanted) * 180) / Math.PI).toFixed(2)}° ` +
    `(reflected view was ${error.toFixed(2)}° off the mirrored left view)`,
)
