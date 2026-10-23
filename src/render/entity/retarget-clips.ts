/**
 * Per-skeleton clip retargeting for Mixamo-named rigs (Nabla Engine, three.js r186).
 *
 * The shared locomotion clips (`avatar.anims.glb`, Quaternius on the mannequin skeleton) store
 * local bone rotations plus one Hips translation in metres of the mannequin. Played as-is on a
 * character with other proportions (e.g. a Tripo rig), the hips sit at the mannequin's height
 * and the feet sink into or float above the floor. This module adapts the clips once per model:
 *
 * - Quaternion tracks are kept (bone directions are what the clip is about). Optionally, when a
 *   bone's rest rotation differs from the mannequin's by more than a threshold, the track is
 *   corrected with q' = restT · inv(restS) · q.
 * - The Hips position track is rescaled to the target. Default mode 'leg' (recommended): with
 *   leg = restHipsY − restAnkleY (ankle = Foot bone) and k = legTarget / legSource,
 *   y' = ankleT + k · (y − ankleS), x' = k · x, z' = k · z (in root space). Mode 'hips' is the
 *   plain ratio k = hipsHeightTarget / hipsHeightSource applied to X, Y and Z. 'leg' is exact
 *   for the rest pose and keeps soles on the floor when ankles sit at different heights.
 * - Position tracks on any other bone are dropped (the target keeps its own bone lengths);
 *   scale tracks are dropped too.
 * - Bone names are matched across the prefix variants `mixamorig:`, `mixamorig` and
 *   `mixamorig_` (GLTFLoader sanitises ':' away, so `mixamorig:Hips` becomes `mixamorigHips`).
 *
 * No dependency beyond three.
 */
import * as THREE from 'three'

export interface RetargetOptions {
  /** Hips bone name without prefix. Default 'Hips'. */
  hipsName?: string
  /**
   * Apply the per-bone rest correction when the rest rotations of source and target differ by
   * more than this angle (radians). Default: Infinity (never; the Tripo/Mixamo rigs share rests).
   */
  restCorrectionThreshold?: number
  /** How the Hips translation is rescaled; see the module doc. Default 'leg'. */
  hipsMode?: 'leg' | 'hips'
  /** Override k (target / source). Default: measured from the rest poses. */
  hipsScale?: number
  /** Suffix added to the clip names. Default '' (names stay equal so findByName keeps working). */
  nameSuffix?: string
}

const PREFIX = /^mixamorig[:_]?/

/** Bone name without its Mixamo prefix: 'mixamorig:LeftFoot' | 'mixamorigLeftFoot' → 'LeftFoot'. */
export function canonicalBoneName(name: string): string {
  return name.replace(PREFIX, '')
}

/** Map canonical bone name → bone for every Bone (or named Object3D) under `root`. */
function boneMap(root: THREE.Object3D): Map<string, THREE.Object3D> {
  const map = new Map<string, THREE.Object3D>()
  root.traverse((o) => {
    if (!o.name) return
    const key = canonicalBoneName(o.name)
    // Prefer real bones over same-named helper nodes.
    if (!map.has(key) || ((o as THREE.Bone).isBone && !(map.get(key) as THREE.Bone).isBone))
      map.set(key, o)
  })
  return map
}

/**
 * Hips height above the root's origin in the rest pose, in the root's own units (root's own
 * transform ignored, i.e. "world at scale 1"). Assumes the rest pose is the current pose.
 */
export function restHipsHeight(root: THREE.Object3D, hipsName = 'Hips'): number {
  const hips = boneMap(root).get(hipsName)
  if (!hips) throw new Error(`retarget: no ${hipsName} bone`)
  root.updateWorldMatrix(true, true)
  const p = hips.getWorldPosition(new THREE.Vector3())
  return root.worldToLocal(p).y
}

/** Matrix from the hips' parent space to the root's space (where the Hips track values live). */
function parentToRoot(root: THREE.Object3D, hips: THREE.Object3D): THREE.Matrix4 {
  root.updateWorldMatrix(true, true)
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  return new THREE.Matrix4().multiplyMatrices(rootInv, hips.parent!.matrixWorld)
}

