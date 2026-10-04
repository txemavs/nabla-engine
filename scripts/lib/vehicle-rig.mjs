/** Extract semantic GLB anchors without loading meshes, textures or a renderer. */
import { Matrix4, Vector3, Quaternion } from 'three'

/** Read a glTF 2 binary JSON chunk; retain the original binary asset separately. */
export function readGlbDocument(buffer) {
  if (
    buffer.length < 20 ||
    buffer.readUInt32LE(0) !== 0x46546c67 ||
    buffer.readUInt32LE(4) !== 2 ||
    buffer.readUInt32LE(8) !== buffer.length ||
    buffer.readUInt32LE(16) !== 0x4e4f534a ||
    20 + buffer.readUInt32LE(12) > buffer.length
  )
    throw new Error('Invalid GLB 2 header or JSON chunk')
  return JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString('utf8'))
}

/** Compose authored node hierarchy and the model-to-chassis pose, in metres. */
export function extractVehicleRig(document, bodyPose) {
  const anchors = new Map()
  const visited = new Set()
  const pose = (position, rotation, scale = [1, 1, 1]) =>
    new Matrix4().compose(
      new Vector3(...position),
      new Quaternion(...rotation),
      new Vector3(...scale),
    )
  const body = pose(bodyPose.position, bodyPose.rotation)
  const visit = (index, parent) => {
    if (visited.has(index)) throw new Error('Duplicate or cyclic GLB node')
    visited.add(index)
    const node = document.nodes[index]
    if (!node) throw new Error(`Missing GLB node ${index}`)
    const local = node.matrix
      ? new Matrix4().fromArray(node.matrix)
      : pose(node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale)
    const world = parent.clone().multiply(local)
    const role = node.extras?.nabla?.anchor
    if (role) {
      if (anchors.has(role)) throw new Error(`Duplicate vehicle anchor: ${role}`)
      const position = new Vector3(),
        rotation = new Quaternion(),
        scale = new Vector3()
      world.decompose(position, rotation, scale)
      const recomposed = new Matrix4().compose(position, rotation, scale)
      if (
        !world.elements.every(Number.isFinite) ||
        scale.toArray().some((v) => Math.abs(v - 1) > 1e-5) ||
        world.elements.some((v, i) => Math.abs(v - recomposed.elements[i]) > 1e-5)
      )
        throw new Error(`Vehicle anchor ${role} must have a rigid, unit-scale transform`)
      anchors.set(role, { position: position.toArray(), rotation: rotation.toArray() })
    }
    for (const child of node.children ?? []) visit(child, world)
  }
  const scene = document.scenes?.[document.scene ?? 0]
  if (!scene) throw new Error('GLB has no active scene')
  for (const node of scene.nodes ?? []) visit(node, body)
  const required = (role) => {
    if (!anchors.has(role)) throw new Error(`Missing vehicle anchor: ${role}`)
    return anchors.get(role)
  }
  const wheels = ['wheel.fl', 'wheel.fr', 'wheel.rl', 'wheel.rr'].map(required)
  return {
    hubs: wheels.map((p) => p.position),
    wheelRotations: wheels.map((p) => p.rotation),
    steering: required('steering'),
    ...(anchors.has('tow.hitch') ? { hitch: anchors.get('tow.hitch').position } : {}),
  }
}
