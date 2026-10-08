/**
 * Reproducible cockpit pass over the VFR800FI 99 GLB (run once; it refuses an already prepared
 * file):
 *
 *   node scripts/prepare-vfr800-cockpit.mjs [in.glb] [out.glb]
 *
 * - Splits the two fairing-mounted rear-view mirrors (housing, stalk and glass, already modelled
 *   but merged into `Body`) into their own nodes `mirror_L` / `mirror_R`, children of `Body`
 *   (they do not turn with the bars). Rider's left is −X (the model faces −Z).
 * - Removes the static needles and hubs and the speedometer tick marks: the live instruments
 *   (`src/render/vehicle-presentation/motorcycle-instruments.ts`) draw dials and needles.
 * - Adds instrument anchors (underscored: three.js strips dots from node names) under `Body`: `gauge_speedo`, `gauge_tacho`, `gauge_lcd`,
 *   `lamp_signal_l`, `lamp_signal_r` and `lamp_warning_1`…`4` (left to right). Each anchor sits
 *   on its opening with local +Z along the face normal (towards the rider) and local +Y up the
 *   face; `extras.nabla` carries the size in metres.
 *
 * Selection boxes and sizes come from measuring the authored mesh (see docs/motorcycles.md).
 * - Windscreen: alpha-blended neutral smoke grey («gris humo», was a bluish transmission tint),
 *   see-through, with a slight reflection (`extras.nabla.envIntensity`).
 * - Metal map (Txema's review): a new neutral mirror chrome (`Mirror chrome stanchions and
 *   silencer`, base 0.95 grey, metallic 1, roughness 0.03, slightly stronger reflections) only on
 *   the fork stanchions, the silencer can and its end cap. The exhaust headers and the engine
 *   (the graphite engine cases behind the radiator) take the satin grey metal of the top triple
 *   clamp (`Satin aluminium chassis…`, also the frame and fork lowers). Everything else keeps the
 *   authored material: discs and brake tracks, chain and sprockets, radiator, swingarm, mirrors.
 *   The script prints the node → material table.
 *
 * The renderer gives metallic materials (and the windscreen, tagged `extras.nabla.reflective`) a
 * neutral grey reflection environment.
 */
import fs from 'node:fs'
import { readGlb, writeGlb, components } from './lib/glb.mjs'

const input = process.argv[2] ?? 'assets/library/motorcycles/vfr800fi-1999/vfr800fi-1999.glb'
const output = process.argv[3] ?? input
const { json, bin, read } = readGlb(input)
if (json.nodes.some((n) => n.name === 'mirror_L')) {
  console.error(`${input} is already prepared (mirror_L exists)`)
  process.exit(1)
}

const bodyNode = json.nodes.findIndex((n) => n.name === 'Body')
const body = json.meshes[json.nodes[bodyNode].mesh]
const materialIndex = (name) => {
  const i = json.materials.findIndex((m) => m.name.startsWith(name))
  if (i < 0) throw new Error(`material ${name} not found`)
  return i
}
const FAIRING = materialIndex('Gloss black fairing')
const REFLECTOR = materialIndex('Reflector')
const PANEL = materialIndex('Matte black instrument panel')
const ALUMINIUM = materialIndex('Satin aluminium chassis')

// Virtual accessors appended after the existing ones; writeGlb re-encodes everything.
const extra = new Map()
const addAccessor = (type, values) => {
  const id = json.accessors.length
  json.accessors.push({ type, count: values.length })
  extra.set(id, values)
  return id
}
const readAny = (id) => extra.get(id) ?? read(id)

const inBox = (c, box) =>
  c.min[0] >= box.min[0] &&
  c.max[0] <= box.max[0] &&
  c.min[1] >= box.min[1] &&
  c.max[1] <= box.max[1] &&
  c.min[2] >= box.min[2] &&
  c.max[2] <= box.max[2]

