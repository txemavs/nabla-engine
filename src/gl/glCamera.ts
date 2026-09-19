/**
 * Orbit camera and ray-casting helpers.
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/gl/glCamera.ts
 *
 * Only the orbit camera functions are ported. FPS walk/lot/space camera
 * functions are omitted because they depend on Agency-specific modules
 * (spaceFlight, walkBody, roomPaint) that are not part of this package.
 */
import {
  cssToGl,
  invert4,
  lookAt,
  mul4,
  perspective,
  transformPoint,
  type Vec3,
} from './glMath.js'

/** Stage orbit camera state. */
export interface StageOrbit {
  yaw: number
  pitch: number
  distance: number
}

export function isSkyboxFace(id: string): id is SkyboxFaceId {
  return id === 'sky-left' || id === 'sky-right' || id === 'sky-back' || id === 'sky-top'
}

export type SkyboxFaceId = 'sky-left' | 'sky-right' | 'sky-back' | 'sky-top'

/** Compute eye position from orbit camera around origin. */
export function orbitEye(orbit: StageOrbit): Vec3 {
  const p = (orbit.pitch * Math.PI) / 180
  const y = (orbit.yaw * Math.PI) / 180
  const horiz = orbit.distance * Math.cos(p)
  return [horiz * Math.sin(y), orbit.distance * Math.sin(p), horiz * Math.cos(y)]
}

/** Compute eye position from orbit camera around a target point. */
export function orbitEyeAt(orbit: StageOrbit, target: Vec3): Vec3 {
  const e = orbitEye(orbit)
  return [e[0] + target[0], e[1] + target[1], e[2] + target[2]]
}

/** Edit-orbit ray in GL mm. ``target`` is the look-at (default origin). */
export function orbitRay(
  orbit: StageOrbit,
  ndcX: number,
  ndcY: number,
  aspect: number,
  target: Vec3 = [0, 0, 0],
): { origin: Vec3; dir: Vec3 } | null {
  const eye = orbitEyeAt(orbit, target)
  const view = lookAt(eye, target, [0, 1, 0])
  const nearZ = Math.max(40, orbit.distance * 0.02)
  const farZ = Math.max(120000, orbit.distance * 8)
  const proj = perspective(50, aspect, nearZ, farZ)
  const inv = invert4(mul4(proj, view))
  if (!inv) return null
  const near = transformPoint(inv, [ndcX, ndcY, -1])
  const far = transformPoint(inv, [ndcX, ndcY, 1])
  const dir: Vec3 = [far[0] - near[0], far[1] - near[1], far[2] - near[2]]
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1
  return { origin: near, dir: [dir[0] / len, dir[1] / len, dir[2] / len] }
}

/** Convert CSS coordinates to GL coordinates. Re-export for convenience. */
export { cssToGl }

/** Default orbit camera state. */
export const IDENTITY_STAGE_ORBIT: StageOrbit = { yaw: 38, pitch: 20, distance: 10800 }

export const STAGE_ORBIT_DIST_MIN = 900
export const STAGE_ORBIT_DIST_MAX = 40000
export const STAGE_ORBIT_PITCH_MIN = -80
export const STAGE_ORBIT_PITCH_MAX = 80
export const STAGE_ORBIT_WHEEL = 1.15
export const STAGE_ORBIT_LOOK = 0.28

export function clampStageOrbit(raw: Partial<StageOrbit>): StageOrbit {
  const n = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
  const wrapDeg = (value: number): number => {
    let a = value % 360
    if (a > 180) a -= 360
    if (a < -180) a += 360
    return a
  }
  return {
    yaw: wrapDeg(n(raw.yaw, IDENTITY_STAGE_ORBIT.yaw)),
    pitch: clamp(n(raw.pitch, IDENTITY_STAGE_ORBIT.pitch), STAGE_ORBIT_PITCH_MIN, STAGE_ORBIT_PITCH_MAX),
    distance: clamp(
      n(raw.distance, IDENTITY_STAGE_ORBIT.distance),
      STAGE_ORBIT_DIST_MIN,
      STAGE_ORBIT_DIST_MAX,
    ),
  }
}

/** Dolly (zoom) the orbit camera. */
export function dollyOrbit(orbit: StageOrbit, deltaY: number): StageOrbit {
  return clampStageOrbit({
    ...orbit,
    distance: orbit.distance + deltaY * STAGE_ORBIT_WHEEL,
  })
}

/** Rotate the orbit camera by mouse delta. */
export function orbitLookDelta(orbit: StageOrbit, dx: number, dy: number): StageOrbit {
  return clampStageOrbit({
    ...orbit,
    yaw: orbit.yaw + dx * STAGE_ORBIT_LOOK,
    pitch: orbit.pitch + dy * STAGE_ORBIT_LOOK,
  })
}
