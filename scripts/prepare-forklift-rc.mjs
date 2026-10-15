import fs from 'node:fs'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
globalThis.FileReader ??= class {
  async readAsArrayBuffer(b) {
    this.result = await b.arrayBuffer()
    this.onloadend?.()
  }
}
const path = 'assets/library/cars/forklift-rc/'
fs.mkdirSync(path, { recursive: true })
const input = process.argv[2] ?? '/mnt/a/Descargas/low_poly_forklift_truck.glb'
const b = fs.readFileSync(input)
const { scene } = await new GLTFLoader().parseAsync(
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
  '',
)
scene.updateMatrixWorld(true)
function components(geometry) {
  const flat = geometry.toNonIndexed(),
    pos = flat.attributes.position
  const parents = Array.from({ length: pos.count }, (_, i) => i)
  const root = (i) => (parents[i] === i ? i : (parents[i] = root(parents[i])))
  const join = (a, b) => (parents[root(a)] = root(b))
  const vertices = new Map()
  for (let i = 0; i < pos.count; i++) {
    const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => v.toFixed(5)).join(',')
    if (vertices.has(key)) join(i, vertices.get(key))
    else vertices.set(key, i)
    join(i, i - (i % 3))
  }
  const groups = new Map()
  for (let i = 0; i < pos.count; i++) {
    const id = root(i)
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id).push(i)
  }
  return [...groups.values()].map((ids) => {
    const g = new T.BufferGeometry()
    for (const [key, attribute] of Object.entries(flat.attributes)) {
      const values = ids.flatMap((i) =>
        Array.from(attribute.array.slice(i * attribute.itemSize, (i + 1) * attribute.itemSize)),
      )
      g.setAttribute(key, new T.Float32BufferAttribute(values, attribute.itemSize))
    }
    g.computeBoundingBox()
    return g
  })
}

const body = new T.Group(),
  mast = new T.Group(),
  inner = new T.Group(),
  carriage = new T.Group(),
  steering = new T.Group()
mast.name = 'forklift-mast'
mast.position.set(0, 0.1, -1.1)
inner.name = 'forklift-inner-mast'
carriage.name = 'forklift-carriage'
body.add(mast)
mast.add(inner, carriage)
let serial = 0
scene.traverse((o) => {
  if (!o.isMesh) return
  const g = o.geometry.clone().applyMatrix4(o.matrixWorld)
  g.translate(-5424.89, -2.2555, -284)
  g.scale(0.0165, 0.0165, 0.0165)
  g.rotateY(Math.PI)
  for (const part of components(g)) {
    const i = serial++
    if ([0, 5, 7, 9, 28, 29, 38, 39, 40, 41, 42, 43, 44, 45].includes(i)) continue
    const mesh = new T.Mesh(part, o.material.clone())
    mesh.name = 'Forklift_Source_' + i
    if ([23, 24, 25].includes(i)) {
      part.translate(0.277, -1.39, 0.264)
      steering.add(mesh)
    } else if (i >= 30 && i <= 37) {
      part.translate(0, -0.33, 1.1)
      carriage.add(mesh)
    } else if ([18, 20].includes(i)) {
      part.translate(0, -0.1, 1.1)
      inner.add(mesh)
    } else if ([16, 17, 19, 21, 22, 48, 56, 57, 58, 59, 60].includes(i)) {
      part.translate(0, -0.1, 1.1)
      mast.add(mesh)
    } else body.add(mesh)
  }
})
if (serial !== 61) throw new Error('Source topology changed; review component bindings')
for (let i = 0; i < 3; i++) {
  const lever = new T.Group()
  lever.name = 'forklift-lever-' + i
  lever.position.set(0.16 + i * 0.09, 1.1, -0.3)
  lever.userData.grabPoint = [0, 0.22, 0]
  const material = new T.MeshStandardMaterial({ color: 0x202225, roughness: 0.6 })
  const stem = new T.Mesh(new T.CylinderGeometry(0.011, 0.011, 0.2, 8), material)
  stem.position.y = 0.1
  lever.add(stem)
  const knob = new T.Mesh(
    new T.SphereGeometry(0.035, 12, 8),
    new T.MeshStandardMaterial({ color: [0x36bd67, 0x328ce7, 0xe64435][i], roughness: 0.6 }),
  )
  knob.name = 'forklift-knob-' + i
  knob.position.y = 0.22
  lever.add(knob)
  body.add(lever)
}
const wheel = new T.Group()
for (const [radius, width, color] of [
  [0.377, 0.173, 0x27292c],
  [0.19, 0.181, 0x888b90],
  [0.075, 0.19, 0x424548],
]) {
  const mesh = new T.Mesh(
    new T.CylinderGeometry(radius, radius, width, 24),
    new T.MeshStandardMaterial({ color, roughness: 0.8 }),
  )
  mesh.rotation.z = Math.PI / 2
  wheel.add(mesh)
}
const save = async (name, object) =>
  fs.writeFileSync(
    path + name + '.glb',
    Buffer.from(await new GLTFExporter().parseAsync(object, { binary: true })),
  )
await save('body', body)
await save('wheel', wheel)
await save('steering', steering)
const pb = fs.readFileSync('assets/library/cars/forklift-rc/pallet.glb')
const pallet = (
  await new GLTFLoader().parseAsync(
    pb.buffer.slice(pb.byteOffset, pb.byteOffset + pb.byteLength),
    '',
  )
).scene
const box = new T.Mesh(
  new T.BoxGeometry(0.95, 1, 0.95),
  new T.MeshStandardMaterial({ color: 0x9c7849, roughness: 0.9 }),
)
box.position.y = 0.645
pallet.add(box)
await save('pallet-box', pallet)
const preset = JSON.parse(fs.readFileSync(path + 'forklift-rc.json', 'utf8'))
preset.id = 'forklift-rc'
preset.label = 'Toro low poly · R/C'
preset.name = 'Toro R/C'
preset.placement = [0, 0.02, 0]
preset.size = [1.4, 2.35, 3.82]
preset.vehicle.hubs = [
  [-0.598, 0.377, -0.658],
  [0.598, 0.377, -0.658],
  [-0.598, 0.377, 1.093],
  [0.598, 0.377, 1.093],
]
preset.vehicle.wheelRadius = 0.377
preset.vehicle.colliders = [
  { size: [1.1, 0.65, 2.45], transform: { position: [0, 0.65, 0.3], rotation: [0, 0, 0, 1] } },
]
preset.vehicle.forkliftGeometry = {
  pivot: [0, 0.1, -1.1],
  colliders: [
    {
      size: [0.098, 0.05, 1.02],
      transform: { position: [-0.303, -0.058, -0.623], rotation: [0, 0, 0, 1] },
    },
    {
      size: [0.098, 0.05, 1.02],
      transform: { position: [0.303, -0.058, -0.623], rotation: [0, 0, 0, 1] },
    },
    {
      size: [1.13, 0.75, 0.044],
      transform: { position: [0.005, 0.31, -0.119], rotation: [0, 0, 0, 1] },
    },
  ],
}
preset.visual = {
  body: {
    url: '/library/cars/forklift-rc/body.glb',
    transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
  },
  wheel: {
    url: '/library/cars/forklift-rc/wheel.glb',
    transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
  },
  steering: {
    url: '/library/cars/forklift-rc/steering.glb',
    transform: { position: [-0.277, 1.39, -0.264], rotation: [0, 0, 0, 1] },
    axis: [0, 0.7, 0.7],
  },
}
fs.writeFileSync(path + 'forklift-rc.json', JSON.stringify(preset, null, 2) + '\n')
