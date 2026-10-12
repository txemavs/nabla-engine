/** Close the existing rear-lamp housing and put a recessed dark end inside the exhaust outlet. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { readGlb, writeGlb, components } from './lib/glb.mjs'
const dir = 'assets/library/motorcycles/vfr800fi-1999',
  file = `${dir}/vfr800fi-1999.glb`
const { json, bin, read } = readGlb(file),
  changed = new Map()
if (json.nodes.some((n) => n.name === 'Exhaust_Outlet_Closure'))
  throw new Error('Rear closure already applied')
const add = (type, values) => {
  const id = json.accessors.length
  json.accessors.push({ type, count: values.length })
  changed.set(id, values)
  return id
}
const black = json.materials.length
json.materials.push({
  name: 'Closed dark lamp housing and recessed exhaust outlet',
  doubleSided: true,
  pbrMetallicRoughness: {
    baseColorFactor: [0.008, 0.009, 0.01, 1],
    metallicFactor: 0,
    roughnessFactor: 0.9,
  },
})
const body = json.nodes.find((n) => n.name === 'Fixed_Body'),
  mesh = json.meshes[body.mesh]
// Small leftover red lens fragments sit above the actual lamp aperture, across the tail seam.
const red = mesh.primitives.find(
  (p) => json.materials[p.material].name === 'Tail and brake red lens',
)
const parts = components(read(red.attributes.POSITION), read(red.indices).flat())
const stray = parts.filter((c) => c.indices.length / 3 <= 4 && c.min[1] > 0.9)
if (stray.length) {
  red.indices = add(
    'SCALAR',
    parts
      .filter((c) => !stray.includes(c))
      .flatMap((c) => c.indices)
      .map((i) => [i]),
  )
  mesh.primitives.push({
    ...red,
    material: black,
    indices: add(
      'SCALAR',
      stray.flatMap((c) => c.indices).map((i) => [i]),
    ),
  })
}
const housing = json.materials.find((m) => m.name === 'Tail Reflector')
housing.doubleSided = true
housing.pbrMetallicRoughness = {
  baseColorFactor: [0.008, 0.009, 0.01, 1],
  metallicFactor: 0,
  roughnessFactor: 0.85,
}
// Existing outlet axis and 26 mm outer tube radius: keep the rim, cap only its inner opening.
const normal = [0, 0.559, 0.829],
  tangent = [0, 0.829, -0.559],
  center = [0.1599454, 0.608, 0.989]
const positions = [center],
  normals = [normal],
  indices = []
const segments = 24,
  radius = 0.023
for (let i = 0; i < segments; i++) {
  const a = (i * 2 * Math.PI) / segments
  positions.push(
    center.map((v, k) => v + radius * (Math.cos(a) * (k === 0 ? 1 : 0) + Math.sin(a) * tangent[k])),
  )
  normals.push(normal)
  indices.push(0, i + 1, ((i + 1) % segments) + 1)
}
const capMesh = json.meshes.length
json.meshes.push({
  primitives: [
    {
      attributes: { POSITION: add('VEC3', positions), NORMAL: add('VEC3', normals) },
      indices: add(
        'SCALAR',
        indices.map((i) => [i]),
      ),
      material: black,
    },
  ],
})
const node = json.nodes.length
json.nodes.push({
  name: 'Exhaust_Outlet_Closure',
  mesh: capMesh,
  translation: body.translation.slice(),
})
const parent = json.nodes.find((n) => n.children?.includes(json.nodes.indexOf(body)))
parent.children.push(node)
writeGlb(file, json, (id) => changed.get(id) || read(id), bin)
const bytes = fs.readFileSync(file),
  manifestFile = `${dir}/asset.json`,
  manifest = JSON.parse(fs.readFileSync(manifestFile))
manifest.triangles += segments
manifest.bytes = bytes.length
manifest.sha256 = createHash('sha256').update(bytes).digest('hex')
manifest.provenance.edits.push(
  '2026-10-10 rear closure: dark two-sided rear lamp housing, misplaced small red lens fragments reassigned to the housing, and a recessed 24-triangle black exhaust outlet cap to prevent seeing the world through the silencer.',
)
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
console.log({
  triangles: manifest.triangles,
  bytes: manifest.bytes,
  strayTriangles: stray.reduce((s, c) => s + c.indices.length / 3, 0),
})
