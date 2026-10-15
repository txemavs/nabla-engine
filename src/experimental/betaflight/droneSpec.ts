// Adapted from txemavs/agency-ui 89b0907, by permission of the author.
/**
 * Named bag for the helm quad. PID / rates / mixer live in Betaflight.
 */
import { QUAD_X_MIXER, type MixerRow } from './droneDef.js'

export interface DronePid {
  p: number
  i: number
  d: number
}

export interface DroneSpec {
  mass: number
  arm: number
  maxThrust: number
  idle: number
  drag: number
  angDrag: number
  maxAngle: number
  hoverBoost: number
  airMode: boolean
  failsafeLoiter: boolean
  boardYaw: number
  rollPid: DronePid
  pitchPid: DronePid
  yawPid: DronePid
  angleP: number
  posP: number
  velP: number
  altP: number
  rcRate: number
  expo: number
  superRate: number
  mixer: MixerRow[]
}

// Derivative gains retuned for Rapier inertia and the shared 90 Hz room step.
export const DEFAULT_DRONE_SPEC: DroneSpec = {
  mass: 0.75,
  arm: 0.12,
  maxThrust: 4.6,
  idle: 0.05,
  drag: 0.45,
  angDrag: 0.08,
  maxAngle: 42,
  hoverBoost: 0,
  airMode: true,
  failsafeLoiter: true,
  boardYaw: 0,
  rollPid: { p: 0.09, i: 0.12, d: 0.0005 },
  pitchPid: { p: 0.09, i: 0.12, d: 0.0005 },
  yawPid: { p: 0.12, i: 0.08, d: 0.0003 },
  angleP: 6,
  posP: 1.4,
  velP: 0.9,
  altP: 1.6,
  rcRate: 1.1,
  expo: 0.3,
  superRate: 0.55,
  mixer: QUAD_X_MIXER.map((r) => ({ ...r })),
}

function num(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback
  return Math.max(lo, Math.min(hi, v))
}

function pid(raw: unknown, fallback: DronePid): DronePid {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    p: num(o.p, 0, 2, fallback.p),
    i: num(o.i, 0, 4, fallback.i),
    d: num(o.d, 0, 1, fallback.d),
  }
}

function mixer(raw: unknown): MixerRow[] {
  if (!Array.isArray(raw) || raw.length < 4) return QUAD_X_MIXER.map((r) => ({ ...r }))
  return [0, 1, 2, 3].map((i) => {
    const r = raw[i] && typeof raw[i] === 'object' ? (raw[i] as Record<string, unknown>) : {}
    const fb = QUAD_X_MIXER[i] ?? QUAD_X_MIXER[0]
    return {
      throttle: num(r.throttle, -2, 2, fb.throttle),
      roll: num(r.roll, -2, 2, fb.roll),
      pitch: num(r.pitch, -2, 2, fb.pitch),
      yaw: num(r.yaw, -2, 2, fb.yaw),
    }
  })
}

export function parseDroneSpec(raw: unknown): DroneSpec {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const d = DEFAULT_DRONE_SPEC
  return {
    mass: num(o.mass, 0.2, 8, d.mass),
    arm: num(o.arm, 0.04, 0.6, d.arm),
    maxThrust: num(o.maxThrust, 1, 40, d.maxThrust),
    idle: num(o.idle, 0, 0.3, d.idle),
    drag: num(o.drag, 0.02, 4, d.drag),
    angDrag: num(o.angDrag, 0.01, 2, d.angDrag),
    maxAngle: num(o.maxAngle, 10, 70, d.maxAngle),
    hoverBoost: num(o.hoverBoost, -0.3, 0.3, d.hoverBoost),
    airMode: o.airMode !== false,
    failsafeLoiter: o.failsafeLoiter !== false,
    boardYaw: num(o.boardYaw, -180, 180, d.boardYaw),
    rollPid: pid(o.rollPid, d.rollPid),
    pitchPid: pid(o.pitchPid, d.pitchPid),
    yawPid: pid(o.yawPid, d.yawPid),
    angleP: num(o.angleP, 0.2, 20, d.angleP),
    posP: num(o.posP, 0.1, 8, d.posP),
    velP: num(o.velP, 0.1, 6, d.velP),
    altP: num(o.altP, 0.1, 8, d.altP),
    rcRate: num(o.rcRate, 0.2, 3, d.rcRate),
    expo: num(o.expo, 0, 1, d.expo),
    superRate: num(o.superRate, 0, 0.95, d.superRate),
    mixer: mixer(o.mixer),
  }
}

export function parseDroneMap(raw: unknown): Record<string, DroneSpec> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, DroneSpec> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k || !v || typeof v !== 'object') continue
    out[k] = parseDroneSpec(v)
  }
  return out
}

export function hoverThrottle(spec: DroneSpec): number {
  return (spec.mass * 9.82) / (4 * spec.maxThrust)
}
