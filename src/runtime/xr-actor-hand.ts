import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'

export type HandSide = 'left' | 'right'
/** Mixamorig finger chains, in the glove order: index, middle, ring, pinky, thumb. */
export const MIXAMO_FINGERS = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'] as const
const BONE = 'mixamorig:'
const side = (s: HandSide) => (s === 'left' ? 'Left' : 'Right')
export const mixamoHandBone = (s: HandSide) => `${BONE}${side(s)}Hand`
export const mixamoFingerBone = (s: HandSide, finger: number, joint: number) =>
  `${BONE}${side(s)}Hand${MIXAMO_FINGERS[finger]}${joint + 1}`
/** A vertex belongs to the hand when this much of its skin weight is on hand bones. */
const HAND_WEIGHT = 0.5

export interface ActorHandJoint {
  bone: THREE.Object3D
  bind: THREE.Quaternion
  /** Curl axis in the bone's parent space; a negative angle closes toward the palm. */
  axis: THREE.Vector3
}

export interface ActorHand {
  /** Hand frame of the glove contract: palm at origin, -Z fingers, +Y back, thumb on -X (right). */
  root: THREE.Group
  /** Five chains of three joints (index … thumb). */
  fingers: ActorHandJoint[][]
  tip: THREE.Object3D
}

/** Names of the hand bone and every bone under it (fingers, ends). */
function handBones(hand: THREE.Object3D): Set<string> {
  const names = new Set<string>()
  hand.traverse((o) => names.add(o.name))
  return names
}

/** Keep only triangles whose three vertices are skinned mostly to `bones` (by name). */
export function keepHandTriangles(mesh: THREE.SkinnedMesh, bones: Set<string>): boolean {
  const geometry = mesh.geometry
  const index = geometry.getIndex()
  const skinIndex = geometry.getAttribute('skinIndex')
  const skinWeight = geometry.getAttribute('skinWeight')
  if (!skinIndex || !skinWeight) return false
  const isHand = mesh.skeleton.bones.map((b) => bones.has(b.name))
  const count = geometry.getAttribute('position').count
  const inHand = new Uint8Array(count)
  for (let v = 0; v < count; v++) {
    let w = 0
    for (let k = 0; k < 4; k++)
      if (isHand[skinIndex.getComponent(v, k)]) w += skinWeight.getComponent(v, k)
    inHand[v] = w >= HAND_WEIGHT ? 1 : 0
  }
  const at = (i: number) => (index ? index.getX(i) : i)
  const total = index ? index.count : count
  // Per material group (multi-material primitives), so each group keeps its own triangles.
  const groups = geometry.groups.length
    ? geometry.groups
    : [{ start: 0, count: total, materialIndex: 0 }]
  const cut = geometry.clone()
  cut.clearGroups()
  const keep: number[] = []
  for (const g of groups) {
    const start = keep.length
    for (let i = g.start; i + 2 < Math.min(total, g.start + g.count); i += 3) {
      const a = at(i),
        b = at(i + 1),
        c = at(i + 2)
      if (inHand[a] && inHand[b] && inHand[c]) keep.push(a, b, c)
    }
    if (geometry.groups.length && keep.length > start)
      cut.addGroup(start, keep.length - start, g.materialIndex ?? 0)
  }
  if (!keep.length) return false
  cut.setIndex(keep)
  mesh.geometry = cut
  return true
}

const v = () => new THREE.Vector3()
const worldPos = (o: THREE.Object3D) => o.getWorldPosition(v())

/**
 * One hand of an actor's mixamorig GLB (a hands file or a whole body): its own skinned copy,
 * cut to the hand triangles and re-framed to the glove contract so it sits on the controller grip.
 * Returns null when the skeleton lacks the hand or finger bones.
 */
export function buildActorHand(source: THREE.Object3D, s: HandSide): ActorHand | null {
  const scene = cloneSkinned(source)
  scene.updateMatrixWorld(true)
  // GLTFLoader sanitizes node names (`mixamorig:LeftHand` → `mixamorigLeftHand`): try both.
  const find = (name: string) =>
    scene.getObjectByName(name) ?? scene.getObjectByName(name.replace(':', ''))
  const hand = find(mixamoHandBone(s))
  const bone = (f: number, j: number) => find(mixamoFingerBone(s, f, j))
  const index1 = bone(0, 0),
    middle1 = bone(1, 0),
    pinky1 = bone(3, 0),
    tip = bone(0, 3)
  if (!hand || !index1 || !middle1 || !pinky1 || !tip) return null
  const names = handBones(hand)
  const meshes: THREE.SkinnedMesh[] = []
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh)
  })
  for (const mesh of meshes) {
    if (!keepHandTriangles(mesh, names)) mesh.visible = false
    mesh.frustumCulled = false
  }
  if (!meshes.some((m) => m.visible)) return null
  // Hand frame in model space: -Z toward the middle knuckle, X toward the pinky on the right
  // (toward the thumb on the left: the glove contract mirrors left hands), Y the back of the hand.
  const wrist = worldPos(hand)
  const z = wrist.clone().sub(worldPos(middle1)).normalize()
  const across = worldPos(pinky1).sub(worldPos(index1))
  if (s === 'left') across.negate()
  const y = new THREE.Vector3().crossVectors(z, across).normalize()
  const x = new THREE.Vector3().crossVectors(y, z).normalize()
  // Origin at the palm (halfway wrist → middle knuckle), where the WebXR grip space sits.
  const palm = wrist.clone().lerp(worldPos(middle1), 0.5)
  const frame = new THREE.Matrix4().makeBasis(x, y, z).setPosition(palm)
  // Curl axes (model space, before re-framing): the frame X (thumb: the frame Z, a sweep across the palm) in each parent's space.
  const fingers = MIXAMO_FINGERS.map((_, f) =>
    [0, 1, 2].flatMap((j) => {
      const b = bone(f, j)
      if (!b?.parent) return []
      const parentQ = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
      const axis = (f === 4 ? z.clone().negate() : x.clone()).applyQuaternion(parentQ).normalize()
      if (f === 4 && s === 'left') axis.negate()
      return [{ bone: b, bind: b.quaternion.clone(), axis }]
    }),
  )
  const holder = new THREE.Group()
  holder.add(scene)
  holder.applyMatrix4(frame.clone().invert())
  const root = new THREE.Group()
  root.name = `Actor ${s} hand`
  root.add(holder)
  if (fingers.some((chain) => chain.length !== 3)) return null
  return { root, fingers, tip }
}

const q = new THREE.Quaternion()
/** Pose a finger joint: `angle` radians of curl (0 = bind pose). */
export function curlJoint(joint: ActorHandJoint, angle: number): void {
  joint.bone.quaternion.copy(q.setFromAxisAngle(joint.axis, -angle)).multiply(joint.bind)
}
