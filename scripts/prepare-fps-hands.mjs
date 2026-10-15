/** Adapt the supplied rigged VR hands. Preserve authored skin weights and texture. */
import fs from 'node:fs'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
const input = process.argv[2]
if (!input) throw new Error('Usage: node scripts/prepare-fps-hands.mjs source.glb')
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
const find = (prefix) => {
  let result
  gltf.scene.traverse((o) => {
    if (o.name.startsWith(T.PropertyBinding.sanitizeNodeName(prefix))) result = o
  })
  if (!result) throw new Error('Missing ' + prefix)
  return result
}
const finger = (f, k) => find(`Finger_${f}.${k}.R_`)
const wp = (o) => o.getWorldPosition(new T.Vector3())
const mixer = new T.AnimationMixer(gltf.scene)
const capture = (name) => {
  mixer.stopAllAction()
  const clip = gltf.animations.find((c) => c.name === name)
  const action = mixer.clipAction(clip)
  action.setLoop(T.LoopOnce, 1)
  action.clampWhenFinished = true
  action.play()
  mixer.update(0)
  gltf.scene.updateMatrixWorld(true)
  return [4, 3, 2, 1, 5].map((f) =>
    Array.from({ length: f === 5 ? 3 : 4 }, (_, j) => {
      const o = finger(f, j + 1)
      return {
        name: o.name,
        q: o.quaternion.toArray(),
        p: o.position.toArray(),
        s: o.scale.toArray(),
      }
    }),
  )
}
const closed = capture('Fists Pose'),
  open = capture('Throw Pose')
const wrist = find('Hand.R_'),
  middle = finger(3, 2),
  index = finger(4, 2),
  pinky = finger(1, 2)
const forward = wp(middle).sub(wp(wrist)).normalize(),
  across = wp(pinky).sub(wp(index))
across.addScaledVector(forward, -across.dot(forward)).normalize()
const up = new T.Vector3().crossVectors(across, forward).normalize()
const basis = new T.Matrix4().makeBasis(across, up, forward.clone().negate())
basis.setPosition(wp(wrist).lerp(wp(middle), 0.58))
const handScale = 0.18 / wp(find('Finger_3.4.R_end_')).distanceTo(wp(wrist))
const normalizer = new T.Matrix4()
  .makeScale(handScale, handScale, handScale)
  .multiply(basis.clone().invert())
const fingers = open.map((f, i) =>
  f.map((pose, j) => ({
    name: pose.name,
    open: pose.q,
    closed: closed[i][j].q,
    openPosition: pose.p,
    closedPosition: closed[i][j].p,
    openScale: pose.s,
    closedScale: closed[i][j].s,
  })),
)
// Freeze the proximal arm in the authored open pose; only fingers are driven in XR.
for (const node of doc.nodes) {
  const o = gltf.scene.getObjectByName(T.PropertyBinding.sanitizeNodeName(node.name))
  if (o?.isBone) {
    node.rotation = o.quaternion.toArray()
    node.translation = o.position.toArray()
    node.scale = o.scale.toArray()
    delete node.matrix
  }
}
// Keep only triangles of the right hand; retain the source rig and its skin weights.
const meshes = []
gltf.scene.traverse((o) => {
  if (o.isSkinnedMesh) meshes.push(o)
})
const mesh = meshes.find((m) => m.name === 'Object_67'),
  geo = mesh.geometry
const ji = geo.getAttribute('skinIndex'),
  sw = geo.getAttribute('skinWeight'),
  idx = geo.index
mesh.skeleton.update()
const positions = geo.getAttribute('position')
const canonical = Array.from({ length: positions.count }, (_, i) =>
  mesh
    .applyBoneTransform(i, new T.Vector3().fromBufferAttribute(positions, i))
    .applyMatrix4(mesh.matrixWorld)
    .applyMatrix4(normalizer),
)
const cut = 0.065
const revised = Array.from({ length: positions.count }, (_, i) => {
  const p = new T.Vector3().fromBufferAttribute(positions, i)
  if (canonical[i].z <= cut) return p
  const blend = new T.Matrix4()
  blend.elements.fill(0)
  for (let k = 0; k < 4; k++) {
    const weight = sw.getComponent(i, k),
      bone = new T.Matrix4().fromArray(mesh.skeleton.boneMatrices, ji.getComponent(i, k) * 16)
    for (let e = 0; e < 16; e++) blend.elements[e] += weight * bone.elements[e]
  }
  const matrix = normalizer
    .clone()
    .multiply(mesh.matrixWorld)
    .multiply(mesh.bindMatrixInverse)
    .multiply(blend)
    .multiply(mesh.bindMatrix)
  return canonical[i].clone().setZ(cut).applyMatrix4(matrix.invert())
})
const triangles = []
for (let i = 0; i < idx.count; i += 3) {
  const tri = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)]
  if (tri.some((v) => canonical[v].z < cut)) triangles.push(...tri)
}
const ib = Buffer.alloc(triangles.length * 2)
triangles.forEach((v, i) => ib.writeUInt16LE(v, i * 2))
const offset = (binary.length + 3) & ~3
const posOffset = (offset + ib.length + 3) & ~3
const pb = Buffer.alloc(revised.length * 12)
revised.forEach((p, i) => p.toArray().forEach((v, k) => pb.writeFloatLE(v, i * 12 + k * 4)))
const out = Buffer.concat([
  binary,
  Buffer.alloc(offset - binary.length),
  ib,
  Buffer.alloc(posOffset - offset - ib.length),
  pb,
])
const pv = doc.bufferViews.push({ buffer: 0, byteOffset: posOffset, byteLength: pb.length }) - 1
const pa =
  doc.accessors.push({
    bufferView: pv,
    componentType: 5126,
    count: revised.length,
    type: 'VEC3',
    min: [0, 1, 2].map((k) => Math.min(...revised.map((p) => p.getComponent(k)))),
    max: [0, 1, 2].map((k) => Math.max(...revised.map((p) => p.getComponent(k)))),
  }) - 1
doc.meshes[1].primitives[0].attributes.POSITION = pa
const vi = doc.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: ib.length }) - 1
const ai =
  doc.accessors.push({
    bufferView: vi,
    componentType: 5123,
    count: triangles.length,
    type: 'SCALAR',
  }) - 1
doc.meshes[1].primitives[0].indices = ai
for (const n of doc.nodes)
  if (n.mesh === 0) {
    delete n.mesh
    delete n.skin
  }
delete doc.animations
const root =
  doc.nodes.push({
    name: 'Nabla VR hand',
    matrix: normalizer.toArray(),
    children: doc.scenes[doc.scene || 0].nodes,
    extras: { nablaHand: { fingers, tip: find('Finger_4.4.R_end_').name } },
  }) - 1
doc.scenes = [{ nodes: [root] }]
doc.scene = 0
doc.buffers = [{ byteLength: out.length }]
const output = 'assets/library/hands/fps-hand-rigged.glb'
fs.writeFileSync(output, encode(doc, out))
console.log({ output, triangles: triangles.length / 3, bytes: fs.statSync(output).size })
