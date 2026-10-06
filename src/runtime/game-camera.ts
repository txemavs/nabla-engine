/** Shared gameplay camera with configurable manual-look recovery. Times are milliseconds; dt is seconds. */
import {
  cameraRecovery,
  resolveGameCameraSettings,
  type GameCameraSettings,
} from '../config/camera.js'
import * as THREE from 'three'
import type { Simulation } from '../simulation/simulation.js'
import type { SceneView } from '../presentation/scene-view.js'
import type { Vec3Tuple } from '../entity/schema.js'
import { localToGeo } from '../math/geo/sphere.js'
import {
  driverHeadPose,
  overheadDrivingPose,
  overheadDrivingHeight,
  overheadFootHeight,
  followDrivingHeading,
  headingDirection,
  CriticalFollow,
  DrivingTelemetry,
  GroundHeading,
} from '../render/entity/driving-camera.js'
import { advanceCinematicAngle, cinematicOrbitPose } from '../render/entity/cinematic-camera.js'

/**
 * Gameplay camera modes. `chase` is the exterior view (third person on foot), `cockpit` the
 * seated driver view, `map` the overhead (cenital) view and `cinematic` a slow drone orbit.
 * On foot, `firstPerson` selects first or third person while the mode is `chase`/`cockpit`.
 */
export type GameCameraMode = 'chase' | 'cockpit' | 'map' | 'cinematic'

/** Stable view names exposed to hosts (canvas `data-camera-mode`, HUD label keys). */
export type GameCameraView = 'first-person' | 'chase' | 'cockpit' | 'map' | 'cinematic'

export interface GameCameraState {
  settings: GameCameraSettings
  mode: GameCameraMode
  firstPerson: boolean
  yaw: number
  pitch: number
  headYaw: number
  headPitch: number
  lastLookTime: number
  mapHeight: number
  mapZoom: number
  /** Cinematic orbit angle (chase-yaw convention), radians. */
  cinematicAngle: number
  /** Wheel multiplier for the cinematic orbit radius. */
  cinematicZoom: number
  /** Vertically smoothed cinematic anchor height, metres; null re-seeds it next frame. */
  cinematicAnchorY: number | null
  entrance: { id: string; started: number } | null
  telemetry: DrivingTelemetry
  /** Current upward tilt of the flight chase camera, radians; eases toward `flightChaseTilt`. */
  flightTilt: number
  /** Roll-independent smoothed vehicle heading; keeps exterior views calm in a rollover. */
  groundHeading: GroundHeading
  /** Critically damped overhead anchor that follows the vehicle. */
  mapFollow: CriticalFollow
  /** Active eased blend from the previous view into the current one, or null. */
  transition: GameCameraTransition | null
  /** Blend length for the next view change only (start sequences); null uses `modeTransitionMs`. */
  nextTransitionMs: number | null
  /** Last rendered pose and view; a view change blends from here. */
  lastPose: {
    position: THREE.Vector3
    quaternion: THREE.Quaternion
    fov: number
    anchor: THREE.Vector3
  } | null
  lastView: { view: GameCameraView; vehicleId: string | null } | null
}

/**
 * Blend from the pose shown before a view change. The start position is kept relative to the
 * player (`offset` from the player's position), so it travels with a moving vehicle.
 */
export interface GameCameraTransition {
  offset: THREE.Vector3
  quaternion: THREE.Quaternion
  fov: number
  /** Milliseconds, same clock as `updateGameCamera`'s `now`. */
  started: number
  duration: number
}

/** Create independent camera state and validate per-consumer recovery overrides. */
export function createGameCameraState(settings: Partial<GameCameraSettings> = {}): GameCameraState {
  const resolved = resolveGameCameraSettings(settings)
  return {
    settings: resolved,
    mode: 'chase',
    firstPerson: true,
    yaw: 0,
    pitch: resolved.chasePitch,
    headYaw: 0,
    headPitch: resolved.headPitch,
    lastLookTime: 0,
    mapHeight: resolved.mapHeight,
    mapZoom: 1,
    cinematicAngle: 0,
    cinematicZoom: 1,
    cinematicAnchorY: null,
    entrance: null,
    telemetry: new DrivingTelemetry(resolved),
    flightTilt: 0,
    groundHeading: new GroundHeading(resolved),
    mapFollow: new CriticalFollow(),
    transition: null,
    nextTransitionMs: null,
    lastPose: null,
    lastView: null,
  }
}

