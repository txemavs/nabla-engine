/** Rebuild reservoir surface normals with hard edges; retain the original reflective materials. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { readGlb, writeGlb, components } from './lib/glb.mjs'

const directory = 'assets/library/motorcycles/vfr800fi-1999'
const file = `${directory}/vfr800fi-1999.glb`
const { json, bin, read } = readGlb(file)
const mesh = json.meshes[json.nodes.find((node) => node.name === 'Steering_Pivot').mesh]
const changed = new Map()
const accessor = (type, values) => {
  const id = json.accessors.length
  json.accessors.push({ type, count: values.length })
  changed.set(id, values)
  return id
}
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const subtract = (a, b) => a.map((v, i) => v - b[i])
const unit = (a) => {
  const length = Math.hypot(...a)
  return a.map((v) => (length > 1e-12 ? v / length : 0))
}
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0)
let repaired = 0,
  mismatched = 0
for (const [material, selected, expected] of [
  ['Black brake hardware and bar ends', [2, 3], [162, 160]],
  ['VFR grey levers and clip-on handlebars', [4, 5], [59, 59]],
]) {
  const primitive = mesh.primitives.find((p) => json.materials[p.material].name === material)
  const positions = read(primitive.attributes.POSITION)
  const oldNormals = read(primitive.attributes.NORMAL)
  const parts = components(positions, read(primitive.indices).flat())
  for (let i = 0; i < selected.length; i++)
    if (parts[selected[i]]?.indices.length / 3 !== expected[i])
      throw new Error('Unexpected reservoir topology')
  const indices = selected.flatMap((i) => parts[i].indices)
  const faces = []
  const adjacent = new Map()
  const key = (position) => position.map((v) => v.toFixed(6)).join(',')
  for (let i = 0; i < indices.length; i += 3) {
    const vertices = indices.slice(i, i + 3)
    const area = cross(
      subtract(positions[vertices[1]], positions[vertices[0]]),
      subtract(positions[vertices[2]], positions[vertices[0]]),
    )
    const normal = unit(area)
    const face = { vertices, area, normal }
    faces.push(face)
    for (const id of vertices) {
      const point = key(positions[id])
      const group = adjacent.get(point) ?? []
      group.push(face)
      adjacent.set(point, group)
    }
  }
  const normals = []
  for (const face of faces)
    for (const id of face.vertices) {
      const sum = [0, 0, 0]
      for (const neighbor of adjacent.get(key(positions[id]))) {
        // Flat faces share their true normal; rounded edges remain smooth up to a 35-degree crease.
        if (dot(face.normal, neighbor.normal) < Math.cos((35 * Math.PI) / 180)) continue
        neighbor.area.forEach((v, axis) => (sum[axis] += v))
      }
      const normal = unit(sum)
      if (dot(normal, oldNormals[id]) < 0.95) mismatched++
      normals.push(normal)
    }
  const attributes = Object.fromEntries(
    Object.entries(primitive.attributes).map(([name, id]) => {
      const values = read(id)
      return [
        name,
        accessor(
          json.accessors[id].type,
          name === 'NORMAL' ? normals : indices.map((i) => values[i]),
        ),
      ]
    }),
  )
  primitive.indices = accessor(
    'SCALAR',
    parts
      .filter((_, i) => !selected.includes(i))
      .flatMap((part) => part.indices)
      .map((i) => [i]),
  )
  mesh.primitives.push({
    ...primitive,
    attributes,
    indices: accessor(
      'SCALAR',
      indices.map((_, i) => [i]),
    ),
  })
  repaired += indices.length / 3
}
writeGlb(file, json, (id) => changed.get(id) ?? read(id), bin)
const bytes = fs.readFileSync(file)
const manifestPath = `${directory}/asset.json`
const manifest = JSON.parse(fs.readFileSync(manifestPath))
manifest.bytes = bytes.length
manifest.sha256 = createHash('sha256').update(bytes).digest('hex')
manifest.provenance.edits.push(
  '2026-10-11 reservoir surface repair: rebuild area-weighted normals with 35-degree hard creases on brake/clutch reservoirs and lids, preserving original reflective finishes, positions and 440 triangles.',
)
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log({ repairedTriangles: repaired, correctedNormals: mismatched })
