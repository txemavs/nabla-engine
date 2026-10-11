/** Thin black backing between the rear lamp and the overhanging tail lip. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { readGlb, writeGlb } from './lib/glb.mjs'
const dir = 'assets/library/motorcycles/vfr800fi-1999',
  file = `${dir}/vfr800fi-1999.glb`
const { json, bin, read } = readGlb(file),
  changed = new Map()
if (json.nodes.some((n) => n.name === 'Tail_Lamp_Bezel_Closure'))
  throw new Error('Bezel already closed')
const add = (type, v) => {
  const id = json.accessors.length
  json.accessors.push({ type, count: v.length })
  changed.set(id, v)
  return id
}
const pos = [],
  normal = [],
  ix = [],
  segments = 16
for (let i = 0; i <= segments; i++) {
  const u = (2 * i) / segments - 1,
    x = 0.155 * u
  pos.push(
    [x, 0.935 - 0.057 * u * u, 1.009 - 0.06 * u * u],
    [x, 0.902 - 0.019 * u * u, 1.021 - 0.09 * u * u],
  )
  normal.push([0, 0.1, 0.995], [0, 0.1, 0.995])
  if (i < segments) {
    const a = 2 * i
    ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
}
const body = json.nodes.find((n) => n.name === 'Fixed_Body'),
  parent = json.nodes.find((n) => n.children?.includes(json.nodes.indexOf(body))),
  mi = json.meshes.length
json.meshes.push({
  primitives: [
    {
      attributes: { POSITION: add('VEC3', pos), NORMAL: add('VEC3', normal) },
      indices: add(
        'SCALAR',
        ix.map((i) => [i]),
      ),
      material: json.materials.findIndex(
        (m) => m.name === 'Closed dark lamp housing and recessed exhaust outlet',
      ),
    },
  ],
})
parent.children.push(json.nodes.length)
json.nodes.push({
  name: 'Tail_Lamp_Bezel_Closure',
  mesh: mi,
  translation: body.translation.slice(),
})
writeGlb(file, json, (id) => changed.get(id) || read(id), bin)
const bytes = fs.readFileSync(file),
  mf = `${dir}/asset.json`,
  m = JSON.parse(fs.readFileSync(mf))
m.triangles += ix.length / 3
m.bytes = bytes.length
m.sha256 = createHash('sha256').update(bytes).digest('hex')
m.provenance.edits.push(
  '2026-10-10 tail lamp: 32-triangle curved black backing closes the gap below the overhanging tail lip.',
)
fs.writeFileSync(mf, JSON.stringify(m, null, 2) + '\n')