/**
 * Views where plain mouse movement looks around with no button held: the exterior
 * chase/third-person camera, on-foot first person and the seated driver view. The vehicle
 * overhead and cinematic views ignore mouse movement (the wheel still zooms). On foot the
 * mouse always turns the player's heading, which also rotates the heading-up overhead view.
 * Pointer capture itself is unaffected: the game keeps owning the mouse until Esc.
 */
export function mouseLooksWithoutButton(
  state: Pick<GameCameraState, 'mode'>,
  seated: boolean,
): boolean {
  return !(seated && (state.mode === 'map' || state.mode === 'cinematic'))
}

/** Overhead and cinematic views are detached from the player's eyes in every context. */
function detachedView(mode: GameCameraMode): boolean {
  return mode === 'map' || mode === 'cinematic'
}

/** True when the view is rendered from the player's or driver's eyes. */
export function isFirstPersonView(
  state: Pick<GameCameraState, 'mode' | 'firstPerson'>,
  seated: boolean,
): boolean {
  if (seated) return state.mode === 'cockpit'
  return state.firstPerson && !detachedView(state.mode)
}

/** Stable view name for hosts: `first-person`, `chase`, `cockpit`, `map` or `cinematic`. */
export function gameCameraView(
  state: Pick<GameCameraState, 'mode' | 'firstPerson'>,
  seated: boolean,
): GameCameraView {
  if (detachedView(state.mode)) return state.mode as GameCameraView
  if (seated) return state.mode as GameCameraView
  return state.firstPerson ? 'first-person' : 'chase'
}

/**
 * The single camera cycle behind C / gamepad B. Seated: exterior → driver → overhead →
 * cinematic → exterior. On foot: first person → third person → overhead → cinematic → first
 * person. Mutates `state` and returns the new view.
 */
export function cycleGameCamera(state: GameCameraState, seated: boolean): GameCameraView {
  const view = gameCameraView(state, seated)
  const next: Record<GameCameraView, GameCameraView> = seated
    ? {
        chase: 'cockpit',
        cockpit: 'map',
        map: 'cinematic',
        cinematic: 'chase',
        'first-person': 'cockpit',
      }
    : {
        'first-person': 'chase',
        chase: 'map',
        cockpit: 'map',
        map: 'cinematic',
        cinematic: 'first-person',
      }
  const wanted = next[view]
  setGameCameraView(state, wanted, seated)
  return wanted
}

/**
 * Switch to `wanted` the way C does (pitch, head look and cinematic orbit reset). The next
 * `updateGameCamera` blends into it over `modeTransitionMs` (or `nextTransitionMs`).
 */
export function setGameCameraView(
  state: GameCameraState,
  wanted: GameCameraView,
  seated: boolean,
): void {
  state.entrance = null
  if (wanted === 'first-person') {
    state.mode = 'chase'
    state.firstPerson = true
  } else {
    state.mode = wanted
    if (!seated && wanted === 'chase') state.firstPerson = false
  }
  if (wanted === 'cinematic') {
    // Start the orbit behind the current heading so the cut keeps the scene's orientation.
    state.cinematicAngle = state.yaw
    state.cinematicAnchorY = null
  }
  if (seated) {
    state.pitch = state.mode === 'cockpit' ? state.settings.headPitch : state.settings.chasePitch
    state.headYaw = 0
    state.headPitch = state.settings.headPitch
  }
}

/** Shared gameplay camera, independent of editor UI and renderer ownership.
 * Coordinates remain in world space; the renderer applies its floating origin afterwards.
 */
