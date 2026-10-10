/** Presentation only: smoothing and crash poses for the on-foot avatar; physics is untouched. */
import * as THREE from 'three'
import { gameCameraDefaults } from '../../config/camera.js'
import { ejectionDefaults } from '../../config/simulation.js'
import type { RiderEjection } from '../../simulation/rider-ejection.js'
import { CriticalFollow, criticalStep } from './driving-camera.js'

const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))

/** Absolute local lifting pose: repeated render frames must not accumulate motion or spin. */
export function poseBikeRecovery(
  model: THREE.Object3D,
  phase: 'rising' | 'lifting',
  progress: number,
  baseHeight: number,
): void {
  const t = THREE.MathUtils.clamp(progress, 0, 1)
  const pull = phase === 'lifting' ? Math.sin(Math.PI * t) : 0
  model.position.set(0, baseHeight + 0.06 * pull, 0.08 * pull)
  model.quaternion.setFromEuler(
    new THREE.Euler(
      phase === 'lifting' ? -0.25 - 0.15 * pull : 0,
      0,
      phase === 'rising' ? (Math.PI / 2) * (1 - THREE.MathUtils.smoothstep(t, 0, 1)) : 0,
    ),
  )
}

/** Blend the displayed pose on seat changes, including the monitor's offset and scale. */
export class AvatarTransfer {
  private mode: string | null | undefined
  private elapsed = 1
  private duration = 0
  private readonly displayed = new THREE.Group()
  private readonly local = new THREE.Group()
  private readonly start = new THREE.Group()
  private readonly startLocal = new THREE.Group()
  update(
    avatar: THREE.Object3D,
    model: THREE.Object3D,
    mode: string | null,
    dt: number,
    ejected = false,
  ): void {
    if (
      this.mode !== undefined &&
      mode !== this.mode &&
      !ejected &&
      this.displayed.position.distanceTo(avatar.position) < 6
    ) {
      this.start.position.copy(this.displayed.position)
      this.start.quaternion.copy(this.displayed.quaternion)
      this.startLocal.position.copy(this.local.position)
      this.startLocal.quaternion.copy(this.local.quaternion)
      this.startLocal.scale.copy(this.local.scale)
      this.elapsed = 0
      this.duration = mode ? 0.75 : 0.65
    }
    this.mode = mode
    if (ejected || this.displayed.position.distanceTo(avatar.position) >= 6)
      this.elapsed = this.duration
    if (this.elapsed < this.duration) {
      this.elapsed = Math.min(
        this.duration,
        this.elapsed + Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 0.1)),
      )
      const t = THREE.MathUtils.smoothstep(this.elapsed / this.duration, 0, 1)
      avatar.position.lerpVectors(this.start.position, avatar.position.clone(), t)
      avatar.quaternion.slerpQuaternions(this.start.quaternion, avatar.quaternion.clone(), t)
      model.position.lerpVectors(this.startLocal.position, model.position.clone(), t)
      model.quaternion.slerpQuaternions(this.startLocal.quaternion, model.quaternion.clone(), t)
      model.scale.lerpVectors(this.startLocal.scale, model.scale.clone(), t)
    }
    this.displayed.position.copy(avatar.position)
    this.displayed.quaternion.copy(avatar.quaternion)
    this.local.position.copy(model.position)
    this.local.quaternion.copy(model.quaternion)
    this.local.scale.copy(model.scale)
  }
}

/**
 * Smooth the on-foot avatar like the cameras: a critically damped follower with velocity
 * feed-forward for the position and one with turn-rate feed-forward for the heading. Steady
 * walking, sprinting and turning have no lag; physics jitter, steps, landings and snappy
 * heading changes are filtered. Jumps of more than `snapDistance` (teleports, getting off a
 * vehicle, portals) snap.
 */
export class AvatarFollow {
  private readonly follow = new CriticalFollow()
  private yaw = 0
  private yawRate = 0
  private lastYaw = 0
  private yawFeed = 0
  private ready = false
  /** Smoothed position. */
  get position(): THREE.Vector3 {
    return this.follow.position
  }
  /** Smoothed velocity, m/s. */
  get velocity(): THREE.Vector3 {
    return this.follow.velocity
  }
  /** Smoothed heading, radians. */
  get heading(): number {
    return this.yaw
  }

