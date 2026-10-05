/** Shared camera recovery settings. Durations carry explicit Ms/Seconds names. */
export interface GameCameraSettings {
  /** Time without manual look before automatic heading and framing can resume. */
  autoCenterDelayMs: number
  /** Smooth recovery ramp after the delay; zero resumes immediately. */
  autoCenterBlendMs: number
  /** Initial chase camera pitch, radians. */
  chasePitch: number
  /** Initial seated head pitch, radians. */
  headPitch: number
  /** Initial/minimum overhead height, metres. */
  mapHeight: number
  /** Maximum overhead height, metres. */
  mapMaxHeight: number
  /** Extra overhead height per metre/second of speed, seconds. */
  mapSpeedSeconds: number
  /** Minimum overhead zoom multiplier. */
  mapMinZoom: number
  /** Maximum overhead zoom multiplier. */
  mapMaxZoom: number
  /** Overhead height convergence rate, inverse seconds. */
  mapDamping: number
  /** First-person/cockpit vertical field of view, degrees. */
  firstPersonFov: number
  /** Exterior vertical field of view, degrees. */
  chaseFov: number
  /** Initial camera near clipping distance, metres. */
  nearClip: number
  /** Initial far clipping distance before terrain adjustment, metres. */
  farClip: number
  /** Base ground heading convergence rate, inverse seconds. */
  headingDamping: number
  /** Speed scale for extra heading damping, metres per second. */
  speedDampingDivisor: number
  /** Maximum extra heading damping, inverse seconds. */
  maxSpeedDamping: number
  /** Flight heading convergence rate, inverse seconds. */
  flightDamping: number
  /** Minimum flight speed enabling recovery, metres per second. */
  flightMinSpeed: number
  /** Turn-rate anticipation horizon, seconds. */
  turnAnticipationSeconds: number
  /** Maximum anticipation angle, radians. */
  maxTurnAnticipation: number
  /** Speed where corner anticipation begins, metres per second. */
  anticipationMinSpeed: number
  /** Speed where corner anticipation is fully enabled, metres per second. */
  anticipationFullSpeed: number
  /** Speed/turn telemetry convergence rate, inverse seconds. */
  telemetryDamping: number
  /** Camera damping frame-duration cap, seconds. */
  maxStepSeconds: number
  /** Speed-based forward look horizon, seconds. */
  lookAheadSeconds: number
  /** Maximum forward road look offset, metres. */
  maxLookAhead: number
  /** Fallback exterior camera radius, metres; vehicle definitions may override it. */
  chaseDistance: number
  /** Additional chase camera anchor height, metres. */
  chaseHeight: number
  /** Walking/car target height above player position, metres. */
  targetHeight: number
  /** Carrier target height above player position, metres. */
  carrierTargetHeight: number
  /** Altitude where exterior radius expansion begins, metres. */
  altitudeDistanceStart: number
  /** Altitude where exterior radius expansion ends, metres. */
  altitudeDistanceEnd: number
  /** Additional exterior radius multiplier at high altitude. */
  altitudeDistanceGain: number
  /** Altitude where downward travel pitch begins, metres. */
  altitudePitchStart: number
  /** Altitude where downward travel pitch reaches its maximum, metres. */
  altitudePitchEnd: number
  /** Maximum downward travel pitch, radians. */
  altitudePitchMax: number
  /** Upward tilt of the chase view while a vehicle is in flight mode, radians. */
  flightChaseTilt: number
  /** Flight chase tilt ease-in/out rate, inverse seconds. */
  flightTiltDamping: number
  /** Delay before overhead-to-cockpit boarding transition, milliseconds. */
  entranceDelayMs: number
  /** Time after boarding when the cockpit transition finishes, milliseconds. */
  entranceEndMs: number
}

/** Immutable defaults; each camera receives its own settings copy. */
export const gameCameraDefaults: Readonly<GameCameraSettings> = Object.freeze({
  autoCenterDelayMs: 10_000,
  autoCenterBlendMs: 500,
  chasePitch: 0.24,
  headPitch: 0.05,
  mapHeight: 45,
  mapMaxHeight: 600,
  mapSpeedSeconds: 2,
  mapMinZoom: 0.75,
  mapMaxZoom: 3,
  mapDamping: 3,
  firstPersonFov: 70,
  chaseFov: 48,
  nearClip: 0.1,
  farClip: 50000,
  headingDamping: 7,
  speedDampingDivisor: 5,
  maxSpeedDamping: 5,
  flightDamping: 2,
  flightMinSpeed: 1,
  turnAnticipationSeconds: 0.22,
  maxTurnAnticipation: 0.3,
  anticipationMinSpeed: 1,
  anticipationFullSpeed: 8,
  telemetryDamping: 5,
  maxStepSeconds: 0.1,
  lookAheadSeconds: 0.14,
  maxLookAhead: 3.5,
  chaseDistance: 5.5,
  chaseHeight: 0.8,
  targetHeight: 0.55,
  carrierTargetHeight: 1,
  altitudeDistanceStart: 50000,
  altitudeDistanceEnd: 2000000,
  altitudeDistanceGain: 2,
  altitudePitchStart: 1000,
  altitudePitchEnd: 500000,
  altitudePitchMax: 1.56,
  flightChaseTilt: 0.12,
  flightTiltDamping: 2,
  entranceDelayMs: 150,
  entranceEndMs: 1200,
})

/** Copy overrides and validate finite values and ordered camera ranges before use. */
export function resolveGameCameraSettings(
  overrides: Partial<GameCameraSettings> = {},
): GameCameraSettings {
  const settings = { ...gameCameraDefaults, ...overrides }
  for (const [name, value] of Object.entries(settings)) {
    if (!Number.isFinite(value) || value < 0)
      throw new RangeError(`${name} must be finite and non-negative`)
  }
  for (const key of ['speedDampingDivisor', 'nearClip', 'firstPersonFov', 'chaseFov'] as const) {
    if (settings[key] <= 0) throw new RangeError(`${key} must be positive`)
  }
  for (const [low, high] of [
    ['mapHeight', 'mapMaxHeight'],
    ['mapMinZoom', 'mapMaxZoom'],
    ['altitudeDistanceStart', 'altitudeDistanceEnd'],
    ['altitudePitchStart', 'altitudePitchEnd'],
    ['anticipationMinSpeed', 'anticipationFullSpeed'],
    ['entranceDelayMs', 'entranceEndMs'],
    ['nearClip', 'farClip'],
  ] as const) {
    if (settings[high] <= settings[low]) throw new RangeError(`${high} must exceed ${low}`)
  }
  if (settings.firstPersonFov >= 180 || settings.chaseFov >= 180)
    throw new RangeError('Camera field of view must be below 180 degrees')
  return settings
}

/** Return recovery strength after the manual-look grace period, including zero-duration ramps. */
export function cameraRecovery(
  sinceLookMs: number,
  settings: Readonly<GameCameraSettings>,
): number {
  if (sinceLookMs <= settings.autoCenterDelayMs) return 0
  if (settings.autoCenterBlendMs === 0) return 1
  const t = Math.min(1, (sinceLookMs - settings.autoCenterDelayMs) / settings.autoCenterBlendMs)
  return t * t * (3 - 2 * t)
}