/** Mean rest height of the LeftFoot/RightFoot bone origins (the ankles), in root space. */
export function restAnkleHeight(root: THREE.Object3D): number {
  const bones = boneMap(root)
  root.updateWorldMatrix(true, true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const ys: number[] = []
  for (const n of ['LeftFoot', 'RightFoot']) {
    const b = bones.get(n)
    if (b) ys.push(b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).y)
  }
  if (!ys.length) throw new Error('retarget: no LeftFoot/RightFoot bone')
  return ys.reduce((a, b) => a + b, 0) / ys.length
}

/**
 * Adapt `clips` (authored on `sourceRoot`, the mannequin) to `targetRoot`. Both roots must be in
 * their rest/bind pose. Returns new clips; the inputs are not modified. Tracks are renamed to the
 * target's node names, so they bind regardless of the prefix variant each file uses.
 */
export function retargetClipsForModel(
  clips: readonly THREE.AnimationClip[],
  sourceRoot: THREE.Object3D,
  targetRoot: THREE.Object3D,
  opts: RetargetOptions = {},
): THREE.AnimationClip[] {
  const hipsName = opts.hipsName ?? 'Hips'
  const threshold = opts.restCorrectionThreshold ?? Infinity
  const src = boneMap(sourceRoot)
  const tgt = boneMap(targetRoot)
  const srcHips = src.get(hipsName)
  const tgtHips = tgt.get(hipsName)
  if (!srcHips || !tgtHips) throw new Error(`retarget: ${hipsName} missing in source or target`)

  // Everything is measured in each root's own space (root transform ignored).
  const hS = restHipsHeight(sourceRoot, hipsName)
  const hT = restHipsHeight(targetRoot, hipsName)
  const mode = opts.hipsMode ?? 'leg'
  const aS = mode === 'leg' ? restAnkleHeight(sourceRoot) : 0
  const aT = mode === 'leg' ? restAnkleHeight(targetRoot) : 0
  const k = opts.hipsScale ?? (hT - aT) / (hS - aS)
  // Track values live in each hips parent's space: parent → root (source), root → parent (target).
  const srcParent = parentToRoot(sourceRoot, srcHips)
  const tgtParentInv = parentToRoot(targetRoot, tgtHips).invert()
  const p = new THREE.Vector3()
  const mapHips = (v: ArrayLike<number> & { [i: number]: number }, i: number) => {
    p.fromArray(v as number[], i).applyMatrix4(srcParent)
    p.set(k * p.x, aT + k * (p.y - aS), k * p.z).applyMatrix4(tgtParentInv)
    p.toArray(v as number[], i)
  }

  const restS = new THREE.Quaternion()
  const restT = new THREE.Quaternion()
  const q = new THREE.Quaternion()

  return clips.map((clip) => {
    const tracks: THREE.KeyframeTrack[] = []
    for (const track of clip.tracks) {
      const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name)
      const key = canonicalBoneName(nodeName)
      const target = tgt.get(key)
      if (!target) continue // bone absent on this rig (e.g. extra finger joints)
      const name = `${target.name}.${propertyName}`

      if (propertyName === 'quaternion') {
        const t = track.clone()
        t.name = name
        const source = src.get(key)
        if (source && threshold !== Infinity) {
          restS.copy(source.quaternion)
          restT.copy(target.quaternion)
          if (restS.angleTo(restT) > threshold) {
            // q' = restT * inv(restS) * q
            const corr = restT.clone().multiply(restS.clone().invert())
            const v = t.values
            for (let i = 0; i < v.length; i += 4) {
              q.fromArray(v, i).premultiply(corr).toArray(v, i)
            }
          }
        }
        tracks.push(t)
      } else if (propertyName === 'position' && key === hipsName) {
        const t = track.clone()
        t.name = name
        const v = t.values
        for (let i = 0; i < v.length; i += 3) mapHips(v, i)
        tracks.push(t)
      }
      // Other position tracks and all scale tracks are dropped on purpose.
    }
    return new THREE.AnimationClip(
      clip.name + (opts.nameSuffix ?? ''),
      clip.duration,
      tracks,
      clip.blendMode,
    )
  })
}

