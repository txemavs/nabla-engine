/**
 * Best-effort cinematic after two barrel rolls / flips in under one second.
 * Hold a still shot looking slightly ahead of the flight, then a short drone orbit,
 * then restore the previous camera mode. Only triggers from the first-person (cockpit) view.
 *
 * Fires only when the camera was the seated driver view (`cockpit`) at flip time, never from
 * the exterior, overhead or the C-cycle `cinematic` drone view (#127), which it complements.
 * Pressing C during the shot keeps the player's new choice instead of restoring the old view.
 * Toggleable: Ajustes → Opciones → Cámara "Cámara cinematográfica al volcar", localStorage
 * nabla.flipCinematic, boot `flipCinematic`, or URL ?flipcam=0 / ?flipCinematic=0.
 */
import * as THREE from 'three'
import type { GameCameraState } from './game-camera.js'

export type FlipCinematicPhase = 'idle' | 'hold' | 'orbit'

type Restore = {
  mode: GameCameraState['mode']
  firstPerson: boolean
  yaw: number
  pitch: number
}

const TWO_ROLLS = Math.PI * 4
const WINDOW_MS = 1000
const HOLD_MS = 1800
const ORBIT_MS = 2200
const ORBIT_RADIUS = 14
const ORBIT_HEIGHT = 5
const LOOK_AHEAD = 18

/** Seated first-person view: the driver/cockpit camera. */
export function isFirstPerson(state: Pick<GameCameraState, 'mode'>): boolean {
  return state.mode === 'cockpit'
}

export class FlipCinematic {
  phase: FlipCinematicPhase = 'idle'
  /** Host/menu can disable; default on. */
  enabled = true
  private rollAcc = 0
  private windowStart = 0
  private phaseStart = 0
  private restore: Restore | null = null
  private holdCam = new THREE.Vector3()
  private holdLook = new THREE.Vector3()
  private orbitAngle0 = 0
  private lastUp = new THREE.Vector3(0, 1, 0)
  private prevQuat: THREE.Quaternion | null = null

  /** Call each frame while seated. Returns true while cinematic owns the camera. */
  update(
    now: number,
    dt: number,
    seated: boolean,
    body: {
      position: { x: number; y: number; z: number }
      quaternion: { x: number; y: number; z: number; w: number }
      linvel: () => { x: number; y: number; z: number }
      angvel: () => { x: number; y: number; z: number }
      /**
       * Tilt from the vertical that is intended lean, not a roll (a motorcycle's fall
       * threshold, radians). Roll rate inside it never counts towards the flip trigger.
       */
      leanAllowance?: number
    } | null,
    camera: THREE.PerspectiveCamera,
    state: GameCameraState,
  ): boolean {
    if (!this.enabled) {
      if (this.phase !== 'idle') this.finish(state)
      this.rollAcc = 0
      this.prevQuat = null
      return false
    }
    if (!seated || !body) {
      if (this.phase !== 'idle') this.finish(state)
      this.rollAcc = 0
      return false
    }

    const q = new THREE.Quaternion(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w,
    )
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q)
    const ang = body.angvel()
    const angV = new THREE.Vector3(ang.x, ang.y, ang.z)
    let rollRate = Math.abs(angV.dot(forward))
    // When host cannot expose angvel, estimate roll rate from quaternion delta.
    const qNow = q.clone()
    if (this.prevQuat && rollRate < 1e-3 && dt > 1e-4) {
      const delta = this.prevQuat.clone().invert().multiply(qNow)
      const w = Math.min(1, Math.max(-1, delta.w))
      const angle = 2 * Math.acos(w)
      const axis = new THREE.Vector3(delta.x, delta.y, delta.z)
      if (axis.lengthSq() > 1e-8) {
        axis.normalize()
        rollRate = Math.abs((angle / dt) * axis.dot(forward))
      }
    }
    this.prevQuat = qNow
    // Leaning a two-wheeler in and out of corners is riding, not a barrel roll.
    if (body.leanAllowance && up.y > Math.cos(body.leanAllowance)) rollRate = 0
    const upFlip = this.lastUp.dot(up) < -0.15 ? Math.PI : 0
    this.lastUp.copy(up)

