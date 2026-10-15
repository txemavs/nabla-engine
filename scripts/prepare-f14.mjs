/** Preserve the supplied model; normalize only its root to Engine metres, +Y up/-Z forward. */
import { readFileSync, writeFileSync } from 'node:fs'
const source = process.argv[2]
if (!source) throw new Error('Usage: node scripts/prepare-f14.mjs source.glb [output.glb]')
const bytes = readFileSync(source)
const length = bytes.readUInt32LE(12)
const document = JSON.parse(bytes.subarray(20, 20 + length).toString())
// Measured from actual transformed vertices of the original Sketchfab export.
const scale = 19.1 / 4.038203846895932
const centre = [0, (0.375 + 1.418749988079071) / 2, (-0.4437500238418579 + 3.594453823054074) / 2]
for (const scene of document.scenes) {
  const root = document.nodes.length
  document.nodes.push({
    name: 'Engine_F14_Metres',
    children: scene.nodes,
    scale: [scale, scale, scale],
    translation: centre.map((v) => -v * scale),
  })
  scene.nodes = [root]
}
// Existing wing bones already have their authored sweep pivots. The all-moving
// horizontal stabilators are separate objects. Metadata is in normalized Engine metres.
const rig = {
  controls: [
    { node: 'bone6_13', kind: 'sweep', pivot: [-2.2748, -0.28, 1.27], side: -1 },
    { node: 'bone38_65', kind: 'sweep', pivot: [2.2748, -0.28, 1.27], side: 1 },
    { node: 'cuboid_14', kind: 'stabilator', pivot: [0, -0.46, 6.3], side: -1 },
    { node: 'cuboid_15', kind: 'stabilator', pivot: [0, -0.46, 6.3], side: 1 },
  ],
  exhausts: [
    [-1.3, -0.9, 7.57],
    [1.3, -0.9, 7.57],
  ],
}
document.nodes[document.scenes[document.scene ?? 0].nodes[0]].extras = { aircraftRig: rig }
const json = Buffer.from(JSON.stringify(document))
const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32)
json.copy(padded)
const tail = bytes.subarray(20 + length)
const header = Buffer.alloc(20)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(20 + padded.length + tail.length, 8)
header.writeUInt32LE(padded.length, 12)
header.writeUInt32LE(0x4e4f534a, 16)
writeFileSync(
  process.argv[3] ?? 'assets/library/planes/f14/f14.glb',
  Buffer.concat([header, padded, tail]),
)