const cache = new Map<string, THREE.AnimationClip[]>()

/**
 * Cached {@link retargetClipsForModel} (+ optional {@link groundClips}): computed once per model
 * URL and shared by every instance (SkeletonUtils clones keep the same bone names, so the clips
 * bind to all of them). `targetRoot` must be in rest pose (e.g. the rig's un-cloned source scene).
 */
export function getRetargetedClips(
  modelUrl: string,
  clips: readonly THREE.AnimationClip[],
  sourceRoot: THREE.Object3D,
  targetRoot: THREE.Object3D,
  opts?: RetargetOptions & { ground?: boolean | GroundClipsOptions },
): THREE.AnimationClip[] {
  let out = cache.get(modelUrl)
  if (!out) {
    out = retargetClipsForModel(clips, sourceRoot, targetRoot, opts)
    if (opts?.ground) groundClips(out, targetRoot, opts.ground === true ? {} : opts.ground)
    cache.set(modelUrl, out)
  }
  return out
}

/** Forget cached clips (one URL, or all). */
export function clearRetargetCache(modelUrl?: string): void {
  if (modelUrl === undefined) cache.clear()
  else cache.delete(modelUrl)
}

/**
 * Lowest Y (root space) of the skinned vertices, in the current pose. Exact but O(vertices); use
 * at load time, not per frame.
 */
export function lowestSkinnedY(
  root: THREE.Object3D,
  only?: Map<THREE.SkinnedMesh, number[]>,
): number {
  // updateMatrixWorld (not updateWorldMatrix): SkinnedMesh refreshes bindMatrixInverse there.
  root.updateWorldMatrix(true, false)
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const v = new THREE.Vector3()
  let min = Infinity
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    const subset = only?.get(mesh)
    if (only && !subset) return
    mesh.skeleton.update() // bone matrices are otherwise only refreshed at render time
    const pos = mesh.geometry.attributes.position
    const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)
    const n = subset ? subset.length : pos.count
    for (let j = 0; j < n; j++) {
      const i = subset ? subset[j] : j
      mesh.getVertexPosition(i, v)
      v.applyMatrix4(m)
      if (v.y < min) min = v.y
    }
  })
  return min
}

/**
 * Shift `root` vertically so the lowest foot/toe point sits at y = 0 in the current pose.
 * Uses the bone origins of `footBoneNames` (prefix-agnostic) plus `soleOffset` (distance from
 * the lowest bone origin to the sole, measured in rest), or, when `exact` is true, the skinned
 * vertices. Returns the applied offset.
 */
export function groundFeet(
  root: THREE.Object3D,
  footBoneNames: readonly string[] = [
    'LeftFoot',
    'RightFoot',
    'LeftToeBase',
    'RightToeBase',
    'LeftToe_End',
    'RightToe_End',
  ],
  opts: { exact?: boolean; soleOffset?: number } = {},
): number {
  let low: number
  if (opts.exact) {
    low = lowestSkinnedY(root) - root.position.y
  } else {
    const bones = boneMap(root)
    root.updateWorldMatrix(true, true)
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
    const p = new THREE.Vector3()
    low = Infinity
    for (const n of footBoneNames) {
      const b = bones.get(canonicalBoneName(n))
      if (!b) continue
      b.getWorldPosition(p).applyMatrix4(inv)
      low = Math.min(low, p.y)
    }
    if (low === Infinity) return 0
    low -= opts.soleOffset ?? 0
  }
  root.position.y -= low
  root.updateWorldMatrix(false, true)
  return -low
}