    if (this.phase === 'idle') {
      // Only arm from the first-person (driver/cockpit) view; chase/map cameras never trigger it.
      if (!isFirstPerson(state)) {
        this.rollAcc = 0
        this.windowStart = now
        return false
      }
      if (now - this.windowStart > WINDOW_MS) {
        this.windowStart = now
        this.rollAcc = 0
      }
      this.rollAcc += rollRate * dt + upFlip * 0.35
      if (this.rollAcc >= TWO_ROLLS) {
        // Only celebrate flips done from the cockpit / first-person seat — never chase or map.
        if (state.mode === 'cockpit') {
          this.begin(now, body, state, forward)
        } else {
          this.rollAcc = 0
          this.windowStart = now
        }
      }
      return false
    }

    // The player cycled the camera (C) mid-shot: hand the camera back immediately.
    if (state.mode !== 'chase') {
      this.finish(state)
      return false
    }

    const pos = new THREE.Vector3(body.position.x, body.position.y, body.position.z)
    const vel = body.linvel()
    const v = new THREE.Vector3(vel.x, vel.y, vel.z)
    if (v.lengthSq() < 1) v.copy(forward).multiplyScalar(12)
    const ahead = pos.clone().add(v.clone().normalize().multiplyScalar(LOOK_AHEAD))

    if (this.phase === 'hold') {
      camera.position.copy(this.holdCam)
      camera.up.set(0, 1, 0)
      camera.lookAt(this.holdLook)
      if (now - this.phaseStart >= HOLD_MS) {
        this.phase = 'orbit'
        this.phaseStart = now
        this.orbitAngle0 = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z)
      }
      return true
    }

    const t = Math.min(1, (now - this.phaseStart) / ORBIT_MS)
    const angOrbit = this.orbitAngle0 + t * Math.PI * 1.25
    camera.position.set(
      pos.x + Math.sin(angOrbit) * ORBIT_RADIUS,
      pos.y + ORBIT_HEIGHT + Math.sin(t * Math.PI) * 2,
      pos.z + Math.cos(angOrbit) * ORBIT_RADIUS,
    )
    camera.up.set(0, 1, 0)
    camera.lookAt(ahead)
    if (now - this.phaseStart >= ORBIT_MS) {
      this.finish(state)
      return false
    }
    return true
  }

  private begin(
    now: number,
    body: {
      position: { x: number; y: number; z: number }
      linvel: () => { x: number; y: number; z: number }
    },
    state: GameCameraState,
    forward: THREE.Vector3,
  ): void {
    this.restore = {
      mode: state.mode,
      firstPerson: state.firstPerson,
      yaw: state.yaw,
      pitch: state.pitch,
    }
    this.phase = 'hold'
    this.phaseStart = now
    this.rollAcc = 0
    this.windowStart = now
    const pos = new THREE.Vector3(body.position.x, body.position.y, body.position.z)
    const vel = body.linvel()
    const v = new THREE.Vector3(vel.x, vel.y, vel.z)
    if (v.lengthSq() < 1) v.copy(forward).multiplyScalar(16)
    const dir = v.clone().normalize()
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
    if (side.lengthSq() < 0.1) side.set(1, 0, 0)
    this.holdLook.copy(pos).add(dir.clone().multiplyScalar(LOOK_AHEAD))
    this.holdCam
      .copy(pos)
      .add(side.multiplyScalar(10))
      .add(new THREE.Vector3(0, 6, 0))
      .add(dir.clone().multiplyScalar(-4))
    state.mode = 'chase'
    state.firstPerson = false
  }

  private finish(state: GameCameraState): void {
    // Restore only if the shot still owns the mode; a C press meanwhile wins.
    if (this.restore && state.mode === 'chase') {
      state.mode = this.restore.mode
      state.firstPerson = this.restore.firstPerson
      state.yaw = this.restore.yaw
      state.pitch = this.restore.pitch
    }
    this.restore = null
    this.phase = 'idle'
    this.rollAcc = 0
  }
}
