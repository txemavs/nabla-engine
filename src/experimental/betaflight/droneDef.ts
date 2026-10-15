// Adapted from txemavs/agency-ui 89b0907, by permission of the author.
/**
 * Mode 2 channels + mixer. µs like Betaflight (1000–2000, 1500 centre).
 *
 *   CH1 roll   CH2 pitch   CH3 throttle   CH4 yaw
 *   CH5 arm    CH6 mode    CH7 look-at    CH8 unused
 */
export const CHANNEL_COUNT = 8
export const US_MIN = 1000
export const US_MID = 1500
export const US_MAX = 2000

export const FLIGHT_MODES = ['acro', 'angle', 'loiter', 'auton'] as const
export type FlightMode = (typeof FLIGHT_MODES)[number]

export const MODE_US: Record<FlightMode, number> = {
  acro: 1100,
  angle: 1400,
  loiter: 1700,
  auton: 1900,
}

export interface MixerRow {
  throttle: number
  roll: number
  pitch: number
  yaw: number
}

/** Quad X: FL FR RR RL. */
export const QUAD_X_MIXER: MixerRow[] = [
  { throttle: 1, roll: -1, pitch: 1, yaw: -1 },
  { throttle: 1, roll: 1, pitch: 1, yaw: 1 },
  { throttle: 1, roll: 1, pitch: -1, yaw: -1 },
  { throttle: 1, roll: -1, pitch: -1, yaw: 1 },
]

export interface DroneInput {
  roll: number
  pitch: number
  throttle: number
  yaw: number
  arm: boolean
  mode: FlightMode
  recover?: boolean
  waypoint?: { x: number; y: number; z: number } | null
  lookAt?: { x: number; z: number } | null
}

export interface DroneSnapshot {
  armed: boolean
  mode: FlightMode
  motors: [number, number, number, number]
  channels: number[]
  velocity: { x: number; y: number; z: number }
  ypr: { yaw: number; pitch: number; roll: number }
  alt: number
  voltage: number
}

export function emptyDroneSnapshot(): DroneSnapshot {
  return {
    armed: false,
    mode: 'angle',
    motors: [0, 0, 0, 0],
    channels: midChannels(),
    velocity: { x: 0, y: 0, z: 0 },
    ypr: { yaw: 0, pitch: 0, roll: 0 },
    alt: 0,
    voltage: 16.8,
  }
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export function clampUnit(n: number): number {
  return clamp(n, -1, 1)
}

export function usToUnit(us: number): number {
  return (clamp(us, US_MIN, US_MAX) - US_MID) / 500
}

export function throttleUsToUnit(us: number): number {
  return (clamp(us, US_MIN, US_MAX) - US_MIN) / 1000
}

export function unitToUs(unit: number): number {
  return Math.round(US_MID + clampUnit(unit) * 500)
}

export function throttleToUs(t: number): number {
  return Math.round(US_MIN + clamp(t, 0, 1) * 1000)
}

export function midChannels(): number[] {
  return [US_MID, US_MID, US_MIN, US_MID, US_MIN, MODE_US.angle, US_MIN, US_MID]
}

export function parseFlightMode(raw: unknown): FlightMode {
  return FLIGHT_MODES.includes(raw as FlightMode) ? (raw as FlightMode) : 'angle'
}

export function modeFromUs(us: number): FlightMode {
  if (us < 1250) return 'acro'
  if (us < 1550) return 'angle'
  if (us < 1800) return 'loiter'
  return 'auton'
}

/** Mode 2 sticks → 8 channels. pitch +1 = stick forward (nose down). */
export function mode2Channels(input: {
  roll: number
  pitch: number
  throttle: number
  yaw: number
  arm: boolean
  mode: FlightMode
  lookHold?: boolean
}): number[] {
  return [
    unitToUs(input.roll),
    unitToUs(input.pitch),
    throttleToUs(input.throttle),
    unitToUs(input.yaw),
    input.arm ? US_MAX : US_MIN,
    MODE_US[input.mode],
    input.lookHold ? US_MAX : US_MIN,
    US_MID,
  ]
}

export function mixMotors(
  throttle: number,
  roll: number,
  pitch: number,
  yaw: number,
  mixer: MixerRow[] = QUAD_X_MIXER,
): [number, number, number, number] {
  const out: number[] = []
  for (const row of mixer) {
    out.push(
      clamp(row.throttle * throttle + row.roll * roll + row.pitch * pitch + row.yaw * yaw, 0, 1),
    )
  }
  return [out[0] ?? 0, out[1] ?? 0, out[2] ?? 0, out[3] ?? 0]
}

export function applyExpo(x: number, expo: number): number {
  const u = clampUnit(x)
  const e = clamp(expo, 0, 1)
  return u * (1 - e) + u * u * u * e
}

export function applyRates(stick: number, rcRate: number, expo: number, superRate: number): number {
  const x = applyExpo(stick, expo)
  const r = clamp(rcRate, 0.01, 3)
  const s = clamp(superRate, 0, 0.99)
  const abs = Math.abs(x)
  const superMul = 1 / (1 - abs * s)
  return x * r * 200 * superMul * (Math.PI / 180)
}
