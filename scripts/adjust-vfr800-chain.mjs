/** Align the continuous chain with the inset sprocket; keep the grey hub in front of the sprocket. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { Vector3 } from 'three'
import { readGlb, writeGlb, components } from './lib/glb.mjs'
const dir = 'assets/library/motorcycles/vfr800fi-1999'
const file = `${dir}/vfr800fi-1999.glb`
const { json, bin, read } = readGlb(file)
const changed = new Map()
const rearWheel = json.nodes.find((n) => n.name === 'Wheel_Rear')
for (const primitive of json.meshes[rearWheel.mesh].primitives) {
  if (
    json.materials[primitive.material].name !==
    'Satin aluminium chassis, fork and passenger footrests'
  )
    continue
  const id = primitive.attributes.POSITION
  const positions = read(id)
  const cylinder = components(positions, read(primitive.indices).flat()).find(
    (c) => c.max[0] > 0 && c.min[0] > -0.08 && c.max[1] > 0.09,
  )
  if (!cylinder) throw new Error('Missing grey rear hub cylinder')
  // The outer face covers the inset sprocket; keep the inner face and grey finish in place.
  for (const index of new Set(cylinder.indices)) {
    const x = positions[index][0]
    positions[index][0] =
      -0.128 +
      ((x - cylinder.min[0]) / (cylinder.max[0] - cylinder.min[0])) * (cylinder.max[0] + 0.128)
  }
  changed.set(id, positions)
}
for (const name of ['Rear_Chain_Wrap', 'Rear_Sprocket']) {
  const node = json.nodes.find((n) => n.name === name)
  for (const primitive of json.meshes[node.mesh].primitives) {
    const id = primitive.attributes.POSITION
    changed.set(
      id,
      read(id).map(([x, y, z]) => [x + 0.026, y, z]),
    )
  }
}
const chain = json.nodes.find((n) => n.name === 'Chain')
const material = json.meshes[chain.mesh].primitives[0].material
const positions = [],
  normals = [],
  indices = []
function span(a, b) {
  const along = new Vector3(...b).sub(new Vector3(...a)).normalize()
  const x = new Vector3(0.012, 0, 0)
  const perpendicular = new Vector3(0, -along.z, along.y).multiplyScalar(0.006)
  const corners = [a, b].flatMap((p) =>
    [-1, 1].flatMap((sx) =>
      [-1, 1].map((sy) =>
        new Vector3(...p).addScaledVector(x, sx).addScaledVector(perpendicular, sy),
      ),
    ),
  )
  // Six closed faces, duplicated vertices for crisp normals, with overlapping wrap ends.
  for (const face of [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 5, 7, 3],
  ]) {
    const base = positions.length
    const n = new Vector3()
      .subVectors(corners[face[1]], corners[face[0]])
      .cross(new Vector3().subVectors(corners[face[2]], corners[face[0]]))
      .normalize()
    for (const i of face) {
      positions.push(corners[i].toArray())
      normals.push(n.toArray())
    }
    indices.push([base, base + 1, base + 2], [base, base + 2, base + 3])
  }
}
// Coordinates are in Chain's frame (its authored +5.56 mm Y offset is retained).
span([-0.077, 0.37, 0.119], [-0.10926, 0.42734, 0.722])
span([-0.077, 0.241, 0.119], [-0.10926, 0.19134, 0.722])
function add(values, type) {
  const id = json.accessors.length
  json.accessors.push({ count: values.length, type })
  changed.set(id, values)
  return id
}
json.meshes[chain.mesh].primitives = [
  {
    attributes: { POSITION: add(positions, 'VEC3'), NORMAL: add(normals, 'VEC3') },
    indices: add(
      indices.flat().map((i) => [i]),
      'SCALAR',
    ),
    material,
  },
]
writeGlb(file, json, (id) => changed.get(id) || read(id), bin)
const output = readGlb(file).json
const manifestPath = `${dir}/asset.json`
const manifest = JSON.parse(fs.readFileSync(manifestPath))
const bytes = fs.readFileSync(file)
manifest.bytes = bytes.length
manifest.triangles = output.meshes.reduce(
  (sum, m) => sum + m.primitives.reduce((n, p) => n + output.accessors[p.indices].count / 3, 0),
  0,
)
manifest.sha256 = createHash('sha256').update(bytes).digest('hex')
manifest.provenance.edits.push(
  '2026-10-10 owner correction: inset rear chain and sprocket by 26 mm; replace open separated spans with a closed continuous black band meeting the lower semicircle. Keep the existing grey hub over the sprocket.',
)
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
const rigPath = `${dir}/vfr800fi-1999.rig.json`
const rig = JSON.parse(fs.readFileSync(rigPath))
rig.chain.frontSprocket[0] = -0.077
rig.chain.rearSprocket = [-0.10926, 0.3149, 0.72]
rig.chain.sourceSpans = ['upper continuous band', 'lower continuous band']
fs.writeFileSync(rigPath, JSON.stringify(rig, null, 2) + '\n')
console.log({ triangles: manifest.triangles, bytes: manifest.bytes })
