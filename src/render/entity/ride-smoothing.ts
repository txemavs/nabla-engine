/**
 * Camera and avatar ride smoothing: the body keeps every bump (physics and suspension are not
 * touched), but what the player looks through, the cockpit eye, the chase camera's target and
 * the seated avatar, follows a smoothed copy of the vehicle's height and tilt. Small, fast
 * vertical / pitch / roll bounce at speed is absorbed; slopes, crests and steady lean pass
 * through without lag, and the smoothed pose never strays more than `maxOffset` / `maxTilt`
 * from the real one, so jumps, landings and impacts stay sharp and the avatar stays attached.
 *
 * Filter: a critically damped second-order follower with velocity feed-forward of the target
 * (H(s) = (2ωs + ω²) / (s + ω)², ω = 1 / seconds). It tracks a constant climb rate or lean rate
 * with zero lag and attenuates bounce above ω (about 1/6 at 10 Hz for 0.2 s). Heading (yaw) and
 * horizontal position are never filtered.
 */
import * as THREE from 'three'
import { criticalStep } from './driving-camera.js'
import { rideSmoothingDefaults, type RideSmoothingSettings } from '../../config/camera.js'
import type { Entity } from '../../entity/schema.js'

export type RideSmoothingClass = keyof typeof rideSmoothingDefaults

/** Vehicle class for the ride-smoothing defaults. */
export function rideSmoothingClass(e: Pick<Entity, 'vehicle' | 'mass'>): RideSmoothingClass {
  const v = e.vehicle
  if (!v || v.flight || v.plane || v.boat || v.garage || v.passive) return 'off'
  if (v.twoWheeled) return 'motorcycle'
  if (v.hubs.length > 4 || (e.mass ?? 0) >= 3500) return 'truck'
  return 'car'
}

/** Settings for a vehicle: its class defaults, with `vehicle.rideSmoothing` as the strength. */
export function rideSmoothingSettings(e: Pick<Entity, 'vehicle' | 'mass'>): RideSmoothingSettings {
  const defaults = rideSmoothingDefaults[rideSmoothingClass(e)]
  const strength = e.vehicle?.rideSmoothing
  return strength === undefined ? defaults : { ...defaults, strength }
}

/** Longest step taken at once, seconds. */
const maxStep = 0.1
/** A jump larger than this in one frame (metres) is a teleport or reset: start over. */
const teleport = 3

/** Critically damped follower with target-velocity feed-forward for one scalar. */
class Follower {
  value = 0
  rate = 0
  private target = 0
  private targetRate = 0
  snap(target: number): void {
    this.value = this.target = target
    this.rate = this.targetRate = 0
  }
  step(target: number, omega: number, dt: number): void {
    const targetRate = (target - this.target) / dt
    // Exact for a target moving at a constant rate over the step.
    const [error, rate] = criticalStep(this.value - this.target, this.rate - targetRate, omega, dt)
    this.value = target + error
    this.rate = targetRate + rate
    this.target = target
    this.targetRate = targetRate
  }
  /** Keep the value within `limit` of the target; the rate follows the target when it binds. */
  clamp(limit: number): void {
    const error = this.value - this.target
    if (Math.abs(error) <= limit) return
    this.place(this.target + Math.sign(error) * limit)
  }
  /** Put the value at `value`, moving with the target (no extra rate of its own). */
  place(value: number): void {
    this.value = value
    this.rate = this.targetRate
  }
}

/** Ride smoothing of the player's vehicle (one at a time). */
export class RideSmoothing {
  /** Vehicle being smoothed, or null (bypassed, on foot). */
  id: string | null = null
  /** Real (physics) vehicle position and the smoothed one, world metres. */
  readonly raw = new THREE.Vector3()
  readonly position = new THREE.Vector3()
  /** Rotation taking the real vehicle onto the smoothed one (tilt only). */
  readonly correction = new THREE.Quaternion()
  private readonly height = new Follower()
  private readonly up = [new Follower(), new Follower(), new Follower()]
  private readonly last = new THREE.Vector3()

  /**
   * Advance with the vehicle's interpolated pose. `bypass` (crash, rollover, fallen bike) or a
   * zero strength follows the real pose exactly and restarts the filter.
   */
  update(
    id: string | null,
    position: readonly number[],
    rotation: readonly number[],
    dt: number,
    settings: RideSmoothingSettings,
    bypass = false,
    worldUp: THREE.Vector3 = new THREE.Vector3(0, 1, 0),
  ): void {
    this.raw.fromArray(position)
    const bodyUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
      new THREE.Quaternion().fromArray(rotation),
    )
    const h = this.raw.dot(worldUp)
    const restart =
      !id ||
      id !== this.id ||
      bypass ||
      !(settings.strength > 0) ||
      !(settings.seconds > 0) ||
      this.raw.distanceTo(this.last) > teleport
    this.last.copy(this.raw)
    if (restart) {
      this.id = id && !bypass && settings.strength > 0 ? id : null
      this.height.snap(h)
      this.up.forEach((f, i) => f.snap(bodyUp.getComponent(i)))
      this.position.copy(this.raw)
      this.correction.identity()
      return
    }
    const step = Math.min(maxStep, Math.max(1e-4, dt))
    const omega = 1 / settings.seconds
    this.height.step(h, omega, step)
    this.height.clamp(settings.maxOffset)
    this.up.forEach((f, i) => f.step(bodyUp.getComponent(i), omega, step))
    const smoothUp = new THREE.Vector3(this.up[0].value, this.up[1].value, this.up[2].value)
    if (smoothUp.lengthSq() < 1e-6) smoothUp.copy(bodyUp)
    smoothUp.normalize()
    const limit = THREE.MathUtils.degToRad(settings.maxTilt)
    const angle = smoothUp.angleTo(bodyUp)
    if (angle > limit) {
      // Keep the tilt error within `maxTilt`; the followers restart from the bound.
      const bound = new THREE.Quaternion().setFromUnitVectors(bodyUp, smoothUp)
      bound.slerp(new THREE.Quaternion(), 1 - limit / angle)
      smoothUp.copy(bodyUp).applyQuaternion(bound)
      this.up.forEach((f, i) => f.place(smoothUp.getComponent(i)))
    }
    const strength = Math.min(1, settings.strength)
    this.position.copy(this.raw).addScaledVector(worldUp, (this.height.value - h) * strength)
    this.correction.setFromUnitVectors(bodyUp, smoothUp).slerp(new THREE.Quaternion(), 1 - strength)
    this.id = id
  }

  /** Smoothed-minus-real vehicle position for `id` (zero when it is not the one smoothed). */
  offset(id: string): THREE.Vector3 {
    return id === this.id ? this.position.clone().sub(this.raw) : new THREE.Vector3()
  }

  /**
   * Move a world pose rigidly attached to the real vehicle `id` (the driver's eye, the seated
   * avatar) onto the smoothed vehicle, in place. Returns false (pose untouched) for any other id.
   */
  apply(id: string, position: THREE.Vector3, quaternion?: THREE.Quaternion): boolean {
    if (id !== this.id) return false
    position.sub(this.raw).applyQuaternion(this.correction).add(this.position)
    quaternion?.premultiply(this.correction)
    return true
  }

  reset(): void {
    this.id = null
    this.correction.identity()
  }
}
