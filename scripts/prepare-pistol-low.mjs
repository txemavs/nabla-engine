/** Shared low-quality weapon; preserve materials, transforms, rig anchors and silhouette. */
import {
  ShapeUtils,
  Vector2,
  BufferGeometry,
  Float32BufferAttribute,
  Shape,
  ExtrudeGeometry,
} from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { MeshoptSimplifier as simplify } from 'meshoptimizer'
import { readGlb, writeGlb } from './lib/glb.mjs'
await simplify.ready
const dir = 'assets/library/weapons/hk-compact/'
const { json, bin, read } = readGlb(dir + 'hk-compact.glb')
const values = new Map(),
  stats = []
const add = (data, type) => {
  const id = json.accessors.length
  json.accessors.push({ type })
  values.set(id, data)
  return id
}
const processed = new Set()
for (const node of json.nodes) {
  if (node.mesh === undefined) continue
  const mesh = json.meshes[node.mesh]
  if (node.name === 'FrameShell')
    for (const p of mesh.primitives) {
      const material = json.materials[p.material]
      if (material.name === 'Grip fine matte polymer') delete material.normalTexture
    }
  if (/GripLogoBadge/.test(node.name)) {
    stats.push({
      name: node.name,
      before: mesh.primitives.reduce((s, p) => s + json.accessors[p.indices].count / 3, 0),
      after: 0,
    })
    delete node.mesh
    continue
  }
  if (processed.has(node.mesh)) continue
  processed.add(node.mesh)
  for (const p of mesh.primitives) {
    // The case is already only 80 triangles. Keep its closed ends intact.
    if (/CartridgeCase/.test(node.name)) {
      const count = json.accessors[p.indices].count / 3
      stats.push({ name: node.name, before: count, after: count })
      continue
    }
    const attrs = Object.fromEntries(Object.entries(p.attributes).map(([k, id]) => [k, read(id)]))
    const indices = Uint32Array.from(read(p.indices).flat())
    const ratio = /Sight|Control_lever|Slide_Release|Hammer|TriggerBlade/.test(node.name)
      ? 0.85
      : /MagazineBody/.test(node.name)
        ? 0.4
        : /Guard/.test(node.name)
          ? 0.65
          : 0.52
    const target = Math.min(
      indices.length,
      Math.max(24, Math.floor((indices.length * ratio) / 3) * 3),
    )
    const [reduced] = /Cartridge/.test(node.name)
      ? simplify.simplify(indices, Float32Array.from(attrs.POSITION.flat()), 3, target, 0.04, [
          'Permissive',
        ])
      : simplify.simplifyWithAttributes(
          indices,
          Float32Array.from(attrs.POSITION.flat()),
          3,
          Float32Array.from(attrs.NORMAL.flat()),
          3,
          [0.5, 0.5, 0.5],
          null,
          target,
          0.003,
          ['Permissive', 'LockBorder'],
        )
    const [remap, count] = simplify.compactMesh(reduced)
    for (const [key, data] of Object.entries(attrs)) {
      const compact = Array.from({ length: count }, () => [])
      for (let i = 0; i < remap.length; i++)
        if (remap[i] !== 0xffffffff) compact[remap[i]] = data[i]
      p.attributes[key] = add(compact, json.accessors[p.attributes[key]].type)
    }
    p.indices = add(
      Array.from(reduced, (n) => [n]),
      'SCALAR',
    )
    // Recompute shading on the final topology: old normals describe triangles
    // removed by decimation and leave folds across otherwise simple curves.
    if (/FrameShell|GuardGripCurvedJoin|TriggerGuardUndersideClosure|FrontGuide/.test(node.name)) {
      const geometry = new BufferGeometry()
      for (const [name, id] of Object.entries(p.attributes)) {
        const data = values.get(id)
        const attributeName = { POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv' }[name]
        if (attributeName)
          geometry.setAttribute(
            attributeName,
            new Float32BufferAttribute(data.flat(), data[0].length),
          )
      }
      geometry.setIndex(Array.from(reduced))
      // Smooth only interior vertices in curved patches. Open boundaries and
      // sharp creases remain fixed, including the magazine well and slide rail.
      const pos = geometry.getAttribute('position')
      const groups = new Map(),
        vertexGroup = []
      for (let i = 0; i < pos.count; i++) {
        const point = [pos.getX(i), pos.getY(i), pos.getZ(i)]
        const key = point.map((v) => Math.round(v * 1e6)).join(',')
        if (!groups.has(key))
          groups.set(key, { point, ids: [], neighbors: new Set(), normals: [], locked: false })
        const group = groups.get(key)
        group.ids.push(i)
        vertexGroup[i] = group
      }
      const edges = new Map()
      for (let i = 0; i < reduced.length; i += 3) {
        const tri = [0, 1, 2].map((j) => vertexGroup[reduced[i + j]])
        const [a, b, c] = tri.map((g) => g.point)
        const u = b.map((v, j) => v - a[j]),
          v = c.map((v, j) => v - a[j])
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        const len = Math.hypot(...n)
        if (len < 1e-12) continue
        for (const g of tri) g.normals.push(n.map((v) => v / len))
        for (let j = 0; j < 3; j++) {
          const a = tri[j],
            b = tri[(j + 1) % 3]
          a.neighbors.add(b)
          b.neighbors.add(a)
          const key = [a.ids[0], b.ids[0]].sort((a, b) => a - b).join(',')
          const e = edges.get(key)
          if (e) e.count++
          else edges.set(key, { a, b, count: 1 })
        }
      }
      for (const e of edges.values()) if (e.count !== 2) e.a.locked = e.b.locked = true
      for (const g of groups.values()) {
        if (
          g.normals.some((a) =>
            g.normals.some((b) => a.reduce((s, v, i) => s + v * b[i], 0) < 0.25),
          )
        )
          g.locked = true
      }
      for (let iteration = 0; iteration < (node.name === 'FrameShell' ? 0 : 12); iteration++) {
        const factor = iteration % 2 === 0 ? 0.45 : -0.47
        const moves = []
        for (const g of groups.values()) {
          if (g.locked || g.neighbors.size < 3) continue
          const mean = [0, 0, 0]
          for (const h of g.neighbors)
            for (let j = 0; j < 3; j++) mean[j] += h.point[j] / g.neighbors.size
          moves.push([g, g.point.map((v, j) => v + factor * (mean[j] - v))])
        }
        for (const [g, p] of moves) g.point = p
      }
      for (const g of groups.values()) for (const i of g.ids) pos.setXYZ(i, ...g.point)

      // The dust-cover underside is a simple plane, not a crumpled skin.
      if (node.name === 'FrameShell')
        for (let i = 0; i < pos.count; i++) {
          if (pos.getZ(i) < -0.085 && pos.getY(i) < 0.085) pos.setY(i, 0.0835)
          if (
            pos.getZ(i) > -0.057 &&
            pos.getZ(i) < -0.027 &&
            pos.getY(i) > 0.055 &&
            pos.getY(i) < 0.061
          )
            pos.setY(i, 0.0575)
        }
      const normals = geometry.getAttribute('normal')
      for (let pass = 0; pass < 3; pass++) {
        const next = []
        for (let i = 0; i < pos.count; i++) {
          const n = [normals.getX(i), normals.getY(i), normals.getZ(i)]
          const sum = n.map((v) => v * 3)
          for (const g of [vertexGroup[i], ...vertexGroup[i].neighbors]) {
            const candidates = g.ids
              .map((j) => [normals.getX(j), normals.getY(j), normals.getZ(j)])
              .filter((m) => m.reduce((s, v, k) => s + v * n[k], 0) > 0.7)
            if (!candidates.length) continue
            for (const m of candidates)
              for (let k = 0; k < 3; k++) sum[k] += m[k] / candidates.length
          }
          const len = Math.hypot(...sum)
          next.push(sum.map((v) => v / len))
        }
        next.forEach((n, i) => normals.setXYZ(i, ...n))
      }
      if (json.materials[p.material].name === 'Grip fine matte polymer') {
        // Keep the inset above its backing surface rather than letting separate
        // decimated material patches intersect and flicker.
        for (let i = 0; i < pos.count; i++)
          pos.setXYZ(
            i,
            pos.getX(i) + normals.getX(i) * 0.0006,
            pos.getY(i) + normals.getY(i) * 0.0006,
            pos.getZ(i) + normals.getZ(i) * 0.0006,
          )
      }
      const smooth = mergeVertices(geometry, 1e-6)
      for (const [name, attributeName] of Object.entries({
        POSITION: 'position',
        NORMAL: 'normal',
        TEXCOORD_0: 'uv',
      })) {
        const a = smooth.getAttribute(attributeName)
        if (!a) continue
        p.attributes[name] = add(
          Array.from({ length: a.count }, (_, i) =>
            Array.from(a.array.slice(i * a.itemSize, (i + 1) * a.itemSize)),
          ),
          json.accessors[p.attributes[name]].type,
        )
      }
      p.indices = add(
        Array.from(smooth.index.array, (i) => [i]),
        'SCALAR',
      )
      geometry.dispose()
      smooth.dispose()
    }
    stats.push({ name: node.name, before: indices.length / 3, after: reduced.length / 3 })
  }
}
// Close the rear of the trigger opening with a solid tapered polymer web.
// This belongs to the fixed frame, never the animated trigger or magazine.
const web = new Shape()
web.moveTo(-0.0125, 0.055)
web.lineTo(-0.019, 0.055)
web.quadraticCurveTo(-0.023, 0.065, -0.028, 0.0835)
web.lineTo(-0.021, 0.084)
web.quadraticCurveTo(-0.017, 0.066, -0.0125, 0.055)
const webGeometry = new ExtrudeGeometry(web, {
  depth: 0.028,
  bevelEnabled: false,
  curveSegments: 8,
  steps: 1,
})
const wp = webGeometry.getAttribute('position'),
  wn = webGeometry.getAttribute('normal')
// Shape coordinates are z/y; extrusion is the frame width x.
const webPositions = [],
  webNormals = []
for (let i = 0; i < wp.count; i++) {
  webPositions.push([wp.getZ(i) - 0.014, wp.getY(i), wp.getX(i)])
  webNormals.push([wn.getZ(i), wn.getY(i), wn.getX(i)])
}
const webIndices = []
for (let i = 0; i < wp.count; i += 3) webIndices.push([i], [i + 2], [i + 1])
const webMesh =
  json.meshes.push({
    primitives: [
      {
        attributes: { POSITION: add(webPositions, 'VEC3'), NORMAL: add(webNormals, 'VEC3') },
        indices: add(webIndices, 'SCALAR'),
        material: json.materials.findIndex((m) => m.name === 'Black polymer.001'),
      },
    ],
  }) - 1
const frameNode = json.nodes.find((n) => n.name === 'FrameShell')
frameNode.children ??= []
frameNode.children.push(json.nodes.length)
json.nodes.push({ name: 'TriggerRearSolidWeb', mesh: webMesh })
webGeometry.dispose()
stats.push({ name: 'TriggerRearSolidWeb', before: 0, after: webIndices.length / 3 })

// The authored magazine is sheet metal, with no inner wall geometry. Render its
// interior too; actual holes in the floorplate are repaired with geometry below.
const magazineNode = json.nodes.find((n) => n.name === 'MagazineBody')
const magazineMesh = json.meshes[magazineNode.mesh]
for (const primitive of magazineMesh.primitives) {
  const material = structuredClone(json.materials[primitive.material])
  material.name += ' · magazine interior'
  material.doubleSided = true
  primitive.material = json.materials.push(material) - 1
}
const get = (id) => values.get(id) ?? read(id)
const caps = []
for (const primitive of magazineMesh.primitives) {
  const positions = get(primitive.attributes.POSITION)
  const indices = get(primitive.indices).flat()
  const key = (i) => positions[i].map((v) => Math.round(v * 1e6)).join(',')
  const edges = new Map()
  for (let i = 0; i < indices.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      const a = indices[i + j],
        b = indices[i + ((j + 1) % 3)]
      const id = [key(a), key(b)].sort().join('|')
      const edge = edges.get(id)
      if (edge) edge.count++
      else edges.set(id, { a, b, count: 1 })
    }
  }
  const boundary = [...edges.values()].filter(
    (e) => e.count === 1 && positions[e.a][1] < 0.02 && positions[e.b][1] < 0.02,
  )
  while (boundary.length) {
    let edge = boundary.pop()
    const loop = [edge.a, edge.b]
    while (key(loop.at(-1)) !== key(loop[0])) {
      const index = boundary.findIndex(
        (e) => key(e.a) === key(loop.at(-1)) || key(e.b) === key(loop.at(-1)),
      )
      if (index < 0) break
      edge = boundary.splice(index, 1)[0]
      loop.push(key(edge.a) === key(loop.at(-1)) ? edge.b : edge.a)
    }
    if (key(loop.at(-1)) !== key(loop[0]) || loop.length < 4) continue
    loop.pop()
    loop.reverse() // Opposite winding to the surrounding boundary.
    const points = loop.map((i) => positions[i])
    const normal = [0, 0, 0]
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length]
      normal[0] += (a[1] - b[1]) * (a[2] + b[2])
      normal[1] += (a[2] - b[2]) * (a[0] + b[0])
      normal[2] += (a[0] - b[0]) * (a[1] + b[1])
    }
    const length = Math.hypot(...normal)
    if (length < 1e-12) continue
    const n = normal.map((v) => v / length)
    const omit = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)))
    const axes = [0, 1, 2].filter((i) => i !== omit)
    const faces = ShapeUtils.triangulateShape(
      points.map((p) => new Vector2(p[axes[0]], p[axes[1]])),
      [],
    )
    // Earcut can choose a different winding after projection: orient each cap to n.
    for (const face of faces) {
      const [a, b, c] = face.map((i) => points[i])
      const u = b.map((v, i) => v - a[i]),
        v = c.map((v, i) => v - a[i])
      const cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ]
      if (cross.reduce((s, v, i) => s + v * n[i], 0) < 0) face.reverse()
    }
    caps.push({
      attributes: {
        POSITION: add(points, 'VEC3'),
        NORMAL: add(
          points.map(() => n),
          'VEC3',
        ),
      },
      indices: add(
        faces.flat().map((i) => [i]),
        'SCALAR',
      ),
      material: primitive.material,
    })
    stats.push({ name: 'MagazineFloorplateClosure', before: 0, after: faces.length })
  }
}
magazineMesh.primitives.push(...caps)
if (!caps.length) throw new Error('Expected magazine floorplate openings were not repaired')

