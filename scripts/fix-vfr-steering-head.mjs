import { readGlb, writeGlb, components } from './lib/glb.mjs'
import fs from 'node:fs'
import { createHash } from 'node:crypto'

const path = 'assets/library/motorcycles/vfr800fi-1999/vfr800fi-1999.glb'
const { json, bin, read } = readGlb(path)
if (json.nodes.some((node) => node.name === 'Fixed_Steering_Head_Frame')) {
  console.log('Steering head frame already separated')
} else {
  const steering = json.nodes.find((node) => node.name === 'Steering_Pivot')
  const primitive = json.meshes[steering.mesh].primitives.find((p) =>
    json.materials[p.material].name.startsWith('Satin aluminium'),
  )
  const indices = read(primitive.indices).flat()
  const candidates = components(read(primitive.attributes.POSITION), indices)
  const frame = candidates.find(
    (c) => c.indices.length === 222 * 3 && c.min[1] < -0.2 && c.max[1] < -0.05 && c.max[2] > 0.14,
  )
  if (!frame) throw new Error('Expected fixed steering head component not found')
  const moved = new Set(frame.indices)
  const retained = []
  for (let i = 0; i < indices.length; i += 3)
    if (!(moved.has(indices[i]) && moved.has(indices[i + 1]) && moved.has(indices[i + 2])))
      retained.push(...indices.slice(i, i + 3))
  const data = new Map()
  const accessor = (values) => {
    const id = json.accessors.length
    json.accessors.push({ componentType: 5125, count: values.length, type: 'SCALAR' })
    data.set(
      id,
      values.map((value) => [value]),
    )
    return id
  }
  const fixed = { ...primitive, indices: accessor(frame.indices) }
  primitive.indices = accessor(retained)
  const mesh = json.meshes.length
  json.meshes.push({ name: 'Fixed steering head frame', primitives: [fixed] })
  const node = json.nodes.length
  json.nodes.push({
    name: 'Fixed_Steering_Head_Frame',
    mesh,
    translation: steering.translation,
    rotation: steering.rotation,
    scale: steering.scale,
  })
  const parent = json.nodes.find((n) => n.children?.includes(json.nodes.indexOf(steering)))
  if (!parent) throw new Error('Missing steering parent')
  parent.children.push(node)
  writeGlb(path, json, (id) => data.get(id) ?? read(id), bin)
  console.log('Separated 222 fixed frame triangles without changing the rest pose')
}
const manifestPath = 'assets/library/motorcycles/vfr800fi-1999/asset.json'
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const bytes = fs.readFileSync(path)
manifest.bytes = bytes.length
manifest.sha256 = createHash('sha256').update(bytes).digest('hex')
const note =
  '2026-10-11 steering correction: separate the 222-triangle fixed steering-head frame from Steering_Pivot, preserving geometry and the authored rest pose.'
if (!manifest.provenance.edits.includes(note)) manifest.provenance.edits.push(note)
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
