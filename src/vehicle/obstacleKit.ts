/**
 * Static obstacle kit for the vehicle physics world.
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/vehicle/obstacleKit.ts
 *
 * Provides definitions for common obstacles (bridges, platforms) that can
 * be placed in the stage. All dimensions are in metres, Y-up coordinate system.
 *
 * ## Demo Layout (local space, then transformed to world)
 *
 * Local coordinates (before transform): car at origin facing +Z
 *
 * ```
 *                ___________
 *              _/   deck    \_
 *           __/               \__      z ≈ 5–15m
 *        __/                     \__
 *     __/    ARCHED BRIDGE          \__
 *    /___________________________________\
 *
 *              [CAR]   z = 0, facing +Z
 *                ↑
 *              forward
 * ```
 *
 * The bridge is a chain of short slabs with gentle progressive pitch,
 * creating a smooth arch that won't catch the bumper. Peak height ~0.6m.
 *
 * Call `demoObstacles(origin)` with the car's spawn pose to place obstacles
 * in world space relative to that pose.
 */
import { MM_PER_M } from '../world.js'

export interface StaticBox {
  x: number
  y: number
  z: number
  hx: number
  hy: number
  hz: number
  yaw?: number
  pitch?: number
}

export interface StaticObstacle extends StaticBox {
  id: string
  kind: 'cube' | 'ramp' | 'platform' | 'box' | 'bridge-slab'
}

export interface DrivePose {
  x: number
  y: number
  z: number
  yaw: number
}

/** Bridge arch parameters - gentle curve that won't snag the bumper. */
const BRIDGE_WIDTH = 3.2
const BRIDGE_PEAK_HEIGHT = 0.55
const BRIDGE_HALF_LENGTH = 6
const BRIDGE_SLAB_COUNT = 10
const BRIDGE_SLAB_THICKNESS = 0.12
const BRIDGE_START_Z = 5

function transformToWorld(
  local: { x: number; y: number; z: number; yaw?: number; pitch?: number },
  origin: DrivePose,
): { x: number; y: number; z: number; yaw: number; pitch?: number } {
  const yawRad = (origin.yaw * Math.PI) / 180
  const c = Math.cos(yawRad)
  const s = Math.sin(yawRad)
  return {
    x: origin.x + local.x * c + local.z * s,
    y: local.y,
    z: origin.z - local.x * s + local.z * c,
    yaw: (local.yaw ?? 0) + yawRad,
    pitch: local.pitch,
  }
}

/**
 * Generate a smooth arch profile using a full cosine curve (up and back down).
 * Returns (z, y, pitch) for each slab center in local space.
 * Peak is at the middle (t=0), ends return to ground level.
 */
function archProfile(
  startZ: number,
  halfLength: number,
  peakHeight: number,
  slabCount: number,
): { z: number; y: number; pitch: number }[] {
  const slabs: { z: number; y: number; pitch: number }[] = []
  const totalLength = halfLength * 2
  const slabLength = totalLength / slabCount

  for (let i = 0; i < slabCount; i++) {
    const zLocal = -halfLength + slabLength * (i + 0.5)
    const t = zLocal / halfLength
    const y = peakHeight * (1 + Math.cos(t * Math.PI)) / 2
    const dydt = (-peakHeight * Math.PI) / (2 * halfLength) * Math.sin(t * Math.PI)
    const pitch = -Math.atan(dydt)
    slabs.push({
      z: startZ + halfLength + zLocal,
      y: y + BRIDGE_SLAB_THICKNESS / 2,
      pitch,
    })
  }
  return slabs
}

function demoBridgeLocal(): StaticObstacle[] {
  const profile = archProfile(BRIDGE_START_Z, BRIDGE_HALF_LENGTH, BRIDGE_PEAK_HEIGHT, BRIDGE_SLAB_COUNT)
  const slabLength = (BRIDGE_HALF_LENGTH * 2) / BRIDGE_SLAB_COUNT

  return profile.map((p, i) => ({
    id: `bridge-slab-${i}`,
    kind: 'bridge-slab' as const,
    x: 0,
    y: p.y,
    z: p.z,
    hx: BRIDGE_WIDTH / 2,
    hy: BRIDGE_SLAB_THICKNESS / 2,
    hz: slabLength / 2 + 0.02,
    pitch: p.pitch,
  }))
}

function transformObstacle(obs: StaticObstacle, origin: DrivePose): StaticObstacle {
  const world = transformToWorld({ x: obs.x, y: obs.y, z: obs.z, yaw: obs.yaw, pitch: obs.pitch }, origin)
  return { ...obs, x: world.x, y: world.y, z: world.z, yaw: world.yaw, pitch: world.pitch }
}

export function demoObstacles(origin: DrivePose = { x: 0, y: 0, z: 0, yaw: 0 }): StaticObstacle[] {
  return demoBridgeLocal().map((obs) => transformObstacle(obs, origin))
}

export function obstaclesToBoxes(obs: StaticObstacle[]): StaticBox[] {
  return obs.map(({ x, y, z, hx, hy, hz, yaw, pitch }) => ({ x, y, z, hx, hy, hz, yaw, pitch }))
}

type Vec3 = { x: number; y: number; z: number }
type DebugLine = { a: [number, number, number]; b: [number, number, number]; rgb: [number, number, number] }

