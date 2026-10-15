/** Centre the original Nabla emblem on the S3 wheel hub, in both asset qualities. */
import fs from 'node:fs'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
for (const file of ['s3.steering.glb', 's3.steering-low.glb']) {
  const path = 'assets/library/cars/a3/' + file,
    bytes = fs.readFileSync(path)
  const length = bytes.readUInt32LE(12),
    doc = JSON.parse(bytes.subarray(20, 20 + length))
  const node = doc.nodes.find((n) => n.name === 'Nabla steering centre')
  if (node.extras?.nabla?.centredBadge === 4) continue
  const model = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
  model.scene.updateMatrixWorld(true)
  const mesh = model.scene.getObjectByName('Nabla_steering_centre')
  if (!mesh?.isMesh) throw new Error('Missing authored Nabla badge')
  const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
  if (!node.extras?.nabla?.centredBadge) geometry.rotateY(Math.PI / 2)
  geometry.computeBoundingBox()
  const centre = geometry.boundingBox.getCenter(new T.Vector3())
  geometry.translate(-centre.x, -centre.y, -centre.z)
  if (!node.extras?.nabla?.centredBadge) geometry.scale(0.65, 0.65, 0.65)
  geometry.translate(0, -0.003, -0.1)
  geometry.applyMatrix4(mesh.matrixWorld.clone().invert())
  const binary = Buffer.from(bytes.subarray(28 + length))
  const primitive = doc.meshes[node.mesh].primitives[0]
  for (const [semantic, name] of [
    ['POSITION', 'position'],
    ['NORMAL', 'normal'],
  ]) {
    const a = doc.accessors[primitive.attributes[semantic]],
      view = doc.bufferViews[a.bufferView]
    if (a.componentType !== 5126) throw new Error('Expected float attributes')
    const attr = geometry.getAttribute(name)
    for (let i = 0; i < a.count; i++)
      for (let k = 0; k < 3; k++)
        binary.writeFloatLE(
          attr.array[i * 3 + k],
          (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (view.byteStride ?? 12) + k * 4,
        )
    if (semantic === 'POSITION') {
      geometry.computeBoundingBox()
      a.min = geometry.boundingBox.min.toArray()
      a.max = geometry.boundingBox.max.toArray()
    }
  }
  primitive.material = doc.materials.length
  doc.materials.push({
    name: 'Nabla silver chrome steering badge',
    doubleSided: true,
    pbrMetallicRoughness: {
      baseColorFactor: [0.78, 0.81, 0.85, 1],
      metallicFactor: 1,
      roughnessFactor: 0.2,
    },
  })
  node.extras = { ...node.extras, nabla: { ...node.extras?.nabla, centredBadge: 4 } }
  const text = Buffer.from(JSON.stringify(doc)),
    json = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 32)])
  const header = Buffer.alloc(20)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(28 + json.length + binary.length, 8)
  header.writeUInt32LE(json.length, 12)
  header.writeUInt32LE(0x4e4f534a, 16)
  const binHead = Buffer.alloc(8)
  binHead.writeUInt32LE(binary.length, 0)
  binHead.writeUInt32LE(0x004e4942, 4)
  fs.writeFileSync(path, Buffer.concat([header, json, binHead, binary]))
  console.log(file, 'original triangle centred, front-facing and chrome')
}
