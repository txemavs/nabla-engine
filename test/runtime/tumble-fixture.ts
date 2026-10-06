/**
 * Scripted multi-rollover crash for camera tests: a car drives straight, launches into barrel
 * rolls and end-over-end flips with a yaw spin while it bounces and slows down, then lands
 * upright on a new heading and slides to a stop. Only the members `updateGameCamera` reads are
 * implemented, so the camera can be exercised without physics.
 */
import { Euler, Quaternion, Vector3 } from 'three'
import type { Simulation } from '../../src/simulation/simulation.js'
import type { Vec3Tuple } from '../../src/entity/schema.js'

export interface TumblePose {
  position: Vector3
  rotation: Quaternion
  /** World velocity, m/s. */
  velocity: Vector3
  /** True between launch and landing. */
  tumbling: boolean
}

const DRIVE = 1
const TUMBLE = 2.6
const SLIDE = 1.2
/** Seconds covered by `tumblePose`: drive, tumble, slide, rest. */
export const TUMBLE_SECONDS = DRIVE + TUMBLE + SLIDE + 2.5
/** Heading the car lands on, radians (chase-yaw convention). */
export const LANDING_HEADING = 2.1

const yawQ = (yaw: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw)

function poseAt(t: number): { position: Vector3; rotation: Quaternion; tumbling: boolean } {
  const speed0 = 22
  if (t < DRIVE)
    return {
      position: new Vector3(0, 0.6, -speed0 * t),
      rotation: yawQ(0),
      tumbling: false,
    }
  const launch = new Vector3(0, 0.6, -speed0 * DRIVE)
  if (t < DRIVE + TUMBLE) {
    const u = t - DRIVE
    // Decelerating travel that drifts sideways a little.
    const along = speed0 * u - 2.8 * u * u
    const side = 1.2 * u * u
    // Bounces: three ballistic arcs of falling height.
    const arcs = [0.9, 0.9, 0.8]
    let rest = u
    let height = 0.6
    for (const [i, length] of arcs.entries()) {
      if (rest <= length) {
        height = 0.6 + (2.2 - 0.6 * i) * 4 * (rest / length) * (1 - rest / length)
        break
      }
      rest -= length
    }
    // Two barrel rolls per second, slower end-over-end flips and a yaw spin.
    const rotation = yawQ(0.9 * u + 0.25 * Math.sin(5 * u)).multiply(
      new Quaternion().setFromEuler(new Euler(1.7 * Math.PI * u, 0, 4 * Math.PI * u, 'XZY')),
    )
    return {
      position: new Vector3(launch.x + side, height, launch.z - along),
      rotation,
      tumbling: true,
    }
  }
  const landing = poseAt(DRIVE + TUMBLE - 1e-6).position
  const u = Math.min(SLIDE, t - DRIVE - TUMBLE)
  const v0 = 7
  const slid = v0 * u - (v0 / (2 * SLIDE)) * u * u
  return {
    position: new Vector3(landing.x + 0.4 * slid, 0.6, landing.z - slid),
    rotation: yawQ(LANDING_HEADING),
    tumbling: false,
  }
}

/** Pose and finite-difference velocity at `t` seconds. */
export function tumblePose(t: number): TumblePose {
  const now = poseAt(t)
  const before = poseAt(Math.max(0, t - 1e-3))
  const velocity = now.position
    .clone()
    .sub(before.position)
    .divideScalar(Math.max(1e-3, t - Math.max(0, t - 1e-3)))
  return { ...now, velocity }
}

/** World angular velocity about +Y from two rotations `dt` apart, rad/s. */
function turnRate(a: Quaternion, b: Quaternion, dt: number): number {
  const delta = b.clone().multiply(a.clone().invert())
  if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w)
  return (2 * delta.y) / dt
}

/** Minimal `Simulation` double driven by `tumblePose`; call `at(t)` before each camera update. */
export class TumbleSim {
  t = 0
  readonly player = { vehicleId: 'car' as string | null, speed: 0, interiorId: null }
  private pose = tumblePose(0)
  at(t: number): this {
    this.t = t
    this.pose = tumblePose(t)
    this.player.speed = this.pose.velocity.length()
    return this
  }
  get renderPlayerPosition(): Vec3Tuple {
    return this.pose.position.toArray() as Vec3Tuple
  }
  get playerFrame() {
    return null
  }
  entityTransform() {
    return {
      position: this.pose.position.toArray() as Vec3Tuple,
      rotation: this.pose.rotation.toArray() as [number, number, number, number],
    }
  }
  vehicleInfo() {
    const before = tumblePose(Math.max(0, this.t - 1e-3)).rotation
    return {
      turnRate: turnRate(before, this.pose.rotation, 1e-3),
      flightMode: false,
      isCarrier: false,
      cameraDistance: 5.5,
      driver: this.pose.position.toArray(),
    }
  }
  cameraPosition(_target: Vec3Tuple, desired: Vec3Tuple): Vec3Tuple {
    return desired
  }
  asSimulation(): Simulation {
    return this as unknown as Simulation
  }
}