export function updateGameCamera(
  sim: Simulation,
  view: Pick<SceneView, 'document' | 'vehicleHeadOffset' | 'objects'>,
  camera: THREE.PerspectiveCamera,
  state: GameCameraState,
  now: number,
  dt: number,
  prepareVehicle?: (body: THREE.Object3D, camera: THREE.PerspectiveCamera) => void,
) {
  const tuning = state.settings
  const {
    mode: cameraMode,
    firstPerson,
    pitch,
    headYaw,
    headPitch,
    lastLookTime,
    mapZoom,
    telemetry: drivingTelemetry,
  } = state
  let { yaw, mapHeight, entrance: vehicleEntrance } = state
  // Only the exterior chase view keeps the flight tilt; every other view drops it.
  let flightTilt = 0
  const p = { ...sim.player, position: sim.renderPlayerPosition }
  const cockpit = cameraMode === 'cockpit'
  const overhead = cameraMode === 'map'
  const cinematic = cameraMode === 'cinematic'
  const eyes = isFirstPersonView({ mode: cameraMode, firstPerson }, !!p.vehicleId)
  const playerFrame = sim.playerFrame
  const playerFrameQ = new THREE.Quaternion(...(playerFrame?.rotation ?? ([0, 0, 0, 1] as const)))
  camera.up.set(0, 1, 0).applyQuaternion(playerFrameQ)
  const geoPoint = view.document.geography ? localToGeo(view.document.geography, p.position) : null
  const altitude = geoPoint ? geoPoint.altitude - view.document.geography!.altitude : p.position[1]
  const info = p.vehicleId ? sim.vehicleInfo(p.vehicleId, true) : null
  drivingTelemetry.update(p.vehicleId, p.speed, info?.turnRate ?? 0, dt)
  const fov = cinematic
    ? tuning.cinematicFov
    : (cockpit && info) || (!p.vehicleId && eyes)
      ? tuning.firstPersonFov
      : tuning.chaseFov
  if (camera.fov !== fov) {
    camera.fov = fov
    camera.updateProjectionMatrix()
  }
  const vehicleRotation = info ? sim.entityTransform(p.vehicleId!, true).rotation : null
  const vehicleForward = vehicleRotation
    ? new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(...vehicleRotation))
    : new THREE.Vector3(0, 0, -1)
  // Rollovers: the raw chassis heading flips and spins; exterior views use the
  // roll-independent tracker until the car has settled (`calm` back at 1).
  const groundHeading = state.groundHeading
  const frameQ = playerFrame ? playerFrameQ : null
  if (vehicleRotation) {
    groundHeading.update(p.vehicleId!, p.position, vehicleRotation, frameQ, dt)
    // The overhead view centre: half a vertical half-frustum ahead of the car along the smoothed
    // heading, so the car projects to 75% screen height. Following the centre (not the car)
    // also filters the look-ahead swing while the heading turns.
    const lookAhead = mapHeight * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.5
    state.mapFollow.update(
      new THREE.Vector3(...p.position).addScaledVector(
        headingDirection(groundHeading.heading, frameQ),
        lookAhead,
      ),
      dt,
      THREE.MathUtils.lerp(
        tuning.tumbleFollowResponse,
        tuning.mapFollowResponse,
        groundHeading.calm * groundHeading.calm,
      ),
      tuning.maxStepSeconds,
    )
  } else {
    groundHeading.clear()
    state.mapFollow.reset()
  }
  const calm = vehicleRotation ? groundHeading.calm : 1
  const steadyForward = calm < 1 ? headingDirection(groundHeading.heading, frameQ) : vehicleForward
  if (info && !info.flightMode && !cockpit) {
    const wanted = Math.atan2(-steadyForward.x, -steadyForward.z)
    yaw = followDrivingHeading(
      yaw,
      wanted,
      // Spin about the vertical axis is no cornering cue while the car tumbles.
      drivingTelemetry.turnRate * calm,
      drivingTelemetry.speed,
      dt,
      now - lastLookTime,
      state.settings,
    )
  } else if (
    info &&
    p.speed > tuning.flightMinSpeed &&
    now - lastLookTime > state.settings.autoCenterDelayMs &&
    !cockpit
  ) {
    const wanted = Math.atan2(-vehicleForward.x, -vehicleForward.z)
    yaw +=
      Math.atan2(Math.sin(wanted - yaw), Math.cos(wanted - yaw)) *
      (1 - Math.exp(-tuning.flightDamping * Math.min(dt, tuning.maxStepSeconds))) *
      cameraRecovery(now - lastLookTime, state.settings)
  }
  const target: Vec3Tuple = [
    p.position[0],
    p.position[1] + (info?.isCarrier ? tuning.carrierTargetHeight : tuning.targetHeight),
    p.position[2],
  ]
  if (p.interiorId) {
    const anchor = new THREE.Vector3(0, tuning.targetHeight, 0)
      .applyQuaternion(playerFrameQ)
      .add(new THREE.Vector3(...p.position))
    target.splice(0, 3, ...anchor.toArray())
  }
  let { cinematicAngle, cinematicAnchorY } = state
  if (cinematic) cinematicAngle = advanceCinematicAngle(cinematicAngle, dt, tuning)
  else cinematicAnchorY = null
  if (!p.vehicleId && eyes) {
    camera.position.fromArray(p.position)
    camera.quaternion
      .copy(playerFrameQ)
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ')))
  } else if (overhead) {
    // Heading-up in both cases: a vehicle's nose, or the walking heading (camera yaw, which
    // the mouse turns), points to the top of the screen, so W always moves up the screen.
    const wantedHeight = p.vehicleId
      ? overheadDrivingHeight(drivingTelemetry.speed, mapZoom, tuning)
      : overheadFootHeight(drivingTelemetry.speed, mapZoom, tuning)
    mapHeight +=
      (wantedHeight - mapHeight) *
      (1 - Math.exp(-tuning.mapDamping * Math.min(dt, tuning.maxStepSeconds)))
    // Vehicles: the followed view centre already sits ahead of the car (see `mapFollow`).
    // On foot the player stays centred; turning would otherwise swing the whole view.
    // Vehicles: the smoothed, roll-independent heading and the critically damped anchor, so a
    // rollover never rolls, flips or swings the view. On foot: the walking heading.
    const headingYaw = p.vehicleId ? groundHeading.heading : yaw
    const heading = playerFrameQ
      .clone()
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), headingYaw))
      .toArray()
    const map = overheadDrivingPose(
      p.vehicleId ? state.mapFollow.position.toArray() : p.position,
      heading,
      mapHeight,
      new THREE.Vector3(0, 1, 0).applyQuaternion(playerFrameQ),
      0,
    )
    camera.up.copy(map.up)
    camera.position.copy(map.position)
    camera.lookAt(map.target)
  } else if (cinematic) {
    // Smooth only the anchor height: suspension bounce and steps must not shake the shot,
    // while horizontal tracking stays exact so fast vehicles remain framed.
    cinematicAnchorY =
      cinematicAnchorY === null
        ? target[1]
        : cinematicAnchorY +
          (target[1] - cinematicAnchorY) *
            (1 - Math.exp(-tuning.cinematicDamping * Math.min(dt, tuning.maxStepSeconds)))
    const anchor: Vec3Tuple = [target[0], cinematicAnchorY, target[2]]
    const shot = cinematicOrbitPose(
      {
        target: anchor,
        angle: cinematicAngle,
        chaseDistance: info?.cameraDistance,
        zoom: state.cinematicZoom,
        frame: p.interiorId ? playerFrameQ : undefined,
      },
      tuning,
    )
    camera.position.fromArray(sim.cameraPosition(anchor, shot.position.toArray() as Vec3Tuple))
    camera.lookAt(shot.target)
  } else if (cockpit && info) {
    const head = driverHeadPose(
      info.driver,
      sim.entityTransform(p.vehicleId!, true).rotation,
      info.isCarrier,
      headYaw,
      headPitch,
      view.vehicleHeadOffset(p.vehicleId!),
      view.document.entities.find((entity) => entity.id === p.vehicleId)?.vehicle?.headRotation,
    )
    camera.position.copy(head.position)
    camera.quaternion.copy(head.quaternion)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(head.quaternion)
    yaw = Math.atan2(-forward.x, -forward.z)
  } else {
    // Look farther along the road without moving the camera toward the bonnet.
    // Manual orbit and automatic heading recovery share the same car-relative radius.
    const cameraAnchor = [...target]
    if (info && !info.isCarrier) {
      const ahead =
        Math.min(tuning.maxLookAhead, drivingTelemetry.speed * tuning.lookAheadSeconds) *
        cameraRecovery(now - lastLookTime, state.settings)
      target[0] += steadyForward.x * ahead
      target[2] += steadyForward.z * ahead
    }
    const distance =
      (info?.cameraDistance ?? tuning.chaseDistance) *
      (1 +
        tuning.altitudeDistanceGain *
          THREE.MathUtils.smoothstep(
            altitude,
            tuning.altitudeDistanceStart,
            tuning.altitudeDistanceEnd,
          ))
    const travelPitch =
      now - lastLookTime > state.settings.autoCenterDelayMs
        ? Math.max(
            pitch,
            THREE.MathUtils.smoothstep(
              altitude,
              tuning.altitudePitchStart,
              tuning.altitudePitchEnd,
            ) * tuning.altitudePitchMax,
          )
        : pitch
    const desired: Vec3Tuple = [
      cameraAnchor[0] + Math.sin(yaw) * distance * Math.cos(travelPitch),
      cameraAnchor[1] + tuning.chaseHeight + Math.sin(travelPitch) * distance,
      cameraAnchor[2] + Math.cos(yaw) * distance * Math.cos(travelPitch),
    ]
    if (p.interiorId) {
      const offset = new THREE.Vector3(...desired)
        .sub(new THREE.Vector3(...target))
        .applyQuaternion(playerFrameQ)
        .add(new THREE.Vector3(...target))
      desired.splice(0, 3, ...offset.toArray())
    }
    camera.position.fromArray(sim.cameraPosition(target, desired))
    camera.lookAt(...target)
    // Flight: lean the view back (pitch up) so the aircraft sits low and the route ahead shows.
    // The tilt fades out as the altitude travel pitch turns the view toward top-down.
    const wantedTilt = info?.flightMode
      ? tuning.flightChaseTilt *
        (1 -
          THREE.MathUtils.smoothstep(altitude, tuning.altitudePitchStart, tuning.altitudePitchEnd))
      : 0
    flightTilt =
      state.flightTilt +
      (wantedTilt - state.flightTilt) *
        (1 - Math.exp(-tuning.flightTiltDamping * Math.min(dt, tuning.maxStepSeconds)))
    if (flightTilt > 1e-4) camera.rotateX(flightTilt)
  }
  if (vehicleEntrance && vehicleEntrance.id === p.vehicleId && cockpit && info) {
    const elapsed = now - vehicleEntrance.started
    const t = THREE.MathUtils.smoothstep(elapsed, tuning.entranceDelayMs, tuning.entranceEndMs)
    const seatPosition = camera.position.clone()
    const seatRotation = camera.quaternion.clone()
    const top = overheadDrivingPose(
      p.position,
      sim.entityTransform(p.vehicleId!, true).rotation,
      mapHeight,
      new THREE.Vector3(0, 1, 0).applyQuaternion(playerFrameQ),
      0,
    )
    camera.position.copy(top.position)
    camera.up.copy(top.up)
    camera.lookAt(top.target)
    camera.position.lerp(seatPosition, t)
    camera.quaternion.slerp(seatRotation, t)
    const body = view.objects.get(p.vehicleId!)
    if (body) prepareVehicle?.(body, camera)
    if (elapsed >= tuning.entranceEndMs) vehicleEntrance = null
  } else vehicleEntrance = null

  // View changes blend from the last rendered pose (eased position, orientation and fov) while
  // the player stays in the same vehicle or on foot; boarding keeps its own entrance move.
  const cameraView = gameCameraView({ mode: cameraMode, firstPerson }, !!p.vehicleId)
  const vehicleKey = p.vehicleId ?? null
  const anchor = new THREE.Vector3(...p.position)
  let transition = state.transition
  const last = state.lastView
  if (last && state.lastPose && last.view !== cameraView) {
    const duration = state.nextTransitionMs ?? tuning.modeTransitionMs
    transition =
      last.vehicleId === vehicleKey && duration > 0
        ? {
            offset: state.lastPose.position.clone().sub(state.lastPose.anchor),
            quaternion: state.lastPose.quaternion.clone(),
            fov: state.lastPose.fov,
            started: now,
            duration,
          }
        : null
  }
  if (vehicleEntrance || (last && last.vehicleId !== vehicleKey)) transition = null
  if (transition) {
    const t = THREE.MathUtils.clamp((now - transition.started) / transition.duration, 0, 1)
    const k = THREE.MathUtils.smootherstep(t, 0, 1)
    const target = camera.position.clone()
    camera.position.copy(anchor).add(transition.offset).lerp(target, k)
    camera.quaternion.slerpQuaternions(transition.quaternion, camera.quaternion.clone(), k)
    const blendedFov = THREE.MathUtils.lerp(transition.fov, camera.fov, k)
    if (camera.fov !== blendedFov) {
      camera.fov = blendedFov
      camera.updateProjectionMatrix()
    }
    if (t >= 1) transition = null
  }
  state.transition = transition
  state.nextTransitionMs = null
  state.lastPose = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    fov: camera.fov,
    anchor,
  }
  state.lastView = { view: cameraView, vehicleId: vehicleKey }

  state.yaw = yaw
  state.mapHeight = mapHeight
  state.entrance = vehicleEntrance
  state.flightTilt = flightTilt
  state.cinematicAngle = cinematicAngle
  state.cinematicAnchorY = cinematicAnchorY
  return { player: p, info, altitude, cockpit, overhead, cinematic }
}
