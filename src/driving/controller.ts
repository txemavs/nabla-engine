import { MathUtils, Quaternion, Vector3 } from 'three'
import type { Simulation } from '../simulation/simulation.js'
import {
  driverHeadPose,
  followDrivingHeading,
  overheadDrivingPose,
  overheadDrivingHeight,
  DrivingTelemetry,
} from '../render/entity/driving-camera.js'
import { VehicleAudio } from '../audio/vehicle.js'

export type CameraMode = 'chase' | 'cockpit' | 'map'

export interface DrivingCameraState {
  position: Vector3
  target: Vector3
  up: Vector3
  fov: number
}

export interface DrivingControllerOptions {
  enableAudio?: boolean
  initialCameraMode?: CameraMode
}

/**
 * Unified driving controller for vehicles.
 * Encapsulates camera control, audio, and telemetry filtering.
 * Both Studio and standalone games can use this from the engine.
 */
export class DrivingController {
  private readonly telemetry = new DrivingTelemetry()
  private readonly audio: VehicleAudio
  private cameraMode: CameraMode
  private yaw = 0
  private pitch = 0.05
  private lastLookTime = 0
  private mapZoom = 1

  constructor(options: DrivingControllerOptions = {}) {
    this.audio = new VehicleAudio(options.enableAudio ?? true)
    this.cameraMode = options.initialCameraMode ?? 'cockpit'
  }

  getCameraMode(): CameraMode {
    return this.cameraMode
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode
    this.pitch = mode === 'cockpit' ? 0.05 : 0.24
  }

  cycleCamera(): CameraMode {
    this.cameraMode =
      this.cameraMode === 'chase' ? 'cockpit' : this.cameraMode === 'cockpit' ? 'map' : 'chase'
    this.pitch = this.cameraMode === 'cockpit' ? 0.05 : 0.24
    return this.cameraMode
  }

  setMapZoom(zoom: number): void {
    this.mapZoom = MathUtils.clamp(zoom, 0.75, 3)
  }

  notifyManualLook(): void {
    this.lastLookTime = performance.now()
  }

  /**
   * Apply mouse movement to camera yaw/pitch.
   * Call from mousemove handler with movementX/Y.
   */
  applyMouseLook(movementX: number, movementY: number): void {
    this.yaw -= movementX * 0.0025
    this.pitch = MathUtils.clamp(this.pitch + movementY * 0.002, -1.45, 1.45)
    this.lastLookTime = performance.now()
  }

  /** Get current yaw for input synchronization. */
  getYaw(): number {
    return this.yaw
  }

  /** Set yaw directly (e.g., when entering vehicle). */
  setYaw(yaw: number): void {
    this.yaw = yaw
  }

  unlockAudio(): void {
    this.audio.unlock()
  }

  setAudioEnabled(enabled: boolean): void {
    this.audio.setEnabled(enabled)
  }

  setAudioSuspended(suspended: boolean): void {
    this.audio.setSuspended(suspended)
  }

  /**
   * Update telemetry and audio for the current frame.
   * Call once per frame before computing camera.
   */
  update(sim: Simulation | null, elapsed: number): void {
    if (!sim) {
      this.telemetry.update(null, 0, 0, elapsed, true)
      return
    }

    const player = sim.player
    const vehicleId = player.vehicleId

    if (vehicleId) {
      const info = sim.vehicleInfo(vehicleId)
      this.telemetry.update(vehicleId, player.speed, info.turnRate, elapsed)

      const hasPowertrain = info.rpm > 0

      if (hasPowertrain) {
        this.audio.powertrain(info.rpm, info.engineLoad)
        this.audio.tires(info.tireSlip, info.speedKmh)
      }

      if (info.canFly) {
        this.audio.turbine(info.flightMode ? info.engine : 0, info.speedKmh)
        this.audio.propeller(info.engine)
      }
    } else {
      this.telemetry.update(null, 0, 0, elapsed)
    }
  }

  /**
   * Compute camera state for the current frame.
   * Returns position, target, up vector, and FOV.
   */
  computeCamera(
    sim: Simulation | null,
    elapsed: number,
    groundUp: Vector3 = new Vector3(0, 1, 0),
  ): DrivingCameraState {
    const defaultState: DrivingCameraState = {
      position: new Vector3(0, 5, 10),
      target: new Vector3(0, 0, 0),
      up: new Vector3(0, 1, 0),
      fov: 60,
    }

    if (!sim) return defaultState

    const player = sim.player
    const vehicleId = player.vehicleId

    if (!vehicleId) {
      const pos = new Vector3(...player.position)
      return {
        position: pos.clone().add(new Vector3(0, 2, 5)),
        target: pos,
        up: groundUp.clone(),
        fov: 60,
      }
    }

    const transform = sim.entityTransform(vehicleId, true)
    const info = sim.vehicleInfo(vehicleId, true)
    const position = new Vector3(...transform.position)
    const rotation = transform.rotation

    if (this.cameraMode === 'map') {
      const height = overheadDrivingHeight(this.telemetry.speed, this.mapZoom)
      const pose = overheadDrivingPose(
        transform.position,
        rotation,
        height,
        groundUp,
        Math.min(3.5, this.telemetry.speed * 0.14) * MathUtils.smoothstep(height, 45, 120),
      )
      return {
        position: pose.position,
        target: pose.target,
        up: pose.up,
        fov: 48,
      }
    }

    if (this.cameraMode === 'cockpit') {
      const headPose = driverHeadPose(
        info.driver,
        rotation,
        info.isCarrier,
        this.yaw,
        this.pitch,
        undefined,
      )
      const forward = new Vector3(0, 0, -10).applyQuaternion(headPose.quaternion)
      return {
        position: headPose.position,
        target: headPose.position.clone().add(forward),
        up: groundUp.clone(),
        fov: 70,
      }
    }

    const now = performance.now()
    const sinceLook = now - this.lastLookTime

    if (!info.flightMode) {
      const forward = new Vector3(0, 0, -1).applyQuaternion(new Quaternion().fromArray(rotation))
      const heading = Math.atan2(-forward.x, -forward.z)
      this.yaw = followDrivingHeading(
        this.yaw,
        heading,
        this.telemetry.turnRate,
        this.telemetry.speed,
        elapsed,
        sinceLook,
      )
    } else if (player.speed > 1 && sinceLook > 1400) {
      const forward = new Vector3(0, 0, -1).applyQuaternion(new Quaternion().fromArray(rotation))
      this.yaw = Math.atan2(-forward.x, -forward.z)
    }

    const distance = info.cameraDistance + Math.min(player.speed * 0.1, 4)
    const height = 2 + Math.min(player.speed * 0.05, 2)

    const cameraOffset = new Vector3(
      Math.sin(this.yaw) * distance,
      height,
      Math.cos(this.yaw) * distance,
    )

    const cameraPos = position.clone().add(cameraOffset)
    const lookTarget = position.clone().add(new Vector3(0, 1, 0))

    const baseFov = 48
    const speedFov = Math.min(player.speed * 0.3, 12)

    return {
      position: cameraPos,
      target: lookTarget,
      up: groundUp.clone(),
      fov: baseFov + speedFov,
    }
  }

  /**
   * Get smoothed telemetry values for UI/effects.
   */
  getTelemetry(): { speed: number; turnRate: number } {
    return {
      speed: this.telemetry.speed,
      turnRate: this.telemetry.turnRate,
    }
  }

  dispose(): void {
    this.audio.dispose()
  }
}