/** Remove the components of `material` matching `select` from Body; returns their triangles. */
function take(material, select) {
  const primitive = body.primitives.find((p) => p.material === material)
  const positions = readAny(primitive.attributes.POSITION)
  const indices = readAny(primitive.indices).flat()
  const keep = [],
    taken = []
  for (const c of components(positions, indices)) (select(c) ? taken : keep).push(c)
  primitive.indices = addAccessor(
    'SCALAR',
    keep.flatMap((c) => c.indices).map((i) => [i]),
  )
  return { primitive, positions, normals: readAny(primitive.attributes.NORMAL), taken }
}

/** Mesh primitive from selected components, re-indexed, positions relative to `origin`. */
function primitiveFrom({ positions, normals }, comps, material, origin) {
  const map = new Map(),
    pos = [],
    nrm = [],
    idx = []
  for (const c of comps)
    for (const i of c.indices) {
      if (!map.has(i)) {
        map.set(i, pos.length)
        pos.push(positions[i].map((v, k) => v - origin[k]))
        nrm.push(normals[i])
      }
      idx.push([map.get(i)])
    }
  return {
    attributes: { POSITION: addAccessor('VEC3', pos), NORMAL: addAccessor('VEC3', nrm) },
    indices: addAccessor('SCALAR', idx),
    material,
  }
}

// --- Mirrors ----------------------------------------------------------------------------------
const mirrorBox = (side) => ({
  min: [side < 0 ? -0.47 : 0.15, 0.98, -0.6],
  max: [side < 0 ? -0.15 : 0.47, 1.2, -0.48],
})
const housings = take(FAIRING, (c) => inBox(c, mirrorBox(-1)) || inBox(c, mirrorBox(1)))
const glasses = take(REFLECTOR, (c) => inBox(c, mirrorBox(-1)) || inBox(c, mirrorBox(1)))
if (housings.taken.length !== 4 || glasses.taken.length !== 2)
  throw new Error(
    `expected 4 mirror housing/stalk parts and 2 glasses, got ${housings.taken.length}/${glasses.taken.length}`,
  )
const bodyChildren = json.nodes[bodyNode].children ?? (json.nodes[bodyNode].children = [])
for (const [name, side] of [
  ['mirror_L', -1],
  ['mirror_R', 1],
]) {
  const shell = housings.taken.filter((c) => Math.sign(c.min[0] + c.max[0]) === side)
  const glass = glasses.taken.filter((c) => Math.sign(c.min[0] + c.max[0]) === side)
  // Origin at the stalk root (the inboard end, where it meets the fairing).
  const all = [...shell, ...glass]
  const inboard =
    side < 0 ? Math.max(...all.map((c) => c.max[0])) : Math.min(...all.map((c) => c.min[0]))
  const origin = [
    inboard,
    Math.min(...all.map((c) => c.min[1])),
    (Math.min(...all.map((c) => c.min[2])) + Math.max(...all.map((c) => c.max[2]))) / 2,
  ]
  json.meshes.push({
    name,
    primitives: [
      primitiveFrom(housings, shell, FAIRING, origin),
      primitiveFrom(glasses, glass, REFLECTOR, origin),
    ],
  })
  json.nodes.push({
    name,
    mesh: json.meshes.length - 1,
    translation: origin,
    extras: { nabla: { part: name, mount: 'fairing' } },
  })
  bodyChildren.push(json.nodes.length - 1)
}

// --- Static needles, hubs and speedometer ticks ---------------------------------------------
const cluster = { min: [-0.17, 0.87, -0.64], max: [0.17, 1.02, -0.52] }
const speedoDisc = { min: [-0.141, 0.9, -0.6], max: [-0.071, 0.965, -0.548] }
const tachoDisc = { min: [-0.045, 0.92, -0.615], max: [0.045, 0.992, -0.562] }
const small = (c, tris) => c.indices.length / 3 <= tris
// Panel plastic: hub and ticks inside the speedometer opening (not its 700+ tri bezel and face).
const panel = take(PANEL, (c) => inBox(c, speedoDisc) && small(c, 260))
// Aluminium: the two needles and the hubs (not the indicator-lamp bezels or the warning-lamp icons).
const metal = take(
  ALUMINIUM,
  (c) =>
    inBox(c, cluster) &&
    (inBox(c, speedoDisc) || inBox(c, tachoDisc)) &&
    small(c, 260) &&
    c.max[1] - c.min[1] > 0.008,
)
console.log(`removed ${panel.taken.length} panel parts and ${metal.taken.length} needle/hub parts`)

