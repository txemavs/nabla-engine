/** Adapt the supplied rigged VR hands. Preserve authored skin weights and texture. */
import fs from 'node:fs'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
const input = process.argv[2]
if (!input) throw new Error('Usage: node scripts/prepare-vr-hands.mjs source.glb')
const bytes = fs.readFileSync(input),
  jl = bytes.readUInt32LE(12)
const doc = JSON.parse(bytes.subarray(20, 20 + jl)),
  binary = bytes.subarray(28 + jl)
function encode(d, b) {
  const js = Buffer.from(JSON.stringify(d)),
    j = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 32)])
  const bin = Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)])
  const h = Buffer.alloc(20)
  h.write('glTF')
  h.writeUInt32LE(2, 4)
  h.writeUInt32LE(28 + j.length + bin.length, 8)
  h.writeUInt32LE(j.length, 12)
  h.writeUInt32LE(0x4e4f534a, 16)
  const bh = Buffer.alloc(8)
  bh.writeUInt32LE(bin.length)
  bh.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([h, j, bh, bin])
}
const inspect = structuredClone(doc)
inspect.materials = [{}]
delete inspect.images
delete inspect.textures
for (const m of inspect.meshes) for (const p of m.primitives) p.material = 0
const clean = encode(inspect, binary)
const gltf = await new GLTFLoader().parseAsync(
  clean.buffer.slice(clean.byteOffset, clean.byteOffset + clean.length),
  '',
)
gltf.scene.updateMatrixWorld(true)
const bone = (name) => {
  let result
  gltf.scene.traverse((o) => {
    if (o.name.startsWith('J_Right_Hand' + name + '_')) result = o
  })
  if (!result) throw new Error('Missing ' + name)
  return result
}
const wrist = bone(''),
  index = bone('Index1'),
  pinky = bone('Pinky1'),
  middle = bone('Middle1')
const wp = (o) => o.getWorldPosition(new T.Vector3())
const forward = wp(middle).sub(wp(wrist)).normalize(),
  across = wp(pinky).sub(wp(index))
across.addScaledVector(forward, -across.dot(forward)).normalize()
const up = new T.Vector3().crossVectors(across, forward).normalize(),
  origin = wp(wrist).lerp(wp(middle), 0.58)
const basis = new T.Matrix4().makeBasis(across, up, forward.clone().negate())
basis.setPosition(origin)
const normalizer = basis.clone().invert()
const wrapper = new T.Group()
wrapper.matrix.copy(normalizer)
wrapper.matrixAutoUpdate = false
wrapper.add(gltf.scene)
wrapper.updateMatrixWorld(true)
const names = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']
const fingers = []
for (let f = 0; f < 5; f++) {
  const entries = []
  for (let k = 1; k <= 3; k++) {
    const joint = bone(names[f] + k),
      child = bone(names[f] + (k + 1))
    if (f < 4) {
      const current = wp(child).sub(wp(joint)).normalize(),
        desired = new T.Vector3((f - 1) * 0.07, 0, -1).normalize()
      const q = new T.Quaternion()
        .setFromUnitVectors(current, desired)
        .multiply(joint.getWorldQuaternion(new T.Quaternion()))
      joint.quaternion.copy(
        joint.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q),
      )
      wrapper.updateMatrixWorld(true)
    }
    const open = joint.quaternion.clone(),
      world = joint.getWorldQuaternion(new T.Quaternion())
    const axis = new T.Vector3(1, 0, 0).applyQuaternion(world.clone().invert())
    const angle = f === 4 ? [0.15, 0.3, 0.4][k - 1] : [1.0, 1.25, 0.85][k - 1]
    const closed = open.clone().multiply(new T.Quaternion().setFromAxisAngle(axis, -angle))
    if (f === 4 && k === 1) {
      const direction = wp(child).sub(wp(joint)).normalize()
      const target = new T.Vector3(0.2, -0.15, -0.95).normalize()
      const rotation = new T.Quaternion().setFromUnitVectors(direction, target).multiply(world)
      closed.copy(joint.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(rotation))
    }
    entries.push({ name: joint.name, open: open.toArray(), closed: closed.toArray() })
  }
  fingers.push(entries)
}
// Keep only triangles of the right hand; retain the source rig and its skin weights.
const mesh = gltf.scene.getObjectByProperty('isSkinnedMesh', true),
  geo = mesh.geometry
const ji = geo.getAttribute('skinIndex'),
  sw = geo.getAttribute('skinWeight'),
  idx = geo.index
const rightWeight = (i) => {
  let sum = 0
  for (let k = 0; k < 4; k++)
    if (mesh.skeleton.bones[ji.getComponent(i, k)].name.startsWith('J_Right'))
      sum += sw.getComponent(i, k)
  return sum
}
const triangles = []
for (let i = 0; i < idx.count; i += 3) {
  const tri = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)]
  if (tri.every((v) => rightWeight(v) > 0.99)) triangles.push(...tri)
}
const ib = Buffer.alloc(triangles.length * 2)
triangles.forEach((v, i) => ib.writeUInt16LE(v, i * 2))
const offset = (binary.length + 3) & ~3
const out = Buffer.concat([binary, Buffer.alloc(offset - binary.length), ib])
const vi = doc.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: ib.length }) - 1
const ai =
  doc.accessors.push({
    bufferView: vi,
    componentType: 5123,
    count: triangles.length,
    type: 'SCALAR',
  }) - 1
doc.meshes[0].primitives[0].indices = ai
delete doc.animations
const root =
  doc.nodes.push({
    name: 'Nabla VR hand',
    matrix: normalizer.toArray(),
    children: doc.scenes[doc.scene || 0].nodes,
    extras: { nablaHand: { fingers, tip: bone('Index4').name } },
  }) - 1
doc.scenes = [{ nodes: [root] }]
doc.scene = 0
doc.buffers = [{ byteLength: out.length }]
const output = 'assets/library/hands/vr-hand-rigged.glb'
fs.writeFileSync(output, encode(doc, out))
console.log({ output, triangles: triangles.length / 3, bytes: fs.statSync(output).size })
