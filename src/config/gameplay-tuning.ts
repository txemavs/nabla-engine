/** Player-facing tuning defaults. Edit here, then rebuild. See docs/gameplay-tuning.md.
 * Units are explicit: degrees for pose offsets/FOV, metres for world/view positions,
 * milliseconds for animation durations, radians for reviewed base rotations. */
import type { GameCameraSettings } from './camera.js'
import type { WeaponPoseTuning } from '../runtime/weapon-pose-tuning.js'
import type { SidearmTuning } from '../runtime/sidearm-tuning.js'

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
  avatarFollowResponse: 14,
  avatarYawResponse: 14,
  riderHeadResponse: 4,
})

export const weaponPoseDefaults: WeaponPoseTuning = {
  slide: { pitch: 0, yaw: -33.9, roll: 91.2, x: -90.8, y: 0, z: 0 },
  slideAimed: { pitch: 4.5, yaw: -19.8, roll: 45.7, x: 16.6, y: 5.2, z: -375.8 },
  slideInspect: { pitch: 11.2, yaw: -41, roll: -26.6, x: 0, y: 0, z: 0 },
  slideInspectAimed: { pitch: 29.6, yaw: -19.8, roll: -47.2, x: 0, y: 0, z: 0 },
  slideChamber: { pitch: 48, yaw: -17.5, roll: 27.1, x: 0, y: 0, z: 0 },
  slideChamberAimed: { pitch: 63, yaw: -22.2, roll: 12.7, x: 0, y: 0, z: 0 },
  normal: { pitch: 0, yaw: 0, roll: 0, x: 0, y: 0, z: 0 },
  aimed: { pitch: 0, yaw: 0, roll: 0, x: 0, y: 0, z: 0 },
  inspect: { pitch: 11.2, yaw: -41, roll: -26.6, x: 0, y: 0, z: 0 },
  inspectAimed: { pitch: 29.6, yaw: -19.8, roll: -47.2, x: 0, y: 0, z: 0 },
  chamber: { pitch: 48, yaw: -17.5, roll: 27.1, x: 0, y: 0, z: 0 },
  chamberAimed: { pitch: 63, yaw: -22.2, roll: 12.7, x: 0, y: 0, z: 0 },
}

export const sidearmTuningDefaults: Readonly<SidearmTuning> = { height: -0.022, angle: -1.2 }
export const sidearmTuningRanges = { height: [-0.08, 0.015, 0.001], angle: [-5, 8, 0.1] } as const

export const cameraFovTuning = { min: -15, max: 25, step: 5, default: 15 }
export const normalViewTuning = {
  enabled: true,
  extraFovDegrees: 12,
  footDropMetres: 0.18,
  yawLimitRadians: 0.16,
  pitchLimitRadians: 0.11,
  followRate: 3.5,
  aimedFollowRate: 22,
}
export const weaponViewTuning = {
  alignmentDistanceMetres: 25,
  thirdPerson: { shoulder: [0.22, -0.2, 0] as const, reachMetres: 0.58 },
  hip: { position: [0.1, -0.125, -0.34] as const, fov: 55 },
  aimed: { position: [0, -0.027, -0.2] as const, fov: 42 },
  aimBlendPerFrame: 0.28,
  inspectBlendMs: 90,
  slideBlendMs: 70,
  chamberBaseRadians: { pitch: 0.85, yaw: 0, roll: 0.22 },
  inspectBaseRadians: { yaw: 0.9, roll: -0.35, raiseMetres: 0.055 },
}
export const focusTuning = {
  radiusPixels: 12,
  sideStart: 0.12,
  sideEnd: 0.4,
  nearStartMetres: 2,
  nearEndMetres: 18,
}
export const laserTuning = {
  pointRadiusMetres: 0.003,
  haloSizeMetres: 0.025,
  haloOpacity: 0.95,
  surfaceOffsetMetres: 0.012,
  distanceGrowth: 0.015,
  maxGrowth: 2,
  beamWidthPixels: 7,
}
export const smokeTuning = { defaultPercent: 50, maxPercent: 300 }
/** Arcade overheating response, not measured firearm temperatures. */
export const weaponHeatTuning = {
  heatPerShotC: 9,
  coolingSeconds: 30,
  hotRiseC: 300,
  glowStarts: 0.3,
  smokeStarts: 0.15,
  spreadStarts: 0.2,
  maxSpreadDegrees: 2,
}
/** Contact speeds are relative impact speeds, not dashboard speeds. */
export const vehicleDamageTuning = {
  minimumImpactSpeed: 3,
  catastrophicImpactSpeed: 50,
  contactWindowSeconds: 0.35,
  damagePerSpeed: 0.3,
  maxOrdinaryDamage: 10,
  smokeMaxAmount: 2,
}
/** Jump orientation assistance: angular acceleration (rad/s²), no linear thrust. */
export const jumpControlTuning = {
  pitchAcceleration: 0.9,
  yawAcceleration: 0.35,
  rollAcceleration: 0.5,
  riderPitchAcceleration: 0.8,
  riderRollAcceleration: 1.0,
  maxAssistedRate: 1.8,
}
export const explosionTuning = {
  radiusMetres: 12,
  impulseSpeed: 9,
  offsetX: 0.8,
  offsetY: 0.6,
  offsetZ: 0.8,
  directionJitter: 0.25,
  debrisDrag: 4.5,
  debrisSleepSpeed: 0.18,
  smokeSeconds: 45,
  smokeFadeSeconds: 15,
  flameSeconds: 12,
}
export const balloonTuning = {
  emissionSeconds: 30,
  intervalSeconds: 0.18,
  lifetimeSeconds: 12,
  maxCount: 240,
  openingRadians: 1.15,
  openingRate: 5,
}