function output(file, root) {
  const doc = structuredClone(json)
  const ids = new Set()
  const visit = (id) => {
    if (ids.has(id)) return
    ids.add(id)
    for (const c of doc.nodes[id].children ?? []) visit(c)
  }
  for (const id of root === undefined ? doc.scenes[doc.scene ?? 0].nodes : [root]) visit(id)
  const oldNodes = [...ids],
    map = new Map(oldNodes.map((id, i) => [id, i]))
  doc.nodes = oldNodes.map((id) => doc.nodes[id])
  const meshes = []
  const meshMap = new Map()
  for (const node of doc.nodes) {
    if (node.children) node.children = node.children.map((i) => map.get(i))
    if (node.mesh !== undefined) {
      if (!meshMap.has(node.mesh)) {
        meshMap.set(node.mesh, meshes.length)
        meshes.push(doc.meshes[node.mesh])
      }
      node.mesh = meshMap.get(node.mesh)
    }
  }
  doc.meshes = meshes
  doc.scenes = [
    {
      nodes: (root === undefined ? json.scenes[json.scene ?? 0].nodes : [root]).map((id) =>
        map.get(id),
      ),
    },
  ]
  doc.scene = 0
  if (root !== undefined) {
    delete doc.nodes[0].matrix
    doc.nodes[0].translation = [0, 0, 0]
    doc.nodes[0].rotation = [0, 0, 0, 1]
  }
  writeGlb(dir + file, doc, (id) => values.get(id) ?? read(id), bin)
}
// Shared cartridge meshes must be processed once, and never exported empty.
for (const name of [
  'VisibleCartridgeCase',
  'VisibleCartridgeTip',
  'MagazineVisibleCartridgeCase',
  'MagazineVisibleCartridgeTip',
]) {
  const node = json.nodes.find((node) => node.name === name)
  if (node?.mesh === undefined) throw new Error(`Missing cartridge mesh: ${name}`)
  for (const primitive of json.meshes[node.mesh].primitives) {
    const indices = values.get(primitive.indices) ?? read(primitive.indices)
    const positions =
      values.get(primitive.attributes.POSITION) ?? read(primitive.attributes.POSITION)
    if (
      !indices.length ||
      !positions.length ||
      indices.some(([index]) => index >= positions.length)
    )
      throw new Error(`Invalid cartridge geometry: ${name}`)
    // Weld positional seams before checking: normal/UV seams are not physical holes.
    const edgeCounts = new Map()
    const key = (index) => positions[index].map((v) => Math.round(v * 1e7)).join(',')
    for (let i = 0; i < indices.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        const a = key(indices[i + j][0]),
          b = key(indices[i + ((j + 1) % 3)][0])
        const edge = [a, b].sort().join('|')
        edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1)
      }
    }
    if ([...edgeCounts.values()].some((count) => count !== 2))
      throw new Error(`Open or non-manifold cartridge: ${name}`)
  }
}
output('hk-compact-low.glb')
for (const [name, file] of [
  ['Magazine', 'hk-compact-magazine-low.glb'],
  ['ChamberRound', 'hk-compact-cartridge-low.glb'],
]) {
  const id = json.nodes.findIndex((n) => n.name === name)
  if (id < 0) throw new Error(name)
  output(file, id)
}
console.log(
  JSON.stringify(
    {
      before: stats.reduce((s, m) => s + m.before, 0),
      after: stats.reduce((s, m) => s + m.after, 0),
      parts: stats,
    },
    null,
    2,
  ),
)
