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
  /** Base overhead height above a vehicle at rest and zoom 1, metres. */
  mapHeight: number
  /** Base overhead height above the player on foot at zoom 1, metres. */
  footMapHeight: number
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
  /**
   * Overhead heading response while driving, inverse seconds: a critically damped follower with
   * yaw-rate feed-forward, so steady turns have no lag and only bump noise is filtered.
   */
  mapHeadingResponse: number
  /** Overhead position response while driving, inverse seconds (critically damped, velocity feed-forward). */
  mapFollowResponse: number
  /** Fastest overhead heading change while driving, radians per second. */
  mapMaxYawRate: number
  /** Heading response while the vehicle tumbles (rollover, upside down), inverse seconds. */
  tumbleHeadingResponse: number
  /** Overhead position response while the vehicle tumbles, inverse seconds. */
  tumbleFollowResponse: number
  /** Fastest exterior-camera heading change while the vehicle tumbles, radians per second. */
  tumbleMaxYawRate: number
  /**
   * Tumbling starts when the chassis up axis leans past this cosine from the ground normal
   * (0.5 = 60 degrees, on its side or upside down) or the nose points steeply up or down.
   */
  tumbleUprightness: number
  /** Tumbling also starts when the chassis up axis swings faster than this, radians per second. */
  tumbleTiltRate: number
  /** Upright and calm this long before tumbling ends (hysteresis), seconds. */
  tumbleSettleSeconds: number
  /** Blend from the tumble response back to the driving response after landing, seconds. */
  tumbleRecoverySeconds: number
  /**
   * While tumbling, faster horizontal travel than this aims the heading along the line of travel
   * (whichever direction is nearer the current heading); slower, the heading is held. m/s.
   */
  tumbleTrackSpeed: number
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
  /** Cinematic orbit radius as a multiple of the vehicle's chase distance (or `chaseDistance`). */
  cinematicDistanceScale: number
  /** Minimum cinematic orbit radius at zoom 1, metres. */
  cinematicMinDistance: number
  /** Cinematic camera height above the target, as a fraction of the orbit radius. */
  cinematicElevation: number
  /** Time for one full cinematic orbit, seconds; zero holds the angle still. */
  cinematicOrbitSeconds: number
  /** Slow vertical drift amplitude of the cinematic camera, metres. */
  cinematicBob: number
  /** Cinematic vertical field of view, degrees (slightly long lens). */
  cinematicFov: number
  /** Vertical smoothing of the cinematic anchor (filters suspension bounce), inverse seconds. */
  cinematicDamping: number
  /** Delay before overhead-to-cockpit boarding transition, milliseconds. */
  entranceDelayMs: number
  /** Time after boarding when the cockpit transition finishes, milliseconds. */
  entranceEndMs: number
  /**
   * Eased blend (position, orientation and field of view) when the view changes while the
   * player stays in the same vehicle or on foot: C / gamepad B, start camera sequences, host
   * calls. Milliseconds; 0 cuts as before.
   */
  modeTransitionMs: number
}

/** Immutable defaults; each camera receives its own settings copy. */
export const gameCameraDefaults: Readonly<GameCameraSettings> = Object.freeze({
  autoCenterDelayMs: 10_000,
  autoCenterBlendMs: 500,
  chasePitch: 0.24,
  headPitch: 0.05,
  mapHeight: 45,
  footMapHeight: 18,
  mapMaxHeight: 600,
  mapSpeedSeconds: 2,
  mapMinZoom: 0.75,
  mapMaxZoom: 3,
  mapDamping: 3,
  mapHeadingResponse: 12,
  mapFollowResponse: 8,
  mapMaxYawRate: 6,
  tumbleHeadingResponse: 2.5,
  tumbleFollowResponse: 3,
  tumbleMaxYawRate: 1.2,
  tumbleUprightness: 0.5,
  tumbleTiltRate: 3,
  tumbleSettleSeconds: 0.4,
  tumbleRecoverySeconds: 1.5,
  tumbleTrackSpeed: 3,
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
  cinematicDistanceScale: 2.4,
  cinematicMinDistance: 9,
  cinematicElevation: 0.32,
  cinematicOrbitSeconds: 48,
  cinematicBob: 0.8,
  cinematicFov: 38,
  cinematicDamping: 4,
  entranceDelayMs: 150,
  entranceEndMs: 1200,
  modeTransitionMs: 700,
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
  for (const key of [
    'speedDampingDivisor',
    'nearClip',
    'firstPersonFov',
    'chaseFov',
    'cinematicFov',
    'footMapHeight',
  ] as const) {
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
  if (settings.tumbleUprightness >= 1) throw new RangeError('tumbleUprightness must be below 1')
  if (settings.footMapHeight >= settings.mapMaxHeight)
    throw new RangeError('mapMaxHeight must exceed footMapHeight')
  if (settings.firstPersonFov >= 180 || settings.chaseFov >= 180 || settings.cinematicFov >= 180)
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
