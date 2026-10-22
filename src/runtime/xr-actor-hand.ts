import * as THREE from 'three'

export type HandSide = 'left' | 'right'
/** Mixamorig finger chains, in the glove order: index, middle, ring, pinky, thumb. */
export const MIXAMO_FINGERS = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'] as const
const BONE = 'mixamorig:'
const sideName = (s: HandSide) => (s === 'left' ? 'Left' : 'Right')
export const mixamoHandBone = (s: HandSide) => `${BONE}${sideName(s)}Hand`
export const mixamoFingerBone = (s: HandSide, finger: number, joint: number) =>
  `${BONE}${sideName(s)}Hand${MIXAMO_FINGERS[finger]}${joint + 1}`
/** A triangle belongs to the hand when this much of its skin weight is on hand bones. */
const HAND_WEIGHT = 0.5

/**
 * A mechanical hand built from an actor's mixamorig GLB: rigid pieces, one per phalanx (no
 * skinning, so nothing stretches), on joints framed like the procedural glove so it is posed the
 * same way: palm at the origin, -Z fingers, +Y back of the hand, thumb on -X (right; the left
 * hand is its mirror, thumb on +X). Joints rest at zero rotation (the authored pose).
 */
export interface ActorHand {
  root: THREE.Group
  /** Five chains of three joints (index, middle, ring, pinky, thumb), knuckle first. */
  fingers: THREE.Group[][]
  tip: THREE.Object3D
  side: HandSide
}

const tmp = new THREE.Vector3()

/**
 * One hand of a mixamorig GLB (a hands-only file or a whole body). Each triangle skinned mostly
 * to the hand goes, whole, to the piece of its dominant bone (fingertip ends join the last
 * phalanx, the palm takes the rest). Null when the GLB lacks the bones or hand triangles.
 */