// --- Instrument anchors -------------------------------------------------------------------------
/** Quaternion turning local +Z to `normal` with local +Y as close to world up as possible. */
function faceRotation(normal) {
  const z = normalize(normal)
  const x = normalize(cross([0, 1, 0], z))
  const y = cross(z, x)
  // Rotation matrix columns x, y, z -> quaternion.
  const m = [x, y, z]
  const trace = m[0][0] + m[1][1] + m[2][2]
  let q
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1)
    q = [(m[1][2] - m[2][1]) * s, (m[2][0] - m[0][2]) * s, (m[0][1] - m[1][0]) * s, 0.25 / s]
  } else {
    // Not needed for faces that point towards the rider (trace > 0); keep it explicit.
    throw new Error('unexpected face orientation')
  }
  return normalize4(q)
}
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const normalize = (v) => {
  const l = Math.hypot(...v)
  return v.map((c) => c / l)
}
const normalize4 = (v) => {
  const l = Math.hypot(...v)
  return v.map((c) => Number((c / l).toFixed(6)))
}
const round = (v) => v.map((c) => Number(c.toFixed(5)))

// Measured from the panel faces (area-weighted normals, heights along the face normal of the
// opening centre). The dial faces are slightly domed, so each disc sits just above the crown.
const face = normalize([0, 0.6, 0.8])
const speedoFace = normalize([0, 0.62, 0.78])
const tachoFace = normalize([0, 0.57, 0.82])
const strip = normalize([0, 0.69, 0.72])
const along = (p, n, d) => p.map((v, k) => v + n[k] * d)
const anchors = [
  // Speedometer: 68 mm opening, face crown 5.9 mm above the reference point.
  [
    'gauge_speedo',
    along([-0.1055, 0.9335, -0.5737], face, 0.0066),
    speedoFace,
    { gauge: 'speedometer', diameter: 0.064 },
  ],
  // Tachometer: 81 mm opening, crown 2.6 mm up.
  [
    'gauge_tacho',
    along([0.001, 0.9555, -0.5898], face, 0.0033),
    tachoFace,
    { gauge: 'tachometer', diameter: 0.077 },
  ],
  // LCD window: 37 x 54 mm opening (portrait), rounded corners.
  [
    'gauge_lcd',
    along([0.1075, 0.9315, -0.5715], face, 0.0016),
    face,
    { gauge: 'lcd', width: 0.03, height: 0.045 },
  ],
  // Turn-signal lamp openings (11 mm, recessed) at the top corners: lens flush with the face.
  [
    'lamp_signal_l',
    along([-0.0845, 0.9775, -0.596], face, 0.0016),
    face,
    { lamp: 'signal-left', diameter: 0.0105 },
  ],
  [
    'lamp_signal_r',
    along([0.086, 0.9775, -0.596], face, 0.0016),
    face,
    { lamp: 'signal-right', diameter: 0.0105 },
  ],
  // Four warning-lamp openings along the bottom strip; discs sit 2 mm behind the icons.
  ...[-0.042, -0.0105, 0.014, 0.0435].map((x, i) => [
    `lamp_warning_${i + 1}`,
    along([x, 0.9055, -0.5435], strip, -0.002),
    strip,
    { lamp: 'warning', slot: i + 1, diameter: 0.0105 },
  ]),
]
for (const [name, position, normal, data] of anchors) {
  json.nodes.push({
    name,
    translation: round(position), // Body-local, like the mesh vertices
    rotation: faceRotation(normal),
    extras: { nabla: data },
  })
  bodyChildren.push(json.nodes.length - 1)
}

