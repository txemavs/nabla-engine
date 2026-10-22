import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import { MeshoptDecoder } from 'meshoptimizer'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import { actorHandAssets } from '../../src/runtime/actor.js'
import {
  buildActorHand,
  mixamoFingerBone,
  mixamoHandBone,
  poseActorHand,
} from '../../src/runtime/xr-actor-hand.js'

/** A tiny mixamorig rig: forearm + hand (+5×4 finger bones) per side, one triangle on each. */
function rig() {
  const root = new THREE.Group()
  const bones: THREE.Bone[] = []
  const bone = (name: string, parent: THREE.Object3D, at: number[]) => {
    const b = new THREE.Bone()
    b.name = name
    b.position.fromArray(at)
    parent.add(b)
    bones.push(b)
    return b
  }
  for (const [s, sx] of [
    ['left', 1],
    ['right', -1],
  ] as const) {
    const arm = bone(`mixamorig:${s === 'left' ? 'Left' : 'Right'}ForeArm`, root, [
      sx * 0.3,
      1.4,
      0,
    ])
    const hand = bone(mixamoHandBone(s), arm, [sx * 0.25, 0, 0])
    for (let f = 0; f < 5; f++) {
      let parent: THREE.Object3D = hand
      for (let j = 0; j < 4; j++)
        parent = bone(
          mixamoFingerBone(s, f, j),
          parent,
          j ? [sx * 0.02, 0, 0] : [sx * 0.08, 0, (f - 1.5) * 0.02],
        )
    }
  }
  const position = new Float32Array(9 * 3)
  const skinIndex = new Uint16Array(9 * 4)
  const skinWeight = new Float32Array(9 * 4)
  const owners = [0, 0, 0, 1, 1, 1, 22, 22, 22] // left forearm, left hand, right forearm
  owners.forEach((b, v) => {
    position.set([v * 0.01, 1.4, 0], v * 3)
    skinIndex[v * 4] = b
    skinWeight[v * 4] = 1
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4))
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4))
  geometry.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8])
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial())
  root.add(mesh)
  root.updateMatrixWorld(true)
  mesh.bind(new THREE.Skeleton(bones))
  return { root, mesh }
}

describe('actor hands', () => {
  it('maps each actor to its hands, with the body colour slot', () => {
    expect(actorHandAssets({ kind: 'default', color: 'red' })).toEqual({
      model: '/avatar/prota/prota.hands.v3.low.glb',
      colors: { primary: '#c62828' },
    })
    expect(actorHandAssets({ kind: 'default', color: 'white' })).toEqual({
      model: '/avatar/prota/prota.hands.v3.low.glb',
    })
    expect(actorHandAssets({ kind: 'polibot', color: 'red' })).toEqual({
      model: '/avatar/polibot/polibot.glb',
    })
  })

  it('builds rigid phalanx pieces framed like the glove, curling toward the palm', () => {
    const { root } = rig()
    const hand = buildActorHand(root, 'left')!
    expect(hand).not.toBeNull()
    // Only the left-hand triangle is kept, as one unskinned piece on the palm.
    const pieces: THREE.Mesh[] = []
    hand.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) pieces.push(o as THREE.Mesh)
    })
    expect(pieces).toHaveLength(1)
    expect(pieces[0]).not.toBeInstanceOf(THREE.SkinnedMesh)
    expect(pieces[0].parent).toBe(hand.root)
    hand.root.updateMatrixWorld(true)
    const knuckle = hand.fingers[1][0].getWorldPosition(new THREE.Vector3())
    expect(knuckle.z).toBeLessThan(-0.03)
    expect(Math.abs(knuckle.y)).toBeLessThan(1e-5)
    const tip = () => hand.tip.getWorldPosition(new THREE.Vector3())
    const open = tip()
    poseActorHand(hand, 0, 1)
    hand.root.updateMatrixWorld(true)
    expect(tip().y).toBeLessThan(open.y - 0.01)
    expect(buildActorHand(new THREE.Group(), 'right')).toBeNull()
  })
})

/** Gepeto's real GLBs when the checkout has them (assets are not in every clone). */
describe.each([
  ['prota hands', 'assets/avatar/prota/prota.hands.v3.low.glb'],
  ['polibot body', 'assets/avatar/polibot/polibot.glb'],
])('actor hands from %s', (_, file) => {
  it.skipIf(!existsSync(file))('cuts both hands, palm-sized, palm on the grip', async () => {
    await MeshoptDecoder.ready
    const data = readFileSync(file)
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    const { scene } = await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .parseAsync(buffer, '')
    for (const side of ['left', 'right'] as const) {
      const hand = buildActorHand(scene, side)!
      expect(hand).not.toBeNull()
      hand.root.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(hand.root)
      let pieces = 0
      hand.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          pieces++
          expect(o).not.toBeInstanceOf(THREE.SkinnedMesh)
        }
      })
      // Palm plus most of the 15 phalanges as separate rigid pieces.
      expect(pieces).toBeGreaterThanOrEqual(10)
      const size = box.getSize(new THREE.Vector3())
      // A hand, not an arm or a body: under 30 cm each way, around the wrist, fingers toward -Z.
      expect(Math.max(size.x, size.y, size.z)).toBeLessThan(0.3)
      expect(box.min.z).toBeLessThan(-0.05)
      expect(box.max.z).toBeLessThan(0.1)
      const tip = hand.tip.getWorldPosition(new THREE.Vector3())
      expect(tip.z).toBeLessThan(-0.08)
      expect(Math.abs(tip.y)).toBeLessThan(0.06)
    }
  })
})
