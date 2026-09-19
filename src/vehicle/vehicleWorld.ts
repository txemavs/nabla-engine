/**
 * VehicleWorld — thin facade over VehicleSim + presentation.
 *
 * Handles heading flip (for 5×10 whose mesh proa is -Z) and provides
 * a clean API for driving.
 *
 * Pose: metres, Y up. Yaw degrees.
 */
import type { VehicleDebugFrame, VehicleInput, VehicleSnapshot, VehicleVec3 } from './vehicleDef.js'
import { VehicleSim, type VehicleSimOptions } from './vehicleSim.js'
import { parseVehicleSpec, type VehicleSpec } from './vehicleSpec.js'
import type { StaticBox } from './obstacleKit.js'

export interface DriveInput {
  throttle: number
  steer: number
  recover?: boolean
  handbrake?: boolean
  turbo?: boolean
}

export interface VehiclePose {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  roll: number
  qx: number
  qy: number
  qz: number
  qw: number
}

function presentPose(snap: VehicleSnapshot, modelFromBody: VehicleVec3): VehiclePose {
  const q = snap.body
  const qx = q.qx, qy = q.qy, qz = q.qz, qw = q.qw
  const mx = modelFromBody.x, my = modelFromBody.y, mz = modelFromBody.z
  const ix = qw * mx + qy * mz - qz * my
  const iy = qw * my + qz * mx - qx * mz
  const iz = qw * mz + qx * my - qy * mx
  const iw = -qx * mx - qy * my - qz * mz
  const rx = ix * qw + iw * (-qx) + iy * (-qz) - iz * (-qy)
  const ry = iy * qw + iw * (-qy) + iz * (-qx) - ix * (-qz)
  const rz = iz * qw + iw * (-qz) + ix * (-qy) - iy * (-qx)
  return {
    x: q.x + rx,
    y: q.y + ry,
    z: q.z + rz,
    yaw: snap.ypr.yaw,
    pitch: snap.ypr.pitch,
    roll: snap.ypr.roll,
    qx, qy, qz, qw,
  }
}

export class VehicleWorld {
  spec: VehicleSpec
  private readonly sim: VehicleSim

  constructor(spec?: VehicleSpec, options?: VehicleSimOptions) {
    this.spec = parseVehicleSpec(spec)
    this.sim = new VehicleSim(this.spec, options)
  }

  get world() {
    return this.sim.world
  }

  get mounted(): boolean {
    return this.sim.mounted
  }

  get snapshot(): VehicleSnapshot {
    return this.sim.lastSnapshot
  }

  get debug(): VehicleDebugFrame {
    return this.sim.lastDebug
  }

  mount(pose: { x: number; y: number; z: number; yaw: number }, spec?: VehicleSpec): void {
    if (spec) this.spec = parseVehicleSpec(spec)
    this.sim.mount(pose, this.spec)
  }

  applySpec(next: VehicleSpec, opts?: { defer?: boolean }): void {
    this.spec = parseVehicleSpec(next)
    this.sim.applySpec(this.spec, opts)
  }

  step(input: DriveInput, dt: number): VehiclePose {
    const flip = Math.abs(this.spec.headingDeg) >= 135
    const next: VehicleInput = {
      throttle: flip ? -input.throttle : input.throttle,
      steer: flip ? -input.steer : input.steer,
      recover: Boolean(input.recover),
      handbrake: Boolean(input.handbrake),
      turbo: Boolean(input.turbo),
    }
    const snap = this.sim.step(next, dt)
    return presentPose(snap, this.sim.def.modelFromBody)
  }

  readPose(): VehiclePose {
    return presentPose(this.sim.lastSnapshot, this.sim.def.modelFromBody)
  }

  forwardSpeed(): number {
    return this.sim.forwardSpeed()
  }

  recover(): void {
    this.sim.recover()
  }

  setStaticBoxes(boxes: StaticBox[]): void {
    this.sim.setStaticBoxes(boxes)
  }

  unmount(): void {
    this.sim.unmount()
  }

  dispose(): void {
    this.sim.dispose()
  }
}

export function createVehicleWorld(spec?: VehicleSpec, options?: VehicleSimOptions): VehicleWorld {
  return new VehicleWorld(spec, options)
}