// --- Windscreen ---------------------------------------------------------------------------------
// Plain alpha blending instead of transmission (a transmission pass renders the screen from a
// copy of the opaque scene and can hide or blur the cluster behind it): a neutral smoke-grey tint
// (equal RGB, no blue or brown), see-through, glossy with a dimmed reflection environment so it
// shows a slight reflection without hiding the instruments or the road.
const screen = json.materials[materialIndex('Smoked translucent windscreen')]
screen.pbrMetallicRoughness = {
  baseColorFactor: [0.16, 0.16, 0.16, 0.26],
  metallicFactor: 0,
  roughnessFactor: 0.05,
}
screen.alphaMode = 'BLEND'
screen.doubleSided = true
screen.extensions = { KHR_materials_ior: { ior: 1.49 } }
screen.extras = { ...(screen.extras ?? {}), nabla: { reflective: true, envIntensity: 0.35 } }

/** A primitive drawing the components `take` removed, reusing the source vertices. */
const sharedPrimitive = ({ primitive, taken }, material) => ({
  attributes: { ...primitive.attributes },
  indices: addAccessor(
    'SCALAR',
    taken.flatMap((c) => c.indices).map((i) => [i]),
  ),
  material,
})

// --- Metal map ---------------------------------------------------------------------------------
// Mirror chrome only on the fork stanchions, the silencer can and its end cap; satin grey metal
// (the top triple clamp's material) on the exhaust headers and the engine; the rest as authored.
const SATIN = ALUMINIUM
const MIRROR_CHROME = json.materials.length
json.materials.push({
  name: 'Mirror chrome stanchions and silencer',
  pbrMetallicRoughness: {
    baseColorFactor: [0.95, 0.95, 0.95, 1],
    metallicFactor: 1,
    roughnessFactor: 0.03,
  },
  extras: { nabla: { envIntensity: 1.25 } },
})
const EXHAUST = materialIndex('Chrome exhaust and discs')
const ENGINE = materialIndex('Graphite engine cases')
const meshOf = (name) => json.meshes[json.nodes.find((n) => n.name === name).mesh]
const centre = (c, axis) => (c.min[axis] + c.max[axis]) / 2

// Fork stanchions: the two chrome tubes of Fork_Slider (x ±0.085, 0.4 m long).
const fork = meshOf('Fork_Slider').primitives.find((p) => p.material === EXHAUST)
{
  const parts = components(readAny(fork.attributes.POSITION), readAny(fork.indices).flat())
  if (parts.length !== 2 || parts.some((c) => c.max[1] - c.min[1] < 0.3))
    throw new Error(`expected 2 fork stanchions, got ${parts.length}`)
  fork.material = MIRROR_CHROME
}

// Body exhaust: the headers and mid-pipe under the engine (one part, ending at z ≈ 0.57) become
// satin grey; the silencer can and its end cap (both behind z = 0.5) mirror chrome.
{
  const tail = take(EXHAUST, (c) => c.min[2] > 0.5)
  if (tail.taken.length !== 2)
    throw new Error(`expected silencer and end cap, got ${tail.taken.length}`)
  tail.primitive.material = SATIN
  body.primitives.push(sharedPrimitive(tail, MIRROR_CHROME))
}

// Engine: the graphite cases behind the radiator (the radiator core, in front of z = −0.3, keeps
// its graphite) become satin grey.
{
  const engine = take(ENGINE, (c) => centre(c, 2) > -0.3)
  if (engine.taken.length < 40)
    throw new Error(`expected the engine parts, got ${engine.taken.length}`)
  body.primitives.push(sharedPrimitive(engine, SATIN))
}

// Verification: which node draws which material.
for (const node of json.nodes.filter((n) => n.mesh !== undefined)) {
  const counts = new Map()
  for (const p of json.meshes[node.mesh].primitives) {
    const name = json.materials[p.material].name
    counts.set(name, (counts.get(name) ?? 0) + readAny(p.indices).length / 3)
  }
  console.log(
    `${node.name}: ` +
      [...counts].map(([name, tris]) => `${name} (${Math.round(tris)} tris)`).join('; '),
  )
}

const used = new Set(json.materials.flatMap((m) => Object.keys(m.extensions ?? {})))
for (const key of ['extensionsUsed', 'extensionsRequired'])
  if (json[key]) json[key] = json[key].filter((e) => !e.startsWith('KHR_materials_') || used.has(e))

writeGlb(output, json, readAny, bin)
console.log(`wrote ${output} (${fs.statSync(output).size} bytes)`)