  /** Forget the history; the next update snaps. */
  reset(): void {
    this.ready = false
    this.follow.reset()
  }

  update(
    target: THREE.Vector3,
    yaw: number,
    dt: number,
    settings: Pick<
      typeof gameCameraDefaults,
      'avatarFollowResponse' | 'avatarYawResponse' | 'maxStepSeconds'
    > = gameCameraDefaults,
    snapDistance = 2,
  ): void {
    const step = Math.min(Math.max(Number.isFinite(dt) ? dt : 0, 0), settings.maxStepSeconds)
    if (!this.ready || this.follow.position.distanceTo(target) > snapDistance) {
      this.follow.reset(target)
      this.yaw = this.lastYaw = yaw
      this.yawRate = this.yawFeed = 0
      this.ready = true
      return
    }
    this.follow.update(target, step, settings.avatarFollowResponse, settings.maxStepSeconds)
    if (step <= 0) return
    const turn = wrapAngle(yaw - this.lastYaw) / step
    this.lastYaw = yaw
    this.yawFeed += (turn - this.yawFeed) * (1 - Math.exp(-10 * step))
    const [error, errorRate] = criticalStep(
      wrapAngle(this.yaw - (yaw - this.yawFeed * step)),
      this.yawRate - this.yawFeed,
      settings.avatarYawResponse,
      step,
    )
    this.yaw = wrapAngle(yaw + error)
    this.yawRate = this.yawFeed + errorRate
  }
}

/**
 * The thrown rider's avatar: it tumbles while flying and rolls while sliding (spin from the
 * smoothed speed), takes the hit with a squash when it first lands, lies where it stopped, and
 * turns back upright while getting up. `drop` lowers the head to the ground while down (the
 * walker's collider centre is well above it; the floating monitor's is not).
 */
export class EjectionTumble {
  private readonly tumble = new THREE.Quaternion()
  private jolt = 0
  private phase: RiderEjection['phase'] | null = null
  private sink = 0

  /** True while it is posing the model (an ejection is running). */
  get active(): boolean {
    return this.phase !== null
  }

  /**
   * Pose `model` (the monitor inside the avatar group) on top of its normal motion. `velocity`
   * is the smoothed avatar velocity in the avatar's own frame. Returns false when idle.
   */
  update(
    model: THREE.Object3D,
    ejection: RiderEjection | null,
    velocity: THREE.Vector3,
    dt: number,
    drop = 0,
    riseSeconds = ejectionDefaults.riseSeconds,
  ): boolean {
    const step = Math.min(Math.max(Number.isFinite(dt) ? dt : 0, 0), 0.1)
    if (!ejection) {
      this.phase = null
      this.jolt = 0
      this.sink = 0
      this.tumble.identity()
      return false
    }
    if (this.phase === null) this.tumble.copy(model.quaternion)
    if (ejection.phase === 'down' && this.phase === 'flying')
      this.jolt = THREE.MathUtils.clamp(ejection.hit / 12, 0.3, 1)
    this.phase = ejection.phase
    const ground = new THREE.Vector3(velocity.x, 0, velocity.z)
    const speed = ground.length()
    if (ejection.phase !== 'rising' && speed > 0.05) {
      // Rolling over the ground: about (up × travel), at most two turns a second.
      const rate = Math.min(12, (ejection.phase === 'flying' ? 1.4 : 1) * (speed / 0.3))
      const axis = new THREE.Vector3(0, 1, 0).cross(ground.normalize())
      this.tumble.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, rate * step))
    }
    const rise =
      ejection.phase === 'rising'
        ? THREE.MathUtils.smoothstep(ejection.phaseElapsed / Math.max(1e-3, riseSeconds), 0, 1)
        : 0
    if (ejection.phase === 'rising') model.quaternion.slerp(this.tumble, 1 - rise)
    else model.quaternion.copy(this.tumble)
    this.sink =
      ejection.phase === 'down'
        ? this.sink + (1 - this.sink) * (1 - Math.exp(-8 * step))
        : ejection.phase === 'rising'
          ? Math.min(this.sink, 1 - rise)
          : 0
    model.position.y -= drop * this.sink
    this.jolt *= Math.exp(-step / 0.12)
    const base = model.scale.x
    const wide = base * (1 + 0.2 * this.jolt)
    model.scale.set(wide, base * (1 - 0.3 * this.jolt), wide)
    return true
  }
}
