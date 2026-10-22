/**
 * Pose of an item held by a character, in body space: the body root's frame (feet origin,
 * facing −Z, Y up). This pose is what every client shares: the item is placed from it and the
 * arm reaches it (two-bone IK), so the local player and everyone watching see the item in the
 * same place relative to the body. Web players derive it from the aim ({@link defaultHeldPose});
 * a headset will derive it from the controller.
 */
import * as THREE from 'three'
import type { PlayerBody } from './player-body.js'

export interface HeldPose {
  /** Grip position, metres, body space. */
  position: [number, number, number]
  /** Item orientation (x, y, z, w), body space; the item faces −Z like the body. */
  quaternion: [number, number, number, number]
}

/** Shoulder height and side offset of the default hold (m). */
export const HOLD_SHOULDER = { height: 1.4, side: 0.17, reach: 0.5 } as const
/** Furthest the default hold turns from the body's facing (rad). */
export const HOLD_MAX_YAW = 1.1

/**
 * Web default hold: one-handed, arm stretched from the shoulder along the aim. `yaw` is the aim
 * relative to the body's facing (rad, positive turns left), `pitch` up positive.
 */
export function defaultHeldPose(yaw: number, pitch: number, hand: 'left' | 'right' = 'right'): HeldPose {
  const y = THREE.MathUtils.clamp(Math.atan2(Math.sin(yaw), Math.cos(yaw)), -HOLD_MAX_YAW, HOLD_MAX_YAW)
  const p = THREE.MathUtils.clamp(pitch, -1.3, 1.3)
  const side = hand === 'right' ? HOLD_SHOULDER.side : -HOLD_SHOULDER.side
  const r = HOLD_SHOULDER.reach
  const dir = [-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)]
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p, y, 0, 'YXZ'))
  return {
    position: [side + dir[0] * r, HOLD_SHOULDER.height + dir[1] * r, dir[2] * r],
    quaternion: [q.x, q.y, q.z, q.w],
  }
}

const scratch = {
  m: new THREE.Matrix4(),
  p: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  s: new THREE.Vector3(1, 1, 1),
  parent: new THREE.Matrix4(),
}

/** World position and orientation of `pose` on `body` (after its last animate/apply). */
export function heldPoseWorld(
  body: PlayerBody,
  pose: HeldPose,
  position = new THREE.Vector3(),
  quaternion = new THREE.Quaternion(),
): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  body.root.updateWorldMatrix(true, false)
  scratch.m.compose(
    scratch.p.fromArray(pose.position),
    scratch.q.fromArray(pose.quaternion),
    scratch.s,
  )
  scratch.m.premultiply(body.root.matrixWorld)
  scratch.m.decompose(position, quaternion, scratch.s)
  scratch.s.set(1, 1, 1)
  return { position, quaternion }
}

/**
 * Put the hand on the held item: two-bone IK of `hand`'s arm to the pose's grip and, when given,
 * place `item` (any object; its parent may be anywhere in the scene) at the pose.
 */
export function holdItem(
  body: PlayerBody,
  pose: HeldPose,
  hand: 'left' | 'right' = 'right',
  item?: THREE.Object3D | null,
): void {
  const world = heldPoseWorld(body, pose)
  body.reachHand(hand, world.position)
  if (!item) return
  scratch.m.compose(world.position, world.quaternion, scratch.s)
  if (item.parent) {
    item.parent.updateWorldMatrix(true, false)
    scratch.parent.copy(item.parent.matrixWorld).invert()
    scratch.m.premultiply(scratch.parent)
  }
  scratch.m.decompose(item.position, item.quaternion, item.scale)
}