/** Vertices weighted (> 0.1) to a foot/toe bone, per skinned mesh: the only ones that can touch the floor. */
export function footVertices(root: THREE.Object3D): Map<THREE.SkinnedMesh, number[]> {
  const out = new Map<THREE.SkinnedMesh, number[]>()
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    const feet = new Set<number>()
    mesh.skeleton.bones.forEach((b, i) => {
      if (/(Foot|Toe)/.test(canonicalBoneName(b.name))) feet.add(i)
    })
    const si = mesh.geometry.attributes.skinIndex
    const sw = mesh.geometry.attributes.skinWeight
    const list: number[] = []
    for (let i = 0; i < si.count; i++)
      for (let k = 0; k < 4; k++)
        if (feet.has(si.getComponent(i, k)) && sw.getComponent(i, k) > 0.1) {
          list.push(i)
          break
        }
    if (list.length) out.set(mesh, list)
  })
  return out
}

/** Clips that should keep a foot on the floor; used by {@link groundClips}. */
export const GROUNDED_CLIPS = ['idle', 'walk', 'run', 'crouch_idle', 'crouch_walk'] as const

export interface GroundClipsOptions {
  /** Clip names to calibrate. Default {@link GROUNDED_CLIPS}. */
  names?: readonly string[]
  /** Height left between the lowest point and the floor, metres. Default 0.002. */
  clearance?: number
  /** Samples per clip. Default 60. */
  samples?: number
  /** Largest correction applied, metres. Default 0.06. */
  maxShift?: number
  /** Hips bone name without prefix. Default 'Hips'. */
  hipsName?: string
}

/**
 * Per-clip ground calibration (optional, load time). For each named clip, samples the clip on
 * `targetRoot`, finds the lowest skinned vertex and shifts the Hips track vertically so that
 * point lands on y = 0. Fixes the residual error left by {@link retargetClipsForModel} when
 * the feet/soles of the target differ in shape from the mannequin's. Modifies `clips` in place
 * and returns the applied shift per clip (metres). `targetRoot` is restored to its pose.
 * Cost: samples × skinned vertices per clip (only foot/toe-weighted vertices are skinned).
 */
export function groundClips(
  clips: THREE.AnimationClip[],
  targetRoot: THREE.Object3D,
  opts: GroundClipsOptions = {},
): Record<string, number> {
  const names = opts.names ?? GROUNDED_CLIPS
  const samples = opts.samples ?? 60
  const clearance = opts.clearance ?? 0.002
  const feet = footVertices(targetRoot)
  const maxShift = opts.maxShift ?? 0.06
  const hips = boneMap(targetRoot).get(opts.hipsName ?? 'Hips')
  if (!hips) throw new Error('groundClips: no Hips bone')
  const saved: [THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3][] = []
  targetRoot.traverse((o) =>
    saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]),
  )
  const toRoot = parentToRoot(targetRoot, hips)
  const fromRoot = toRoot.clone().invert()
  const mixer = new THREE.AnimationMixer(targetRoot)
  const out: Record<string, number> = {}
  const p = new THREE.Vector3()
  for (const clip of clips) {
    if (!names.includes(clip.name)) continue
    const action = mixer.clipAction(clip)
    action.reset().play()
    let min = Infinity
    for (let i = 0; i < samples; i++) {
      mixer.setTime((clip.duration * i) / samples)
      min = Math.min(
        min,
        lowestSkinnedY(targetRoot, feet.size ? feet : undefined) - targetRoot.position.y,
      )
    }
    action.stop()
    mixer.uncacheClip(clip)
    const shift = THREE.MathUtils.clamp(clearance - min, -maxShift, maxShift)
    const track = clip.tracks.find((t) => t.name === `${hips.name}.position`)
    if (!track || !Number.isFinite(shift)) continue
    const v = track.values
    for (let i = 0; i < v.length; i += 3) {
      p.fromArray(v, i).applyMatrix4(toRoot)
      p.y += shift
      p.applyMatrix4(fromRoot).toArray(v, i)
    }
    out[clip.name] = shift
  }
  mixer.uncacheRoot(targetRoot)
  for (const [o, pos, q, s] of saved) {
    o.position.copy(pos)
    o.quaternion.copy(q)
    o.scale.copy(s)
  }
  targetRoot.updateMatrixWorld(true)
  return out
}
