import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

// Node adapter for the exporter's Blob reader; the asset contains no external textures.
globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer()
    this.onloadend?.()
  }
  async readAsDataURL(blob) {
    this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`
    this.onloadend?.()
  }
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = path.join(root, 'assets/library/weapons/hk-compact')
const loader = new GLTFLoader()
const polymer = new T.MeshStandardMaterial({ color: 0x14171a, roughness: 0.86, metalness: 0 })
polymer.name = 'Black polymer'
const steel = new T.MeshStandardMaterial({ color: 0x24292e, roughness: 0.39, metalness: 0.8 })
steel.name = 'Satin black steel'
const darkSteel = new T.MeshStandardMaterial({ color: 0x101316, roughness: 0.52, metalness: 0.7 })
darkSteel.name = 'Dark steel'
const model = new T.Group()
model.name = 'HK_Compact'
model.userData = { assetKind: 'weapon-presentation', units: 'metres', forward: '-Z', up: '+Y' }
const group = (name, parent = model, at = [0, 0, 0]) => {
  const node = new T.Group()
  node.name = name
  node.position.fromArray(at)
  parent.add(node)
  return node
}
const frame = group('Frame')
const slide = group('Slide')
const detailBytes = await fs.readFile(path.join(directory, 'hk-compact.details.glb'))
const details = await loader.parseAsync(
  detailBytes.buffer.slice(detailBytes.byteOffset, detailBytes.byteOffset + detailBytes.byteLength),
  '',
)
for (const name of ['Hammer', 'Sights', 'Control_lever', 'Slide_Release']) {
  const part = details.scene.getObjectByName(name)
  if (!part) throw new Error(`Missing imported detail: ${name}`)
  part.material = darkSteel
  ;(name === 'Sights' ? slide : frame).add(part)
}
const barrel = group('Barrel')
const trigger = group('Trigger', model, [0, 0.083, -0.027])
trigger.userData = { presentationAxis: [1, 0, 0] }
const magazine = group('Magazine')
magazine.userData = { extractionAxis: [0, -Math.cos(0.27), Math.sin(0.27)] }
const mesh = (name, geometry, material, parent, at = [0, 0, 0]) => {
  const object = new T.Mesh(geometry, material)
  object.name = name
  object.position.fromArray(at)
  parent.add(object)
  return object
}
const box = (name, size, at, material, parent, radius = 0.001) =>
  mesh(name, new RoundedBoxGeometry(...size, 2, radius), material, parent, at)
async function source(part, parent, material) {
  const bytes = await fs.readFile(path.join(directory, `hk-compact.${part}.glb`))
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
  gltf.scene.updateMatrixWorld(true)
  const scale = new T.Matrix4().makeScale(0.001, 0.001, 0.001)
  let index = 0
  gltf.scene.traverse((node) => {
    if (!node.isMesh) return
    // Tiny unassigned primitives in the source are stray construction faces.
    if (node.geometry.getAttribute('position').count < 15) return
    const geometry = node.geometry.clone()
    geometry.applyMatrix4(new T.Matrix4().multiplyMatrices(scale, node.matrixWorld))
    geometry.normalizeNormals()
    mesh(
      `${part === 'slide' ? 'SlideShell' : part === 'body' ? 'FrameSurface' : 'MagazineSurface'}_${index++}`,
      geometry,
      material,
      parent,
    )
  })
}
await source('body', frame, polymer)
await source('slide', slide, steel)

// Close the visible rear of the frame and slide, preserving the original silhouette.
function sideProfile(name, points, width, material, parent) {
  const shape = new T.Shape(points.map(([z, y]) => new T.Vector2(z, y)))
  const geometry = new T.ExtrudeGeometry(shape, {
    depth: width - 0.0012,
    bevelEnabled: true,
    bevelSize: 0.0006,
    bevelThickness: 0.0006,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 12,
  })
  // Shape XY -> longitudinal Z and vertical Y; extrusion -> transverse X.
  const transform = new T.Matrix4().set(
    0,
    0,
    -1,
    width / 2 - 0.0006,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
  )
  geometry.applyMatrix4(transform)
  return mesh(name, geometry, material, parent)
}
sideProfile(
  'RearFrameBridge',
  [
    [0.018, 0.099],
    [0.049, 0.099],
    [0.052, 0.087],
    [0.043, 0.079],
    [0.031, 0.073],
    [0.021, 0.078],
  ],
  0.026,
  polymer,
  frame,
)
// Rear opening exposes the compact hammer, rather than sealing it behind the slide.
const rearOutline = new T.Shape([
  new T.Vector2(-0.0137, 0.092),
  new T.Vector2(0.0137, 0.092),
  new T.Vector2(0.0137, 0.116),
  new T.Vector2(0.009, 0.122),
  new T.Vector2(-0.009, 0.122),
  new T.Vector2(-0.0137, 0.116),
])
const hammerOpening = new T.Path()
hammerOpening.moveTo(-0.0048, 0.101)
hammerOpening.lineTo(-0.0048, 0.117)
hammerOpening.lineTo(0.0048, 0.117)
hammerOpening.lineTo(0.0048, 0.101)
hammerOpening.closePath()
rearOutline.holes.push(hammerOpening)
mesh('SlideRearClosure', new T.ShapeGeometry(rearOutline), steel, slide, [0, 0, 0.05035])
box('HammerRecess', [0.0094, 0.016, 0.002], [0, 0.109, 0.048], darkSteel, frame)

// The supplied rear view has a notched two-green-dot rear sight and a red front dot.
const rearSight = group('RearSight', slide)
const greenDot = new T.MeshStandardMaterial({
  color: 0x83c6a3,
  emissive: 0x244936,
  emissiveIntensity: 0.15,
  roughness: 0.6,
})
greenDot.name = 'Green rear sight dots'
const redDot = new T.MeshStandardMaterial({
  color: 0xef4936,
  emissive: 0x65170d,
  emissiveIntensity: 0.15,
  roughness: 0.6,
})
redDot.name = 'Red front sight dot'
function sightDot(name, x, startZ, material, parent, radius) {
  slide.updateMatrixWorld(true)
  const sight = slide.getObjectByName('Sights')
  const hit = new T.Raycaster(
    new T.Vector3(x, 0.1302, startZ),
    new T.Vector3(0, 0, -1),
  ).intersectObject(sight)[0]
  if (!hit) throw new Error(`Sight dot has no supporting face: ${name}`)
  const normal = hit.face.normal.clone().transformDirection(sight.matrixWorld)
  const dot = mesh(name, new T.CircleGeometry(radius, 16), material, parent)
  dot.position.copy(hit.point).addScaledVector(normal, 0.00008)
  dot.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), normal)
}
for (const side of [-1, 1])
  sightDot(
    `RearSightDot_${side < 0 ? 'Left' : 'Right'}`,
    side * 0.0048,
    0.1,
    greenDot,
    rearSight,
    0.0008,
  )
const frontSight = group('FrontSight', slide)
sightDot('FrontSightDot', 0, -0.05, redDot, frontSight, 0.00075)

// Visible barrel shroud and chamber: presentation geometry only, no internal mechanism.
const barrelShell = mesh(
  'BarrelExterior',
  new T.CylinderGeometry(0.0068, 0.0068, 0.088, 32, 1, true),
  darkSteel,
  barrel,
  [0, 0.108, -0.074],
)
barrelShell.rotation.x = Math.PI / 2
const muzzle = mesh(
  'MuzzleRim',
  new T.RingGeometry(0.0045, 0.0068, 32),
  steel,
  barrel,
  [0, 0.108, -0.1181],
)
muzzle.rotation.y = Math.PI
mesh(
  'MuzzleShadow',
  new T.CircleGeometry(0.0045, 32),
  new T.MeshBasicMaterial({ color: 0x020303 }),
  barrel,
  [0, 0.108, -0.115],
).rotation.y = Math.PI
box('ChamberExterior', [0.017, 0.017, 0.027], [0, 0.116, -0.041], steel, barrel)

const triggerShape = new T.Shape()
triggerShape.moveTo(0, 0)
triggerShape.bezierCurveTo(-0.005, -0.008, -0.003, -0.017, -0.012, -0.021)
triggerShape.quadraticCurveTo(-0.016, -0.023, -0.019, -0.0225)
triggerShape.quadraticCurveTo(-0.02, -0.022, -0.0185, -0.021)
triggerShape.bezierCurveTo(-0.0075, -0.0185, -0.009, -0.009, -0.004, 0)
triggerShape.closePath()
const triggerGeometry = new T.ExtrudeGeometry(triggerShape, {
  depth: 0.0045,
  bevelEnabled: true,
  bevelSize: 0.0005,
  bevelThickness: 0.0005,
  bevelSegments: 3,
  curveSegments: 32,
})
triggerGeometry.applyMatrix4(
  new T.Matrix4().set(0, 0, -1, 0.00225, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1),
)
mesh('TriggerBlade', triggerGeometry, darkSteel, trigger)

await source('magazine.source', magazine, darkSteel)

group('MuzzleSocket', model, [0, 0.108, -0.1181])
group('GripSocket', model, [0, 0.049, 0.015])
group('SightSocket', slide, [0, 0.1302, 0.035])
model.updateMatrixWorld(true)
const binary = await new GLTFExporter().parseAsync(model, {
  binary: true,
  onlyVisible: true,
  trs: true,
})
await fs.writeFile(path.join(directory, 'hk-compact.glb'), Buffer.from(binary))
const bounds = new T.Box3().setFromObject(model)
const rig = {
  version: 1,
  units: 'metres',
  forward: '-Z',
  model: '/library/weapons/hk-compact/hk-compact.glb',
  rest: 'assembled',
  parts: {
    frame: 'Frame',
    slide: 'Slide',
    barrel: 'Barrel',
    trigger: 'Trigger',
    magazine: 'Magazine',
  },
  sockets: { muzzle: 'MuzzleSocket', grip: 'GripSocket', sight: 'SightSocket' },
  presentation: {
    slide: { axis: [0, 0, 1], travel: 0.012 },
    trigger: { axis: [1, 0, 0], angle: 0.16 },
    magazine: { axis: magazine.userData.extractionAxis, distance: 0.11 },
  },
  bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
  note: 'Game presentation rig. Motion values are artistic animation parameters, not mechanical specifications.',
}
const rigDirectory = path.join(root, 'assets/rigs/weapons')
await fs.mkdir(rigDirectory, { recursive: true })
await fs.writeFile(
  path.join(rigDirectory, 'hk-compact.rig.json'),
  JSON.stringify(rig, null, 2) + '\n',
)
console.log('Authored HK Compact', bounds.getSize(new T.Vector3()).toArray(), binary.byteLength)
