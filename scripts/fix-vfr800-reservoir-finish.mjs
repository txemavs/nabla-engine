/** Give the brake/clutch reservoirs and lids a painted satin finish instead of reflective metal. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { readGlb, writeGlb, components } from './lib/glb.mjs'

const directory = 'assets/library/motorcycles/vfr800fi-1999'
const file = `${directory}/vfr800fi-1999.glb`
const { json, bin, read } = readGlb(file)
const name = 'VFR satin black fluid reservoirs and lids'
const existing = json.materials.findIndex((material) => material.name === name)
if (existing >= 0) throw new Error('Reservoir finish already authored')
const finish = json.materials.length
json.materials.push({
  name,
  pbrMetallicRoughness: {
    baseColorFactor: [0.018, 0.02, 0.022, 1],
    metallicFactor: 0.05,
    roughnessFactor: 0.75,
  },
})
const steering = json.nodes.find((node) => node.name === 'Steering_Pivot')
const mesh = json.meshes[steering.mesh]
const changed = new Map()
const accessor = (values) => {
  const id = json.accessors.length
  json.accessors.push({ type: 'SCALAR', count: values.length })
  changed.set(
    id,
    values.map((value) => [value]),
  )
  return id
}
for (const [material, selected, expected] of [
  ['Black brake hardware and bar ends', [2, 3], [162, 160]],
  ['VFR grey levers and clip-on handlebars', [4, 5], [59, 59]],
]) {
  const primitive = mesh.primitives.find((part) => json.materials[part.material].name === material)
  if (!primitive) throw new Error(`Missing ${material}`)
  const parts = components(read(primitive.attributes.POSITION), read(primitive.indices).flat())
  for (let i = 0; i < selected.length; i++)
    if (parts[selected[i]]?.indices.length / 3 !== expected[i])
      throw new Error('Unexpected reservoir geometry; inspect before recolouring')
  const reservoirIndices = selected.flatMap((i) => parts[i].indices)
  primitive.indices = accessor(
    parts.filter((_, i) => !selected.includes(i)).flatMap((part) => part.indices),
  )
  mesh.primitives.push({ ...primitive, indices: accessor(reservoirIndices), material: finish })
}
writeGlb(file, json, (id) => changed.get(id) ?? read(id), bin)
const bytes = fs.readFileSync(file)
const manifestPath = `${directory}/asset.json`
const manifest = JSON.parse(fs.readFileSync(manifestPath))
manifest.bytes = bytes.length
manifest.sha256 = createHash('sha256').update(bytes).digest('hex')
manifest.provenance.edits.push(
  '2026-10-11 brake/clutch reservoir finish: separate reservoirs and lids from shared metallic hardware/grey controls, using satin black painted material (metalness 0.05, roughness 0.75). Geometry and normals unchanged.',
)
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log('Reservoirs and lids: 440 triangles retain their geometry with satin black finish')
