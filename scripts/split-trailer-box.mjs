/** Split trailer.anchored.glb into a shared chassis and a swappable cargo box. */
import * as THREE from 'three'
import { readGlb, writeGlb } from './lib/glb.mjs'

const SOURCE = 'assets/library/trucks/white-truck/assets/trailer.anchored.glb'
const CHASSIS = 'assets/library/trucks/white-truck/assets/trailer.chassis.glb'
const BOX = 'assets/library/trucks/white-truck/assets/trailer.box.glb'

/** Cargo walls, deck and the marker lights that live on the box outline. */
const BOX_NODE = /^(box01|light_back|light_fron|light_le|light_ri)/i

function parentsOf(nodes) {
  const parent = new Map()
  for (const [index, node] of nodes.entries())
    for (const child of node.children ?? []) parent.set(child, index)
  return parent
}

function withAncestors(keep, nodes) {
  const parent = parentsOf(nodes)
  const next = new Set(keep)
  for (const index of keep) {
    let at = parent.get(index)
    while (at !== undefined && !next.has(at)) {
      next.add(at)
      at = parent.get(at)
    }
  }
  return next
}

function remapList(list, indexOf) {
  return (list ?? []).filter((i) => indexOf.has(i)).map((i) => indexOf.get(i))
}

function compactMeshes(json) {
  const used = new Set()
  for (const node of json.nodes) if (node.mesh !== undefined) used.add(node.mesh)
  const order = [...used].sort((a, b) => a - b)
  const indexOf = new Map(order.map((old, next) => [old, next]))
  json.meshes = order.map((i) => structuredClone(json.meshes[i]))
  for (const node of json.nodes) if (node.mesh !== undefined) node.mesh = indexOf.get(node.mesh)
}

function compactMaterials(json) {
  const used = new Set()
  for (const mesh of json.meshes)
    for (const primitive of mesh.primitives)
      if (primitive.material !== undefined) used.add(primitive.material)
  const order = [...used].sort((a, b) => a - b)
  const indexOf = new Map(order.map((old, next) => [old, next]))
  json.materials = order.map((i) => structuredClone(json.materials[i]))
  for (const mesh of json.meshes)
    for (const primitive of mesh.primitives)
      if (primitive.material !== undefined) primitive.material = indexOf.get(primitive.material)
}

function extract(json, keep) {
  const indexOf = new Map([...keep].sort((a, b) => a - b).map((old, next) => [old, next]))
  const out = structuredClone(json)
  out.nodes = [...keep]
    .sort((a, b) => a - b)
    .map((i) => {
      const node = structuredClone(json.nodes[i])
      if (node.children) {
        const children = remapList(node.children, indexOf)
        if (children.length) node.children = children
        else delete node.children
      }
      return node
    })
  for (const scene of out.scenes ?? []) scene.nodes = remapList(scene.nodes, indexOf)
  compactMeshes(out)
  compactMaterials(out)
  return out
}

function meshNames(json) {
  return json.nodes.filter((node) => node.mesh !== undefined).map((node) => node.name)
}

const { json, read, bin } = readGlb(SOURCE)
// The original Box_ref mesh is the black underframe, not the cargo walls.
for (const node of json.nodes) if (/^Box_ref/i.test(node.name ?? '')) node.name = 'ChassisFrame'

const boxNodes = withAncestors(
  new Set(json.nodes.flatMap((node, i) => (BOX_NODE.test(node.name ?? '') ? [i] : []))),
  json.nodes,
)
const chassisNodes = new Set(
  json.nodes.flatMap((node, i) => (boxNodes.has(i) && node.mesh !== undefined ? [] : [i])),
)

const chassis = extract(json, chassisNodes)
const box = extract(json, boxNodes)
const added = new Map()
function plate(doc, name, size, position) {
  const geometry = new THREE.BoxGeometry(...size)
  const attributes = {}
  for (const [semantic, attr] of [
    ['POSITION', geometry.attributes.position],
    ['NORMAL', geometry.attributes.normal],
  ]) {
    const index = doc.accessors.length
    doc.accessors.push({ type: 'VEC3', count: attr.count })
    added.set(
      index,
      Array.from({ length: attr.count }, (_, i) => [attr.getX(i), attr.getY(i), attr.getZ(i)]),
    )
    attributes[semantic] = index
  }
  const indices = doc.accessors.length
  doc.accessors.push({ type: 'SCALAR', count: geometry.index.count })
  added.set(
    indices,
    Array.from(geometry.index.array, (value) => [value]),
  )
  const material = doc.materials.length
  doc.materials.push({
    name: 'Platform black steel',
    pbrMetallicRoughness: {
      baseColorFactor: [0.025, 0.027, 0.03, 1],
      metallicFactor: 0.55,
      roughnessFactor: 0.7,
    },
  })
  const mesh = doc.meshes.length
  doc.meshes.push({ primitives: [{ attributes, indices, material }] })
  const node = doc.nodes.length
  doc.nodes.push({ name, mesh, translation: position })
  doc.scenes[doc.scene ?? 0].nodes.push(node)
}
plate(chassis, 'LoadingDeck', [2.4, 0.18, 12.8], [0, 0.19, 0])
const readAdded = (id) => added.get(id) ?? read(id)
writeGlb(CHASSIS, chassis, readAdded, bin)
const transporter = structuredClone(chassis)
writeGlb(
  'assets/library/trucks/white-truck/assets/trailer.transporter.glb',
  transporter,
  readAdded,
  bin,
)
writeGlb(BOX, box, read, bin)

console.log(
  `Trailer split: chassis ${meshNames(chassis).length} meshes, box ${meshNames(box).length} meshes`,
)