function rotX(p: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c }
}

function rotY(p: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c }
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function toMm(v: Vec3): [number, number, number] {
  return [v.x * MM_PER_M, v.y * MM_PER_M, v.z * MM_PER_M]
}

function boxCorners(box: StaticBox): Vec3[] {
  const { hx, hy, hz } = box
  const local: Vec3[] = [
    { x: -hx, y: -hy, z: -hz },
    { x: hx, y: -hy, z: -hz },
    { x: hx, y: -hy, z: hz },
    { x: -hx, y: -hy, z: hz },
    { x: -hx, y: hy, z: -hz },
    { x: hx, y: hy, z: -hz },
    { x: hx, y: hy, z: hz },
    { x: -hx, y: hy, z: hz },
  ]
  const center: Vec3 = { x: box.x, y: box.y, z: box.z }
  return local.map((p) => {
    let r = p
    if (box.pitch) r = rotX(r, box.pitch)
    if (box.yaw) r = rotY(r, box.yaw)
    return add(r, center)
  })
}

const EDGE_PAIRS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
]

const OBSTACLE_COLORS: Record<StaticObstacle['kind'], [number, number, number]> = {
  ramp: [0.9, 0.65, 0.2],
  cube: [0.3, 0.8, 0.5],
  platform: [0.3, 0.75, 0.9],
  box: [0.7, 0.7, 0.7],
  'bridge-slab': [0.45, 0.55, 0.65],
}

export function obstacleDebugLines(obs: StaticObstacle[]): DebugLine[] {
  const lines: DebugLine[] = []
  for (const o of obs) {
    const corners = boxCorners(o)
    const rgb = OBSTACLE_COLORS[o.kind] ?? [0.7, 0.7, 0.7]
    for (const [i, j] of EDGE_PAIRS) {
      lines.push({ a: toMm(corners[i]!), b: toMm(corners[j]!), rgb })
    }
  }
  return lines
}

/**
 * Generate wireframe debug lines for garage StaticBox colliders.
 * hx, hy, hz are Cannon half-extents (full size = 2 * h*).
 * Color: amber (distinct from white entity crosses and obstacle colors).
 */
const GARAGE_WIRE_RGB: [number, number, number] = [1.0, 0.75, 0.25]

export function garageBoxDebugLines(boxes: StaticBox[]): DebugLine[] {
  const lines: DebugLine[] = []
  for (const box of boxes) {
    const corners = boxCorners(box)
    for (const [i, j] of EDGE_PAIRS) {
      lines.push({ a: toMm(corners[i]!), b: toMm(corners[j]!), rgb: GARAGE_WIRE_RGB })
    }
  }
  return lines
}

/** Solid quad face definition for GL rendering. */
export interface ObstacleQuad {
  corners: [[number, number, number], [number, number, number], [number, number, number], [number, number, number]]
  rgba: [number, number, number, number]
}

const FACE_INDICES: [number, number, number, number][] = [
  [4, 5, 6, 7],
  [0, 3, 2, 1],
  [0, 1, 5, 4],
  [2, 3, 7, 6],
  [1, 2, 6, 5],
  [3, 0, 4, 7],
]

const OBSTACLE_RGBA: Record<StaticObstacle['kind'], [number, number, number, number]> = {
  ramp: [0.85, 0.6, 0.25, 0.85],
  cube: [0.35, 0.75, 0.5, 0.85],
  platform: [0.35, 0.7, 0.85, 0.85],
  box: [0.65, 0.65, 0.65, 0.85],
  'bridge-slab': [0.5, 0.58, 0.68, 0.9],
}

/** Generate solid quad faces for obstacle visualization. */
export function obstacleQuads(obs: StaticObstacle[]): ObstacleQuad[] {
  const quads: ObstacleQuad[] = []
  for (const o of obs) {
    const corners = boxCorners(o)
    const rgba = OBSTACLE_RGBA[o.kind] ?? [0.65, 0.65, 0.65, 0.85]
    for (const face of FACE_INDICES) {
      quads.push({
        corners: [
          toMm(corners[face[0]]!),
          toMm(corners[face[1]]!),
          toMm(corners[face[2]]!),
          toMm(corners[face[3]]!),
        ],
        rgba,
      })
    }
  }
  return quads
}

/** Parked car collider from entity pose and spec. */
export interface ParkedCarBox {
  id: string
  x: number
  y: number
  z: number
  hx: number
  hy: number
  hz: number
  yaw: number
}

/**
 * Create a parked car collider from entity pose.
 * yawDeg should already be in degrees (via entityYawDeg from @/stage/world).
 */
export function parkedCarCollider(
  id: string,
  pose: { x: number; y: number; z: number },
  yawDeg: number,
  colliderHalf: { x: number; y: number; z: number },
  colliderOffset: { x: number; y: number; z: number },
  comHeight: number,
): ParkedCarBox {
  const yawRad = (yawDeg * Math.PI) / 180
  return {
    id,
    x: pose.x,
    y: pose.y + colliderOffset.y + comHeight,
    z: pose.z,
    hx: colliderHalf.x,
    hy: colliderHalf.y,
    hz: colliderHalf.z,
    yaw: yawRad,
  }
}
