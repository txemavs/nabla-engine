import * as THREE from 'three'
import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  canonicalBoneName,
  clearRetargetCache,
  getRetargetedClips,
  groundFeet,
  retargetClipsForModel,
} from '../../src/render/entity/retarget-clips.js'

// Synthetic two-bone-leg rigs: the shared clips are remapped per skeleton (hips by leg length).
describe('retarget-clips', () => {
  it('remaps hips, keeps rotations, renames bones, caches per URL and grounds feet', () => {
    function rig(prefix: string, hips: number, ankle: number): THREE.Group {
      const root = new THREE.Group()
      const arm = new THREE.Object3D()
      arm.name = 'Armature'
      arm.scale.setScalar(0.01)
      root.add(arm) // FBX-style cm armature
      const b = (n: string, y: number, parent: THREE.Object3D) => {
        const o = new THREE.Bone()
        o.name = prefix + n
        o.position.y = y
        parent.add(o)
        return o
      }
      const h = b('Hips', hips * 100, arm)
      const half = -(hips - ankle) * 50 // cm, two equal segments per leg
      for (const side of ['Left', 'Right'])
        b(side + 'Foot', half, b(side + 'Leg', half, b(side + 'UpLeg', 0, h)))
      root.updateMatrixWorld(true)
      return root
    }
    const src = rig('mixamorig', 0.97, 0.09) // three-sanitised names
    const tgt = rig('mixamorig_', 1.01, 0.14) // other variant
    const clip = new THREE.AnimationClip('walk', 1, [
      new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 97, 0, 10, 95, 0]),
      new THREE.QuaternionKeyframeTrack(
        'mixamorigLeftLeg.quaternion',
        [0, 1],
        [0, 0, 0, 1, 0.1, 0, 0, 0.995],
      ),
      new THREE.VectorKeyframeTrack('mixamorigLeftLeg.position', [0, 1], [0, 1, 0, 0, 1, 0]),
      new THREE.VectorKeyframeTrack('mixamorigLeftLeg.scale', [0, 1], [1, 1, 1, 1, 1, 1]),
      new THREE.QuaternionKeyframeTrack('mixamorigLeftHandPinky4.quaternion', [0], [0, 0, 0, 1]),
    ])

    assert.equal(canonicalBoneName('mixamorig:Hips'), 'Hips')
    assert.equal(canonicalBoneName('mixamorigHips'), 'Hips')
    assert.equal(canonicalBoneName('mixamorig_Hips'), 'Hips')

    const [out] = retargetClipsForModel([clip], src, tgt)
    const names = out.tracks.map((t) => t.name).sort()
    assert.deepEqual(
      names,
      ['mixamorig_Hips.position', 'mixamorig_LeftLeg.quaternion'],
      'only hips position + rotations, renamed, missing bones skipped',
    )
    const k = (1.01 - 0.14) / (0.97 - 0.09)
    const hp = out.tracks.find((t) => t.name.endsWith('position'))!.values
    // y' = aT + k (y - aS), in cm (parent scale 0.01 on both sides)
    assert.ok(Math.abs(hp[1] - (14 + k * (97 - 9))) < 1e-3, 'hips Y leg mapping')
    assert.ok(Math.abs(hp[3] - k * 10) < 1e-3, 'hips X scaled by k')
    assert.deepEqual(
      Array.from(out.tracks.find((t) => t.name.endsWith('quaternion'))!.values),
      Array.from(clip.tracks[1].values),
      'rotations untouched',
    )
    assert.equal(clip.tracks[0].values[1], 97, 'input clip not modified')

    // 'hips' mode: plain ratio
    const [plain] = retargetClipsForModel([clip], src, tgt, { hipsMode: 'hips' })
    assert.ok(Math.abs(plain.tracks[0].values[1] - 97 * (1.01 / 0.97)) < 1e-3, 'hips ratio mode')

    // rest correction: target LeftLeg rest rotated 90° about X
    const tgt2 = rig('mixamorig:', 1.01, 0.14)
    const leg = tgt2.getObjectByName('mixamorig:LeftLeg')!
    leg.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
    const [corr] = retargetClipsForModel([clip], src, tgt2, { restCorrectionThreshold: 0.01 })
    const q0 = new THREE.Quaternion().fromArray(
      corr.tracks.find((t) => t.name.endsWith('quaternion'))!.values,
      0,
    )
    assert.ok(q0.angleTo(leg.quaternion) < 1e-3, "q' = restT·inv(restS)·q at identity source key")

    // cache
    clearRetargetCache()
    const a = getRetargetedClips('a.glb', [clip], src, tgt)
    assert.equal(getRetargetedClips('a.glb', [clip], src, tgt2), a, 'cached per URL')
    assert.notEqual(getRetargetedClips('b.glb', [clip], src, tgt), a)

    // groundFeet on bone origins
    const g = rig('mixamorig', 1, 0.1)
    const d = groundFeet(g, ['LeftFoot', 'RightFoot'])
    assert.ok(
      Math.abs(d + 0.1) < 1e-6 && Math.abs(g.position.y + 0.1) < 1e-6,
      'groundFeet moves ankles to y=0',
    )
  })
})
