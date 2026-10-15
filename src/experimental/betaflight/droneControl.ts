// Adapted from txemavs/agency-ui 89b0907, by permission of the author.
/**
 * Flight policy: acro / angle / loiter / auton → mixer in / motor out.
 */
import {
  applyRates,
  clamp,
  clampUnit,
  mixMotors,
  type DroneInput,
  type FlightMode,
} from './droneDef.js'
import { hoverThrottle, type DronePid, type DroneSpec } from './droneSpec.js'

class Pid {
  i = 0
  prev = 0

  step(err: number, dt: number, g: DronePid, ilim = 2): number {
    this.i = clamp(this.i + err * dt * g.i, -ilim, ilim)
    const d = dt > 1e-6 ? (err - this.prev) / dt : 0
    this.prev = err
    return g.p * err + this.i + g.d * d
  }

  reset() {
    this.i = 0
    this.prev = 0
  }
}

export class DroneController {
  roll = new Pid()
  pitch = new Pid()
  yaw = new Pid()
  hold = { x: 0, y: 0.8, z: 0 }
  holding = false
  lastMode: FlightMode = 'angle'

  reset() {
    this.roll.reset()
    this.pitch.reset()
    this.yaw.reset()
    this.holding = false
  }

  motors(
    input: DroneInput,
    spec: DroneSpec,
    state: {
      roll: number
      pitch: number
      yaw: number
      wx: number
      wy: number
      wz: number
      x: number
      y: number
      z: number
      vx: number
      vy: number
      vz: number
    },
    dt: number,
  ): [number, number, number, number] {
    if (input.mode !== this.lastMode) {
      this.holding = false
      this.lastMode = input.mode
    }

    let mode = input.mode
    if (mode === 'auton' && (Math.abs(input.roll) > 0.18 || Math.abs(input.pitch) > 0.18)) {
      mode = 'loiter'
    }

    const hover = clamp(hoverThrottle(spec) + spec.hoverBoost, 0.15, 0.85)
    let throttle = input.throttle
    let rollCmd = 0
    let pitchCmd = 0
    let yawCmd = 0

    if (mode === 'acro') {
      const wr = applyRates(input.roll, spec.rcRate, spec.expo, spec.superRate)
      const wp = applyRates(-input.pitch, spec.rcRate, spec.expo, spec.superRate)
      const wy = applyRates(input.yaw, spec.rcRate, spec.expo, spec.superRate)
      rollCmd = this.roll.step(wr - state.wz, dt, spec.rollPid)
      pitchCmd = this.pitch.step(wp - state.wx, dt, spec.pitchPid)
      yawCmd = this.yaw.step(wy - state.wy, dt, spec.yawPid)
    } else {
      let wantRoll = 0
      let wantPitch = 0
      let climb = (input.throttle - 0.5) * 6

      if (mode === 'angle') {
        const max = (spec.maxAngle * Math.PI) / 180
        wantRoll = clampUnit(input.roll) * max
        wantPitch = clampUnit(-input.pitch) * max
        throttle = hover + (input.throttle - 0.5) * 0.45
      } else {
        const stick = Math.hypot(input.roll, input.pitch)
        if (mode === 'auton' && input.waypoint) {
          const dx = input.waypoint.x - state.x
          const dz = input.waypoint.z - state.z
          const dy = input.waypoint.y - state.y
          const dist = Math.hypot(dx, dz)
          const speed = clamp(dist * spec.posP, 0, 8)
          const inv = dist > 0.05 ? speed / dist : 0
          const tvx = dx * inv
          const tvz = dz * inv
          climb = clamp(dy * spec.altP, -3, 3)
          wantRoll = clamp((tvx - state.vx) * spec.velP * 0.12, -0.7, 0.7)
          wantPitch = clamp((tvz - state.vz) * spec.velP * 0.12, -0.7, 0.7)
          if (input.lookAt) {
            const lx = input.lookAt.x - state.x
            const lz = input.lookAt.z - state.z
            const wantYaw = (Math.atan2(lx, lz) * 180) / Math.PI
            let err = wantYaw - state.yaw
            if (err > 180) err -= 360
            if (err < -180) err += 360
            yawCmd = this.yaw.step((err * Math.PI) / 180 - state.wy, dt, spec.yawPid)
          }
          if (dist < 0.45 && Math.abs(dy) < 0.35) {
            this.hold = { x: input.waypoint.x, y: input.waypoint.y, z: input.waypoint.z }
            this.holding = true
          }
        } else {
          if (stick < 0.08 && Math.abs(input.throttle - 0.5) < 0.08) {
            if (!this.holding) {
              this.hold = { x: state.x, y: state.y, z: state.z }
              this.holding = true
            }
            wantRoll = clamp(
              (this.hold.x - state.x) * spec.posP * 0.18 - state.vx * spec.velP * 0.14,
              -0.55,
              0.55,
            )
            wantPitch = clamp(
              (this.hold.z - state.z) * spec.posP * 0.18 - state.vz * spec.velP * 0.14,
              -0.55,
              0.55,
            )
            climb = clamp((this.hold.y - state.y) * spec.altP - state.vy * 0.8, -2.5, 2.5)
          } else {
            this.holding = false
            const yawR = (state.yaw * Math.PI) / 180
            const fx = Math.sin(yawR)
            const fz = Math.cos(yawR)
            const rx = Math.cos(yawR)
            const rz = -Math.sin(yawR)
            const tvx = rx * input.roll * 6 + fx * input.pitch * 6
            const tvz = rz * input.roll * 6 + fz * input.pitch * 6
            wantRoll = clamp((tvx - state.vx) * spec.velP * 0.12, -0.7, 0.7)
            wantPitch = clamp((tvz - state.vz) * spec.velP * 0.12, -0.7, 0.7)
          }
        }
        throttle = hover + climb * 0.06
      }

      const wr = (wantRoll - (state.roll * Math.PI) / 180) * spec.angleP
      const wp = (wantPitch - (state.pitch * Math.PI) / 180) * spec.angleP
      rollCmd = this.roll.step(wr - state.wz, dt, spec.rollPid)
      pitchCmd = this.pitch.step(wp - state.wx, dt, spec.pitchPid)
      if (mode !== 'auton' || !input.lookAt) {
        const wy = applyRates(input.yaw, spec.rcRate * 0.6, spec.expo, spec.superRate * 0.4)
        yawCmd = this.yaw.step(wy - state.wy, dt, spec.yawPid)
      }
    }

    if (mode === 'acro' && !spec.airMode && throttle < 0.04) {
      return [0, 0, 0, 0]
    }
    const motors = mixMotors(throttle, rollCmd, pitchCmd, yawCmd, spec.mixer)
    return motors.map((m) => Math.max(spec.idle, m)) as [number, number, number, number]
  }
}
