/**
 * Deterministic, time-based camera path for performance benchmarking.
 *
 * Paths are interpolated positions and orientations that run at a fixed rate
 * independent of frame rate, enabling reproducible measurements across runs.
 */
import * as THREE from 'three'
import type { GeoPoint } from '../math/geo/sphere.js'
import { geoToLocal } from '../math/geo/sphere.js'

/** A single waypoint on a benchmark camera path. */
export interface BenchmarkWaypoint {
  /** Position relative to the scene origin, metres. */
  position: THREE.Vector3
  /** Look-at target relative to the scene origin, metres. */
  target: THREE.Vector3
  /** Time at this waypoint from path start, seconds. */
  time: number
}

/** A complete benchmark camera path with metadata. */
export interface BenchmarkCameraPath {
  /** Human-readable path name. */
  name: string
  /** Total path duration, seconds. */
  duration: number
  /** Ordered waypoints; time must be monotonically increasing. */
  waypoints: BenchmarkWaypoint[]
  /** Whether to loop at the end. */
  loop: boolean
}

/**
 * Evaluate a camera path at a given time.
 * Returns the interpolated position and target in scene-local coordinates.
 */
export function evaluatePath(
  path: BenchmarkCameraPath,
  timeSeconds: number,
): { position: THREE.Vector3; target: THREE.Vector3 } | null {
  if (path.waypoints.length === 0) return null
  if (path.waypoints.length === 1) {
    const wp = path.waypoints[0]
    return { position: wp.position.clone(), target: wp.target.clone() }
  }

  let t = timeSeconds
  if (path.loop && path.duration > 0) {
    t = t % path.duration
  } else if (t >= path.duration) {
    const last = path.waypoints[path.waypoints.length - 1]
    return { position: last.position.clone(), target: last.target.clone() }
  }

  let i = 0
  while (i < path.waypoints.length - 1 && path.waypoints[i + 1].time <= t) {
    i++
  }

  if (i >= path.waypoints.length - 1) {
    const last = path.waypoints[path.waypoints.length - 1]
    return { position: last.position.clone(), target: last.target.clone() }
  }

  const wp0 = path.waypoints[i]
  const wp1 = path.waypoints[i + 1]
  const segmentDuration = wp1.time - wp0.time
  const k = segmentDuration > 0 ? (t - wp0.time) / segmentDuration : 0
  const smoothK = THREE.MathUtils.smoothstep(k, 0, 1)

  return {
    position: wp0.position.clone().lerp(wp1.position, smoothK),
    target: wp0.target.clone().lerp(wp1.target, smoothK),
  }
}

/**
 * Apply the benchmark camera path to a Three.js camera.
 * Returns true if the path is still running, false if complete.
 */
export function applyBenchmarkCamera(
  camera: THREE.PerspectiveCamera,
  path: BenchmarkCameraPath,
  timeSeconds: number,
): boolean {
  const result = evaluatePath(path, timeSeconds)
  if (!result) return false

  camera.position.copy(result.position)
  camera.lookAt(result.target)

  const complete = !path.loop && timeSeconds >= path.duration
  return !complete
}

/** Create a simple orbit path around a point for the flat example scene. */
export function createFlatSceneOrbit(): BenchmarkCameraPath {
  const center = new THREE.Vector3(0, 0, 0)
  const radius = 25
  const height = 8
  const duration = 30
  const waypoints: BenchmarkWaypoint[] = []

  for (let i = 0; i <= 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    const t = (i / 12) * duration
    waypoints.push({
      position: new THREE.Vector3(
        center.x + Math.sin(angle) * radius,
        center.y + height,
        center.z + Math.cos(angle) * radius,
      ),
      target: center.clone(),
      time: t,
    })
  }

  return {
    name: 'flat-orbit',
    duration,
    waypoints,
    loop: true,
  }
}

/** Create a path over the Irun/Ventas area for geographic benchmarks. */
export function createIrunVentasPath(origin: GeoPoint): BenchmarkCameraPath {
  const duration = 60
  const waypoints: BenchmarkWaypoint[] = []

  const locations: Array<{ lat: number; lon: number; alt: number; time: number }> = [
    { lat: 43.337, lon: -1.752, alt: 150, time: 0 },
    { lat: 43.335, lon: -1.755, alt: 120, time: 10 },
    { lat: 43.332, lon: -1.758, alt: 100, time: 20 },
    { lat: 43.33, lon: -1.755, alt: 80, time: 30 },
    { lat: 43.332, lon: -1.75, alt: 100, time: 40 },
    { lat: 43.335, lon: -1.748, alt: 120, time: 50 },
    { lat: 43.337, lon: -1.752, alt: 150, time: 60 },
  ]

  for (const loc of locations) {
    const pos = geoToLocal(origin, { latitude: loc.lat, longitude: loc.lon, altitude: loc.alt })
    const targetPos = geoToLocal(origin, {
      latitude: loc.lat - 0.002,
      longitude: loc.lon,
      altitude: loc.alt - 30,
    })
    waypoints.push({
      position: new THREE.Vector3(pos[0], pos[1], pos[2]),
      target: new THREE.Vector3(targetPos[0], targetPos[1], targetPos[2]),
      time: loc.time,
    })
  }

  return {
    name: 'irun-ventas',
    duration,
    waypoints,
    loop: true,
  }
}

/** Available benchmark camera paths by URL parameter name. */
export type BenchmarkPathId = 'flat-orbit' | 'irun-ventas'

/** Create a benchmark camera path by ID. */
export function createBenchmarkPath(
  id: BenchmarkPathId,
  origin?: GeoPoint,
): BenchmarkCameraPath | null {
  switch (id) {
    case 'flat-orbit':
      return createFlatSceneOrbit()
    case 'irun-ventas':
      if (!origin) return null
      return createIrunVentasPath(origin)
    default:
      return null
  }
}

/**
 * Benchmark camera controller that manages path playback.
 * Enabled via URL parameter `benchmarkCamera=<path-id>`.
 */
export class BenchmarkCameraController {
  private path: BenchmarkCameraPath | null = null
  private startTime: number | null = null
  private active = false

  /** Start playing a benchmark camera path. */
  start(path: BenchmarkCameraPath, startTime: number): void {
    this.path = path
    this.startTime = startTime
    this.active = true
  }

  /** Stop the benchmark camera. */
  stop(): void {
    this.active = false
    this.path = null
    this.startTime = null
  }

  /** Check if the benchmark camera is active. */
  isActive(): boolean {
    return this.active && this.path !== null
  }

  /** Get the current path time in seconds. */
  getPathTime(currentTime: number): number {
    if (!this.active || this.startTime === null) return 0
    return (currentTime - this.startTime) / 1000
  }

  /**
   * Update the camera for the current frame.
   * Returns true if the camera was updated, false if not active or path complete.
   */
  update(camera: THREE.PerspectiveCamera, currentTime: number): boolean {
    if (!this.active || !this.path || this.startTime === null) return false

    const pathTime = (currentTime - this.startTime) / 1000
    return applyBenchmarkCamera(camera, this.path, pathTime)
  }
}
