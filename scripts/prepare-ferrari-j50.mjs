/** Prepare the attributed source without modifying it. Geometry is baked to metres, Y-up, -Z forward. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Matrix4, Matrix3, Vector3, Quaternion, BoxGeometry } from 'three'
import { MeshoptSimplifier } from 'meshoptimizer'
import { readGlb, writeGlb } from './lib/glb.mjs'

const source = process.argv[2]
if (!source) throw Error('Usage: node scripts/prepare-ferrari-j50.mjs SOURCE.glb')
await MeshoptSimplifier.ready
const output = 'assets/library/cars/ferrari-j50'
fs.mkdirSync(output, { recursive: true })
const { json: original, read: sourceRead, bin } = readGlb(source)
const meshes = []
function visit(id, parent) {
  const node = original.nodes[id]
  const local = node.matrix
    ? new Matrix4().fromArray(node.matrix)
    : new Matrix4().compose(
        new Vector3(...(node.translation ?? [0, 0, 0])),
        new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
        new Vector3(...(node.scale ?? [1, 1, 1])),
      )
  const world = parent.clone().multiply(local)
  if (node.mesh !== undefined)
    for (const primitive of original.meshes[node.mesh].primitives) {
      if (primitive.mode !== undefined && primitive.mode !== 4)
        throw Error('Non-triangle primitive')
      const positions = sourceRead(primitive.attributes.POSITION).map((v) =>
        new Vector3(...v).applyMatrix4(world).toArray(),
      )
      const min = [0, 1, 2].map((k) => Math.min(...positions.map((v) => v[k])))
      const max = [0, 1, 2].map((k) => Math.max(...positions.map((v) => v[k])))
      meshes.push({ node: id, name: node.name, primitive, positions, world, min, max })
    }
  for (const child of node.children ?? []) visit(child, world)
}
for (const root of original.scenes[original.scene ?? 0].nodes) visit(root, new Matrix4())
const minimum = [0, 1, 2].map((k) => Math.min(...meshes.map((m) => m.min[k])))
const maximum = [0, 1, 2].map((k) => Math.max(...meshes.map((m) => m.max[k])))
// Model-based size target, not a claim of measured manufacturer dimensions.
const scale = 4.7 / (maximum[2] - minimum[2])
const centre = [(minimum[0] + maximum[0]) / 2, minimum[1], (minimum[2] + maximum[2]) / 2]
const chassisHeight = 0.55
const normalize = (v) => [
  -(v[0] - centre[0]) * scale,
  (v[1] - centre[1]) * scale - chassisHeight,
  -(v[2] - centre[2]) * scale,
]
const tires = meshes.filter((m) => original.materials[m.primitive.material].name.endsWith('_Tires'))
if (tires.length !== 4) throw Error('Expected four original tires')
const wheelRoles = ['fl', 'fr', 'rl', 'rr']
const wheelCentres = Object.fromEntries(
  tires.map((m) => {
    const c = normalize(m.min.map((v, k) => (v + m.max[k]) / 2))
    return [(c[2] < 0 ? 'f' : 'r') + (c[0] < 0 ? 'l' : 'r'), c]
  }),
)
const steeringCentre = normalize([0.679, 0.35, -0.865])
const groups = new Map()
const records = []
let before = 0,
  after = 0,
  removed = 0
for (const mesh of meshes) {
  const p = mesh.primitive
  const material = original.materials[p.material]
  const name = material.name
  let indices =
    p.indices === undefined ? mesh.positions.map((_, i) => i) : sourceRead(p.indices).flat()
  const count = indices.length / 3
  before += count
  if (/_(EngineBase|EngineValve|EngineBay)$/.test(name)) {
    removed += count
    records.push({
      sourceNode: mesh.node,
      source: mesh.name,
      removed: 'hidden engine detail',
      triangles: count,
    })
    continue
  }
  const position = mesh.positions.map(normalize)
  const matrix = new Matrix3().getNormalMatrix(mesh.world)
  const normal =
    p.attributes.NORMAL === undefined
      ? position.map(() => [0, 1, 0])
      : sourceRead(p.attributes.NORMAL).map((v) => {
          const n = new Vector3(...v).applyMatrix3(matrix).normalize()
          return [-n.x, n.y, -n.z]
        })
  const uv = p.attributes.TEXCOORD_0 === undefined ? undefined : sourceRead(p.attributes.TEXCOORD_0)
  if (mesh.world.determinant() < 0)
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]]
  const mid = normalize(mesh.min.map((v, k) => (v + mesh.max[k]) / 2))
  const wheel = /_(Tires|Rims|RimBadges|Lugnuts|BrakeRotors\w*)$/.test(name)
  const steering = /^Mesh(3|4|5|23|36)_/.test(mesh.name)
  const role = wheel
    ? `wheel.${(mid[2] < 0 ? 'f' : 'r') + (mid[0] < 0 ? 'l' : 'r')}`
    : steering
      ? 'steering'
      : 'body'
  const section = /BIanco_Avus/.test(name)
    ? 'Bodywork'
    : /Windows|Glass/.test(name)
      ? 'Glass'
      : /Interior|CarbonFiber|phong|Tela/.test(name)
        ? 'Interior'
        : /Engine|Exhaust/.test(name)
          ? 'EngineCoverAndExhaust'
          : /Lights|DRLs/.test(name)
            ? 'Lights'
            : /Caliper|Brake/.test(name)
              ? 'FixedBrakes'
              : /Mirrors/.test(name)
                ? 'Mirrors'
                : 'ChassisAndTrim'
  const optical = /_Windows$|Glass|Mirrors|Lights|DRLs|Badges/.test(name)
  const bodywork = /BIanco_Avus/.test(name)
  const ratio = bodywork ? 0.4 : optical ? 0.5 : wheel ? 0.2 : 0.15
  const error = bodywork || optical ? 0.002 : wheel ? 0.003 : 0.006
  // Weld identical position/normal/UV tuples before simplifying, preserving attribute seams.
  const unique = new Map(),
    remap = [],
    positions = [],
    normals = [],
    uvs = []
  for (let i = 0; i < position.length; i++) {
    const key = [...position[i], ...normal[i], ...(uv?.[i] ?? [])]
      .map((v) => v.toFixed(7))
      .join(',')
    let next = unique.get(key)
    if (next === undefined) {
      next = positions.length
      unique.set(key, next)
      positions.push(position[i])
      normals.push(normal[i])
      if (uv) uvs.push(uv[i])
    }
    remap.push(next)
  }
  indices = indices.map((i) => remap[i])
  const seen = new Set()
  indices = indices.flatMap((_, i) => {
    if (i % 3) return []
    const tri = indices.slice(i, i + 3)
    if (new Set(tri).size < 3) return []
    const key = [...tri].sort((a, b) => a - b).join(',')
    if (seen.has(key)) return []
    seen.add(key)
    return tri
  })
  if (indices.length > 300) {
    const attributes = Float32Array.from(normals.flatMap((n, i) => [...n, ...(uv ? uvs[i] : [])]))
    const simplified = MeshoptSimplifier.simplifyWithAttributes(
      Uint32Array.from(indices),
      Float32Array.from(positions.flat()),
      3,
      attributes,
      uv ? 5 : 3,
      uv ? [0.001, 0.001, 0.001, 0.002, 0.002] : [0.001, 0.001, 0.001],
      null,
      Math.max(30, Math.floor((indices.length * ratio) / 3) * 3),
      error,
      ['ErrorAbsolute', 'Permissive'],
    )
    indices = Array.from(simplified[0])
  }
  after += indices.length / 3
  const pivot = role.startsWith('wheel.')
    ? wheelCentres[role.slice(6)]
    : role === 'steering'
      ? steeringCentre
      : [0, 0, 0]
  const key = `${role}|${section}|${p.material}|${Boolean(uv)}`
  if (!groups.has(key))
    groups.set(key, {
      role,
      section,
      material: p.material,
      positions: [],
      normals: [],
      uvs: uv ? [] : undefined,
      indices: [],
    })
  const group = groups.get(key)
  const used = [...new Set(indices)],
    compact = new Map(used.map((v, i) => [v, i + group.positions.length]))
  group.positions.push(...used.map((i) => positions[i].map((v, k) => v - pivot[k])))
  group.normals.push(...used.map((i) => normals[i]))
  if (uv) group.uvs.push(...used.map((i) => uvs[i]))
  group.indices.push(...indices.map((i) => compact.get(i)))
  records.push({
    sourceNode: mesh.node,
    source: mesh.name,
    role,
    section,
    before: count,
    after: indices.length / 3,
  })
}
// Replace the hidden engine assembly by a cheap opaque closure below the rear glazing.
const linerMaterial = original.materials.length
original.materials.push({
  name: 'J50 engine bay closure',
  pbrMetallicRoughness: {
    baseColorFactor: [0.018, 0.02, 0.022, 1],
    metallicFactor: 0,
    roughnessFactor: 0.9,
  },
})
const liner = new BoxGeometry(1.15, 0.02, 1.4)
liner.translate(0, 0.05, 1.25)
const attributeRows = (key) =>
  Array.from({ length: liner.attributes[key].count }, (_, i) => [
    liner.attributes[key].getX(i),
    liner.attributes[key].getY(i),
    liner.attributes[key].getZ(i),
  ])
groups.set('engine-closure', {
  role: 'body',
  section: 'EngineBayClosure',
  material: linerMaterial,
  positions: attributeRows('position'),
  normals: attributeRows('normal'),
  indices: Array.from(liner.index.array),
})
after += liner.index.count / 3
function writePart(role, filename) {
  const json = structuredClone(original)
  delete json.animations
  delete json.skins
  json.asset.generator = 'Nabla prepare-ferrari-j50.mjs'
  json.nodes = [{ name: role === 'body' ? 'FerrariJ50' : role, children: [] }]
  json.scenes = [{ nodes: [0] }]
  json.scene = 0
  json.meshes = []
  json.accessors = []
  const values = new Map()
  const add = (data, type) => {
    const i = json.accessors.length
    json.accessors.push({ type })
    values.set(i, data)
    return i
  }
  const sectionNodes = new Map()
  for (const group of groups.values())
    if (group.role === role) {
      if (!sectionNodes.has(group.section)) {
        const id = json.nodes.length
        json.nodes.push({ name: group.section, children: [] })
        json.nodes[0].children.push(id)
        sectionNodes.set(group.section, id)
      }
      const attributes = {
        POSITION: add(group.positions, 'VEC3'),
        NORMAL: add(group.normals, 'VEC3'),
      }
      if (group.uvs) attributes.TEXCOORD_0 = add(group.uvs, 'VEC2')
      const index = json.meshes.length
      json.meshes.push({
        name: `${group.section}_${json.materials[group.material].name}`,
        primitives: [
          {
            attributes,
            indices: add(
              group.indices.map((i) => [i]),
              'SCALAR',
            ),
            material: group.material,
          },
        ],
      })
      json.nodes[sectionNodes.get(group.section)].children.push(json.nodes.length)
      json.nodes.push({ name: json.meshes[index].name, mesh: index })
    }
  if (role === 'body') {
    const anchor = (name, position) => {
      json.nodes[0].children.push(json.nodes.length)
      json.nodes.push({ name, translation: position, extras: { nabla: { anchor: name } } })
    }
    for (const wheel of wheelRoles) anchor(`wheel.${wheel}`, wheelCentres[wheel])
    anchor('steering', steeringCentre)
    anchor('driver.seat', normalize([0.679, 0.27, -1.08]))
    anchor('driver.eyes', normalize([0.679, 0.57, -1.03]))
  }
  // Keep only materials/textures/images used by this part, deduplicating identical embedded images.
  const materials = new Map(),
    textures = new Map(),
    images = new Map(),
    imageHashes = new Map()
  const keepImage = (i) => {
    if (images.has(i)) return images.get(i)
    const image = original.images[i],
      view = original.bufferViews[image.bufferView]
    const hash = createHash('sha256')
      .update(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength))
      .digest('hex')
    const next = imageHashes.get(hash) ?? imageHashes.size
    imageHashes.set(hash, next)
    images.set(i, next)
    return next
  }
  const keepTexture = (i) => {
    if (!textures.has(i)) {
      const texture = structuredClone(original.textures[i])
      texture.source = keepImage(texture.source)
      textures.set(i, { index: textures.size, texture })
    }
    return textures.get(i).index
  }
  const scan = (object) => {
    for (const [key, value] of Object.entries(object))
      if (value && typeof value === 'object') {
        if (/Texture$/.test(key) && value.index !== undefined)
          value.index = keepTexture(value.index)
        else scan(value)
      }
  }
  for (const mesh of json.meshes)
    for (const p of mesh.primitives) {
      const old = p.material
      if (!materials.has(old)) {
        const material = structuredClone(original.materials[old])
        scan(material)
        if (/BIanco_Avus/.test(material.name)) {
          material.pbrMetallicRoughness.roughnessFactor = 0.22
          material.doubleSided = false
        }
        materials.set(old, { index: materials.size, material })
      }
      p.material = materials.get(old).index
    }
  json.materials = [...materials.values()].map((m) => m.material)
  json.textures = [...textures.values()].map((t) => t.texture)
  json.images = Array(imageHashes.size)
  for (const [old, next] of images) json.images[next] ??= structuredClone(original.images[old])
  writeGlb(path.join(output, filename), json, (i) => values.get(i), bin)
  return {
    file: filename,
    bytes: fs.statSync(path.join(output, filename)).size,
    triangles: [...groups.values()]
      .filter((g) => g.role === role)
      .reduce((sum, g) => sum + g.indices.length / 3, 0),
    meshes: json.meshes.length,
  }
}
const files = [
  writePart('body', 'j50.body.glb'),
  ...wheelRoles.map((role) => writePart(`wheel.${role}`, `j50.wheel-${role}.glb`)),
  writePart('steering', 'j50.steering.glb'),
]
const report = {
  source: path.basename(source),
  sourceSha256: createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
  sourceBytes: fs.statSync(source).size,
  attribution: original.asset.extras,
  scale,
  normalizedSize: [(maximum[0] - minimum[0]) * scale, (maximum[1] - minimum[1]) * scale, 4.7],
  chassisHeight,
  wheelCentres,
  beforeTriangles: before,
  afterTriangles: after,
  removedHiddenEngineTriangles: removed,
  files,
  records,
}
fs.writeFileSync(path.join(output, 'asset.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ before, after, removed, files }, null, 2))
