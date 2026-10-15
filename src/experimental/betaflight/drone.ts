import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat/rapier.es.js'
import type { RigidBody } from '@dimforge/rapier3d-compat'
import type { World } from '../../simulation/physics.js'
import { DroneController } from './droneControl.js'
import {
  emptyDroneSnapshot,
  mode2Channels,
  clamp,
  parseFlightMode,
  type DroneInput,
} from './droneDef.js'
import { DEFAULT_DRONE_SPEC, parseDroneSpec, type DroneSpec } from './droneSpec.js'

/** Agency flight controller, with rigid bodies and contacts owned by Engine's world.
 * Body axes: +X right, +Y up, +Z nose. SI units, independent of the display mode.
 * The host calls beforeStep exactly once before each World.step; this never steps it.
 */
export class BetaflightDrone {
  readonly body: RigidBody
  readonly controller = new DroneController()
  readonly spec: DroneSpec
  snapshot = emptyDroneSnapshot()
  private disposed = false
  private rotation = new THREE.Quaternion()
  private euler = new THREE.Euler(0, 0, 0, 'YXZ')
  private omega = new THREE.Vector3()
  private up = new THREE.Vector3()
  private torque = new THREE.Vector3()
  constructor(
    readonly world: World,
    position: THREE.Vector3,
    spec: DroneSpec = DEFAULT_DRONE_SPEC,
  ) {
    if (![position.x, position.y, position.z].every(Number.isFinite))
      throw new RangeError('Drone position must be finite')
    this.spec = parseDroneSpec(spec)
    this.body = world.raw.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinearDamping(this.spec.drag)
        .setAngularDamping(this.spec.angDrag)
        .setCcdEnabled(true),
    )
    // The footprint includes the arms: no separate floor or room collision implementation.
    world.raw.createCollider(
      RAPIER.ColliderDesc.cuboid(this.spec.arm, 0.025, this.spec.arm)
        .setMass(this.spec.mass)
        .setFriction(0.65)
        .setRestitution(0.12),
      this.body,
    )
  }
  beforeStep(input: DroneInput, dt: number): void {
    if (this.disposed || !Number.isFinite(dt) || dt <= 0) return
    const valid = [input.roll, input.pitch, input.yaw, input.throttle].every(Number.isFinite)
    input = valid
      ? {
          ...input,
          roll: clamp(input.roll, -1, 1),
          pitch: clamp(input.pitch, -1, 1),
          yaw: clamp(input.yaw, -1, 1),
          throttle: clamp(input.throttle, 0, 1),
          mode: parseFlightMode(input.mode),
        }
      : { arm: false, mode: 'angle', roll: 0, pitch: 0, yaw: 0, throttle: 0 }
    this.rotation.copy(this.body.rotation())
    this.euler.setFromQuaternion(this.rotation, 'YXZ')
    this.omega.copy(this.body.angvel()).applyQuaternion(this.rotation.clone().invert())
    const position = this.body.translation(),
      velocity = this.body.linvel()
    const ypr = {
      yaw: (this.euler.y * 180) / Math.PI,
      pitch: (-this.euler.x * 180) / Math.PI,
      roll: (this.euler.z * 180) / Math.PI,
    }
    const motors = input.arm
      ? this.controller.motors(
          input,
          this.spec,
          {
            ...ypr,
            wx: -this.omega.x,
            wy: this.omega.y,
            wz: this.omega.z,
            ...position,
            vx: velocity.x,
            vy: velocity.y,
            vz: velocity.z,
          },
          dt,
        )
      : ([0, 0, 0, 0] as [number, number, number, number])
    if (!input.arm) this.controller.reset()
    const [fl, fr, rr, rl] = motors.map((m) => m * this.spec.maxThrust)
    this.body.resetForces(false)
    this.body.resetTorques(false)
    this.up.set(0, fl + fr + rr + rl, 0).applyQuaternion(this.rotation)
    this.torque
      .set(
        this.spec.arm * (rr + rl - fl - fr),
        this.spec.arm * 0.35 * (fr + rl - fl - rr),
        this.spec.arm * (fr + rr - fl - rl),
      )
      .applyQuaternion(this.rotation)
    this.body.addForce(this.up, input.arm)
    this.body.addTorque(this.torque, input.arm)
    this.snapshot = {
      armed: input.arm,
      mode: input.mode,
      motors,
      channels: mode2Channels(input),
      velocity: { ...velocity },
      ypr,
      alt: position.y,
      voltage: input.arm ? 16.2 : 16.8,
    }
  }
  reset(position: THREE.Vector3, yaw = 0): void {
    if (this.disposed) return
    if (![position.x, position.y, position.z, yaw].every(Number.isFinite))
      throw new RangeError('Drone reset pose must be finite')
    this.body.setTranslation(position, true)
    this.body.setRotation(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      true,
    )
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.body.resetForces(true)
    this.body.resetTorques(true)
    this.controller.reset()
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.world.raw.removeRigidBody(this.body)
  }
}