export function buildActorHand(source: THREE.Object3D, s: HandSide): ActorHand | null {
  source.updateMatrixWorld(true)
  // GLTFLoader sanitizes node names (`mixamorig:LeftHand` → `mixamorigLeftHand`): try both.
  const find = (name: string) =>
    source.getObjectByName(name) ?? source.getObjectByName(name.replace(':', ''))
  const hand = find(mixamoHandBone(s))
  const bones = MIXAMO_FINGERS.map((_, f) =>
    [0, 1, 2, 3].map((j) => find(mixamoFingerBone(s, f, j))),
  )
  if (!hand || bones.some((chain) => chain.slice(0, 3).some((b) => !b)) || !bones[0][3]) return null
  const at = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3())

  // Hand frame (model space). Left: X toward the thumb, the glove's mirror.
  const wrist = at(hand)
  const middle1 = at(bones[1][0]!)
  const z = wrist.clone().sub(middle1).normalize()
  const across = at(bones[3][0]!).sub(at(bones[0][0]!))
  if (s === 'left') across.negate()
  const y = new THREE.Vector3().crossVectors(z, across).normalize()
  const x = new THREE.Vector3().crossVectors(y, z).normalize()
  const palm = wrist.clone().lerp(middle1, 0.5)
  const toFrame = new THREE.Matrix4().makeBasis(x, y, z).setPosition(palm).invert()
  const framed = (o: THREE.Object3D) => at(o).applyMatrix4(toFrame)

  // Segment of every bone under the hand: 0 palm, 1 + finger * 3 + joint (joint 4 → joint 3).
  const segmentOf = new Map<THREE.Object3D, number>()
  hand.traverse((o) => segmentOf.set(o, 0))
  bones.forEach((chain, f) =>
    chain.forEach((b, j) => b?.traverse((o) => segmentOf.set(o, 1 + f * 3 + Math.min(j, 2)))),
  )

  const root = new THREE.Group()
  root.name = `Actor ${s} hand`
  const groups: THREE.Group[] = [root]
  const fingers = bones.map((chain) => {
    let parent = root
    let origin = new THREE.Vector3()
    return [0, 1, 2].map((j) => {
      const joint = new THREE.Group()
      const p = framed(chain[j]!)
      joint.position.copy(p).sub(origin)
      origin = p
      parent.add(joint)
      parent = joint
      groups.push(joint)
      return joint
    })
  })
  const tip = new THREE.Object3D()
  tip.position.copy(framed(bones[0][3]!)).sub(framed(bones[0][2]!))
  fingers[0][2].add(tip)
  const groupOrigin = groups.map((g) => {
    g.updateMatrixWorld(true)
    return g.getWorldPosition(new THREE.Vector3())
  })

  // Per segment, per material: triangle soup positions (and uvs) in the segment's joint space.
  type Soup = { pos: number[]; uv: number[] }
  const soups = new Map<string, Soup>()
  const meshes: THREE.SkinnedMesh[] = []
  source.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh)
  })
  const materials: THREE.Material[] = []
  for (const mesh of meshes) {
    const g = mesh.geometry
    const skinIndex = g.getAttribute('skinIndex')
    const skinWeight = g.getAttribute('skinWeight')
    const uv = g.getAttribute('uv')
    if (!skinIndex || !skinWeight) continue
    const segs = mesh.skeleton.bones.map((b) => segmentOf.get(b))
    const index = g.getIndex()
    const total = index ? index.count : g.getAttribute('position').count
    const vtx = (i: number) => (index ? index.getX(i) : i)
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const groupsOf = g.groups.length ? g.groups : [{ start: 0, count: total, materialIndex: 0 }]
    for (const range of groupsOf) {
      const material = meshMaterials[range.materialIndex ?? 0] ?? meshMaterials[0]
      let m = materials.indexOf(material)
      if (m < 0) m = materials.push(material) - 1
      for (let i = range.start; i + 2 < Math.min(total, range.start + range.count); i += 3) {
        const weight = new Map<number, number>()
        let inHand = 0
        const tri = [vtx(i), vtx(i + 1), vtx(i + 2)]
        for (const v of tri)
          for (let k = 0; k < 4; k++) {
            const seg = segs[skinIndex.getComponent(v, k)]
            const w = skinWeight.getComponent(v, k)
            if (seg === undefined || !w) continue
            inHand += w
            weight.set(seg, (weight.get(seg) ?? 0) + w)
          }
        if (inHand < HAND_WEIGHT * 3) continue
        const seg = [...weight].sort((a, b) => b[1] - a[1])[0][0]
        const key = `${seg}:${m}`
        let soup = soups.get(key)
        if (!soup) soups.set(key, (soup = { pos: [], uv: [] }))
        for (const v of tri) {
          mesh.getVertexPosition(v, tmp).applyMatrix4(mesh.matrixWorld).applyMatrix4(toFrame)
          tmp.sub(groupOrigin[seg])
          soup.pos.push(tmp.x, tmp.y, tmp.z)
          if (uv) soup.uv.push(uv.getX(v), uv.getY(v))
        }
      }
    }
  }
  if (!soups.size) return null
  for (const [key, soup] of soups) {
    const [seg, m] = key.split(':').map(Number)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(soup.pos, 3))
    if (soup.uv.length) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(soup.uv, 2))
    // Faceted normals: the pieces read as machined plates.
    geometry.computeVertexNormals()
    const piece = new THREE.Mesh(geometry, materials[m])
    piece.name = `segment-${seg}`
    groups[seg].add(piece)
  }
  return { root, fingers, tip, side: s }
}

/**
 * Pose like the procedural glove: index curls with max(trigger, 0.35 grip), the others with
 * grip, each joint about the hand's X axis (−angle closes toward the palm); the thumb folds
 * across the palm with grip. Zero is the authored rest pose.
 */
export function poseActorHand(hand: ActorHand, grip: number, trigger: number): void {
  hand.fingers.forEach((joints, i) =>
    joints.forEach((joint, j) => {
      if (i === 4) {
        const mirror = hand.side === 'left' ? -1 : 1
        joint.rotation.set(
          -grip * [0.35, 0.6, 0.65][j],
          j === 0 ? -grip * 0.65 * mirror : 0,
          j === 0 ? -grip * 0.5 * mirror : 0,
        )
        return
      }
      const curl = i === 0 ? Math.max(trigger, grip * 0.35) : grip
      joint.rotation.set(-curl * [1.1, 1.25, 0.9][j], 0, 0)
    }),
  )
}
