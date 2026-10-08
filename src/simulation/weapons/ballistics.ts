/**
 * Point-mass handgun ballistics: gravity plus quadratic air drag, a = g − k·|v|·v. With constant
 * k the speed along the path falls as v(s) = v0·e^(−k·s), so k is fitted (least squares through
 * the muzzle) to the ammunition maker's published velocity table instead of being guessed. The
 * trajectory starts on the bore line, below the sight line by the sight height, and is tilted up
 * so it crosses the line of sight again at the zero range, as a zeroed pistol does.
 */
import { simulationDefaults } from '../../config/simulation.js'

const YARD = 0.9144
const FOOT = 0.3048

export interface VelocityPoint {
  yards: number
  fps: number
}

export interface BallisticLoad {
  bulletMassKg: number
  muzzleVelocityMs: number
  velocityTable: readonly VelocityPoint[]
  zeroRangeM: number
  sightHeightM: number
  maxTraceM: number
}

/** Drag constant k (1/m) for a = −k·|v|·v from (range, velocity) data. */
export function fitDrag(table: readonly VelocityPoint[]): number {
  const v0 = table.find((p) => p.yards === 0)?.fps ?? table[0].fps
  let xy = 0,
    xx = 0
  for (const point of table) {
    const x = point.yards * YARD
    if (x <= 0 || !(point.fps > 0)) continue
    xy += x * Math.log(v0 / point.fps)
    xx += x * x
  }
  return xx > 0 ? Math.max(0, xy / xx) : 0
}

/** Speed (m/s) after `distance` metres of flight path. */
export function speedAt(load: BallisticLoad, distance: number, k = fitDrag(load.velocityTable)) {
  return load.muzzleVelocityMs * Math.exp(-k * Math.max(0, distance))
}

/** Kinetic energy (J) and momentum (N·s) of the bullet at `speed`. */
export function bulletEnergy(
  load: BallisticLoad,
  speed: number,
): { joules: number; momentum: number } {
  return { joules: 0.5 * load.bulletMassKg * speed * speed, momentum: load.bulletMassKg * speed }
}

export interface FlightSample {
  /** Downrange (horizontal) distance, m. */
  x: number
  /** Height relative to the line of sight, m (negative = below). */
  y: number
  speed: number
  time: number
  path: number
}

const STEP = 1 / 2000

/**
 * Flat-fire profile in the vertical plane: start at y = −sightHeight with `angle` (rad) above
 * the horizontal line of sight. Samples every `every` metres of downrange distance.
 */
export function flightProfile(
  load: BallisticLoad,
  angle: number,
  maxX: number,
  every = 1,
  k = fitDrag(load.velocityTable),
  gravity = simulationDefaults.gravity,
): FlightSample[] {
  let x = 0,
    y = -load.sightHeightM,
    vx = load.muzzleVelocityMs * Math.cos(angle),
    vy = load.muzzleVelocityMs * Math.sin(angle),
    t = 0,
    path = 0,
    next = 0
  const out: FlightSample[] = []
  while (x <= maxX + 1e-9 && t < 30) {
    const speed = Math.hypot(vx, vy)
    if (x >= next - 1e-9) {
      out.push({ x, y, speed, time: t, path })
      next += every
    }
    vx -= k * speed * vx * STEP
    vy -= (k * speed * vy + gravity) * STEP
    x += vx * STEP
    y += vy * STEP
    path += speed * STEP
    t += STEP
  }
  return out
}

/** Bore angle (rad) above the sight line that crosses it again at `zeroRangeM`. */
export function zeroAngle(load: BallisticLoad, k = fitDrag(load.velocityTable)): number {
  const heightAt = (angle: number) => {
    const samples = flightProfile(load, angle, load.zeroRangeM, load.zeroRangeM / 50, k)
    return samples[samples.length - 1].y
  }
  let a = 0,
    b = 0.02
  let fa = heightAt(a),
    fb = heightAt(b)
  for (let i = 0; i < 30 && Math.abs(fb) > 1e-7; i++) {
    const c = b - (fb * (b - a)) / (fb - fa)
    a = b
    fa = fb
    b = c
    fb = heightAt(b)
  }
  return b
}

export type Vec3 = [number, number, number]

export interface BulletHit {
  point: Vec3
  normal: Vec3
  entityId: string | null
}

export interface BulletResult {
  hit: (BulletHit & { distance: number; speed: number; time: number }) | null
  /** Last point reached (the hit point, or the end of the trace). */
  end: Vec3
  /** Path polyline, for tracers / debugging. */
  points: Vec3[]
}

/**
 * Fly one bullet through the world. `cast(from, direction, length)` is a ray query (the
 * simulation's, with no impulse). Starts at `origin` (on the sight line), tilted by the zero
 * angle about the line of sight's horizontal axis and dropped by the sight height.
 */
export function traceBullet(
  load: BallisticLoad,
  origin: Vec3,
  sightDirection: Vec3,
  cast: (from: Vec3, direction: Vec3, length: number) => BulletHit | null,
  options: { k?: number; angle?: number; gravity?: number; segment?: number } = {},
): BulletResult {
  const k = options.k ?? fitDrag(load.velocityTable)
  const angle = options.angle ?? zeroAngle(load, k)
  const gravity = options.gravity ?? simulationDefaults.gravity
  const segment = options.segment ?? 4
  const d = normalise(sightDirection)
  // Bore below the sight line (world up projected off the line of sight).
  const up = normalise(sub([0, 1, 0], scale(d, d[1])))
  const hasUp = up.every(Number.isFinite) && Math.hypot(...up) > 0.5
  const lift = hasUp ? up : ([0, 0, 0] as Vec3)
  let p = add(origin, scale(lift, -load.sightHeightM))
  let v = scale(
    normalise(add(scale(d, Math.cos(angle)), scale(lift, Math.sin(angle)))),
    load.muzzleVelocityMs,
  )
  let path = 0,
    time = 0,
    from = p
  const points: Vec3[] = [p]
  while (path < load.maxTraceM && time < 10) {
    const speed = Math.hypot(...v)
    v = [
      v[0] - k * speed * v[0] * STEP * 4,
      v[1] - (k * speed * v[1] + gravity) * STEP * 4,
      v[2] - k * speed * v[2] * STEP * 4,
    ]
    const next = add(p, scale(v, STEP * 4))
    path += Math.hypot(...sub(next, p))
    time += STEP * 4
    p = next
    const span = Math.hypot(...sub(p, from))
    if (span >= segment || path >= load.maxTraceM) {
      const direction = scale(sub(p, from), 1 / span)
      const hit = cast(from, direction, span)
      if (hit) {
        const back = Math.hypot(...sub(p, hit.point))
        points.push(hit.point)
        return {
          hit: {
            ...hit,
            distance: path - back,
            speed: speedAt(load, path - back, k),
            time,
          },
          end: hit.point,
          points,
        }
      }
      points.push(p)
      from = p
    }
  }
  return { hit: null, end: p, points }
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const normalise = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a)
  return l > 0 ? scale(a, 1 / l) : [0, 0, -1]
}

/** Unit helpers for the published imperial data. */
export const units = Object.freeze({ yard: YARD, foot: FOOT, inch: 0.0254 })
