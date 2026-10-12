/** Align the live faces with the exported cockpit and give the owner's controls their fixed finishes. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { readGlb, writeGlb, components } from './lib/glb.mjs'
const dir = 'assets/library/motorcycles/vfr800fi-1999'
const file = `${dir}/vfr800fi-1999.glb`
const { json, bin, read } = readGlb(file)
const vehicle = json.nodes.find((n) => n.name === 'Interceptor').extras.nabla.vehicle
if (vehicle.cockpitSurfaceAligned)
  throw new Error('Cockpit correction already applied; import a fresh owner export first')
for (const node of json.nodes) {
  if (/^(gauge_|lamp_)/.test(node.name)) node.translation[1] += 0.00556
}
vehicle.cockpitSurfaceAligned = true
const grey = json.materials.length
json.materials.push({
  name: 'VFR grey levers and clip-on handlebars',
  pbrMetallicRoughness: {
    baseColorFactor: [0.46, 0.48, 0.5, 1],
    metallicFactor: 0.65,
    roughnessFactor: 0.3,
  },
})
const steering = json.nodes.find((n) => n.name === 'Steering_Pivot')
const mesh = json.meshes[steering.mesh]
const black = mesh.primitives.find(
  (p) => json.materials[p.material].name === 'Black brake hardware and bar ends',
)
const parts = components(read(black.attributes.POSITION), read(black.indices).flat())
const selected = [0, 1, 8, 9, 23, 24]
const expected = [352, 348, 139, 138, 59, 59]
for (let i = 0; i < selected.length; i++)
  if (parts[selected[i]].indices.length / 3 !== expected[i])
    throw new Error('Unexpected cockpit geometry: inspect the owner export before recolouring')
const changed = new Map()
function indices(values) {
  const index = json.accessors.length
  json.accessors.push({ type: 'SCALAR', count: values.length })
  changed.set(
    index,
    values.map((i) => [i]),
  )
  return index
}
black.indices = indices(parts.filter((_, i) => !selected.includes(i)).flatMap((c) => c.indices))
mesh.primitives.push({
  ...black,
  indices: indices(selected.flatMap((i) => parts[i].indices)),
  material: grey,
})
writeGlb(file, json, (id) => changed.get(id) || read(id), bin)
const bytes = fs.readFileSync(file)
const manifestPath = `${dir}/asset.json`
const manifest = JSON.parse(fs.readFileSync(manifestPath))
manifest.bytes = bytes.length
manifest.sha256 = createHash('sha256').update(bytes).digest('hex')
manifest.provenance.edits.push(
  '2026-10-10 cockpit correction: raise instrument anchors 5.56 mm to match the exported plastic surfaces; grey brake/clutch levers and clip-on handlebars, preserving black fluid reservoirs and their mounts. No triangles added or removed.',
)
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
