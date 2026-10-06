/**
 * Cinematic ("drone") camera: a slow orbit around the followed vehicle or player.
 * Pure pose math; the runtime owns state (orbit angle, zoom, smoothed anchor height).
 * Angles are radians, distances metres, time seconds.
 */
import { MathUtils, Quaternion, Vector3 } from 'three'
import { gameCameraDefaults, type GameCameraSettings } from '../../config/camera.js'

export interface CinematicOrbitInput {
  /** Point the camera looks at (vehicle/player target), world space. */
  target: readonly number[]
  /** Orbit angle, using the chase-yaw convention: 0 puts the camera on local +Z. */
  angle: number
  /** Authored vehicle chase distance, or undefined for the global `chaseDistance`. */
  chaseDistance?: number
  /** Wheel multiplier for the orbit radius. */
  zoom?: number
  /** Local frame (moving carrier interiors); identity outside. */
  frame?: Quaternion
}

/** Orbit radius: vehicle chase distance × `cinematicDistanceScale`, never below the minimum. */
export function cinematicOrbitRadius(
  chaseDistance: number | undefined,
  zoom = 1,
  settings: Readonly<GameCameraSettings> = gameCameraDefaults,
): number {
  const base = Math.max(
    settings.cinematicMinDistance,
    (chaseDistance ?? settings.chaseDistance) * settings.cinematicDistanceScale,
  )
  return base * Math.max(0, zoom)
}

/** Advance the orbit angle by elapsed seconds (capped like every camera damping step). */
export function advanceCinematicAngle(
  angle: number,
  dt: number,
  settings: Readonly<GameCameraSettings> = gameCameraDefaults,
): number {
  if (settings.cinematicOrbitSeconds <= 0) return angle
  const step = Math.min(Math.max(dt, 0), settings.maxStepSeconds)
  return MathUtils.euclideanModulo(
    angle + (step * Math.PI * 2) / settings.cinematicOrbitSeconds,
    Math.PI * 2,
  )
}

/**
 * Camera position on the orbit. Height is a fixed fraction of the radius plus a slow,
 * small drift (half the orbit frequency) so the shot breathes like a hovering drone.
 */
export function cinematicOrbitPose(
  input: CinematicOrbitInput,
  settings: Readonly<GameCameraSettings> = gameCameraDefaults,
): { position: Vector3; target: Vector3 } {
  const radius = cinematicOrbitRadius(input.chaseDistance, input.zoom, settings)
  const height =
    radius * settings.cinematicElevation + Math.sin(input.angle * 2) * settings.cinematicBob
  const offset = new Vector3(Math.sin(input.angle) * radius, height, Math.cos(input.angle) * radius)
  if (input.frame) offset.applyQuaternion(input.frame)
  const target = new Vector3().fromArray(input.target)
  return { position: target.clone().add(offset), target }
}
