/** Refine only the upper cockpit contour, and close the headlamp reflector's back faces. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { readGlb, writeGlb } from './lib/glb.mjs'
const dir = 'assets/library/motorcycles/vfr800fi-1999'
const file = `${dir}/vfr800fi-1999.glb`
const { json, bin, read } = readGlb(file)
const vehicle = json.nodes.find((n) => n.name === 'Interceptor').extras.nabla.vehicle
if (vehicle.cockpitContourRefined) throw new Error('Contour already refined')
const changed = new Map()
const add = (type, values) => {
  const id = json.accessors.length
  json.accessors.push({ type, count: values.length })
  changed.set(id, values)
  return id
}
const unit = (v) => {
  const l = Math.hypot(...v)
  return v.map((x) => x / (l || 1))
}
const dot = (a, b) => a.reduce((s, v, k) => s + v * b[k], 0)
const key = (v) => v.map((x) => Math.round(x * 1e6)).join(',')
let before = 0,
  after = 0
for (const name of ['Clocks', 'Plastic_Clocks']) {
  const node = json.nodes.find((n) => n.name === name)
  for (const p of json.meshes[node.mesh].primitives) {
    if (json.materials[p.material].name !== 'Fixed dark grey cockpit plastic') continue
    const attrs = Object.fromEntries(Object.entries(p.attributes).map(([k, id]) => [k, read(id)]))
    let ix = read(p.indices).flat()
    before += ix.length / 3
    for (let pass = 0; pass < 1; pass++) {
      const pos = attrs.POSITION,
        normals = attrs.NORMAL
      const edges = new Set(),
        edgeKey = (a, b) => [key(pos[a]), key(pos[b])].sort().join('|')
      for (let i = 0; i < ix.length; i += 3) {
        const t = ix.slice(i, i + 3)
        if (t.some((v) => pos[v][1] > 0.992 && Math.abs(pos[v][0]) < 0.145))
          for (let k = 0; k < 3; k++) edges.add(edgeKey(t[k], t[(k + 1) % 3]))
      }
      const smooth = new Map()
      pos.forEach((v, i) => {
        const k = key(v),
          n = smooth.get(k) || [0, 0, 0]
        smooth.set(
          k,
          n.map((x, j) => x + normals[i][j]),
        )
      })
      for (const [k, v] of smooth) smooth.set(k, unit(v))
      const midpoint = new Map(),
        spatial = new Map()
      const mid = (a, b) => {
        const id = [a, b].sort((a, b) => a - b).join(',')
        if (midpoint.has(id)) return midpoint.get(id)
        const ek = edgeKey(a, b),
          pa = pos[a],
          pb = pos[b]
        let pt = spatial.get(ek)
        if (!pt) {
          const na = smooth.get(key(pa)),
            nb = smooth.get(key(pb)),
            d = pb.map((v, k) => v - pa[k])
          pt = pa.map((v, k) => (v + pb[k]) / 2)
          if (dot(na, nb) > 0.75)
            pt = pt.map((v, k) => v + (dot(d, nb) * nb[k] - dot(d, na) * na[k]) / 8)
          spatial.set(ek, pt)
        }
        const idx = pos.length
        for (const [k, vs] of Object.entries(attrs))
          vs.push(
            k === 'POSITION'
              ? pt.slice()
              : k === 'NORMAL'
                ? unit(vs[a].map((v, j) => (v + vs[b][j]) / 2))
                : vs[a].map((v, j) => (v + vs[b][j]) / 2),
          )
        midpoint.set(id, idx)
        return idx
      }
      const out = []
      for (let i = 0; i < ix.length; i += 3) {
        let [a, b, c] = ix.slice(i, i + 3)
        let marks = [edges.has(edgeKey(a, b)), edges.has(edgeKey(b, c)), edges.has(edgeKey(c, a))]
        const count = marks.filter(Boolean).length
        if (!count) {
          out.push(a, b, c)
          continue
        }
        if (count === 3) {
          const ab = mid(a, b),
            bc = mid(b, c),
            ca = mid(c, a)
          out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca)
          continue
        }
        while (!(count === 1 ? marks[0] : marks[0] && marks[1])) {
          ;[a, b, c] = [b, c, a]
          marks = [marks[1], marks[2], marks[0]]
        }
        const ab = mid(a, b)
        if (count === 1) out.push(a, ab, c, ab, b, c)
        else {
          const bc = mid(b, c)
          out.push(a, ab, c, ab, bc, c, ab, b, bc)
        }
      }
      ix = out
    }
    p.indices = add(
      'SCALAR',
      ix.map((i) => [i]),
    )
    for (const [k, vs] of Object.entries(attrs))
      p.attributes[k] = add(json.accessors[p.attributes[k]].type, vs)
    after += ix.length / 3
  }
}
// The thin reflector bowls were culled from the front, exposing the fairing and fork.
json.materials.find((m) => m.name === 'Lamp internal reflector').doubleSided = true
vehicle.cockpitContourRefined = true
writeGlb(file, json, (id) => changed.get(id) || read(id), bin)
const bytes = fs.readFileSync(file),
  manifestFile = `${dir}/asset.json`,
  manifest = JSON.parse(fs.readFileSync(manifestFile))
manifest.triangles = json.meshes.reduce(
  (s, m) => s + m.primitives.reduce((n, p) => n + json.accessors[p.indices].count / 3, 0),
  0,
)
manifest.bytes = bytes.length
manifest.sha256 = createHash('sha256').update(bytes).digest('hex')
manifest.provenance.edits.push(
  '2026-10-10 upper cockpit contour: four triangles per selected original face with curved interpolation and stitched neighbours, leaving the lower cluster and all other geometry unchanged. Headlamp reflector bowls render on both sides to prevent seeing through to the fairing/fork.',
)
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
console.log({
  before,
  after,
  added: after - before,
  triangles: manifest.triangles,
  bytes: manifest.bytes,
})
