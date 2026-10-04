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
  followDrivingHeading,
  DrivingTelemetry,
} from '../render/entity/driving-camera.js'

export interface GameCameraState {
  settings: GameCameraSettings
  mode: 'chase' | 'cockpit' | 'map'
  firstPerson: boolean
  yaw: number
  pitch: number
  headYaw: number
  headPitch: number
  lastLookTime: number
  mapHeight: number
  mapZoom: number
  entrance: { id: string; started: number } | null
  telemetry: DrivingTelemetry
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
    entrance: null,
    telemetry: new DrivingTelemetry(resolved),
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
  const p = { ...sim.player, position: sim.renderPlayerPosition }
  const cockpit = cameraMode === 'cockpit'
  const overhead = cameraMode === 'map' && !!p.vehicleId
  const playerFrame = sim.playerFrame
  const playerFrameQ = new THREE.Quaternion(...(playerFrame?.rotation ?? ([0, 0, 0, 1] as const)))
  camera.up.set(0, 1, 0).applyQuaternion(playerFrameQ)
  const geoPoint = view.document.geography ? localToGeo(view.document.geography, p.position) : null
  const altitude = geoPoint ? geoPoint.altitude - view.document.geography!.altitude : p.position[1]
  const info = p.vehicleId ? sim.vehicleInfo(p.vehicleId, true) : null
  drivingTelemetry.update(p.vehicleId, p.speed, info?.turnRate ?? 0, dt)
  const fov =
    (cockpit && info) || (!p.vehicleId && firstPerson) ? tuning.firstPersonFov : tuning.chaseFov
  if (camera.fov !== fov) {
    camera.fov = fov
    camera.updateProjectionMatrix()
  }
  const vehicleForward = info
    ? new THREE.Vector3(0, 0, -1).applyQuaternion(
        new THREE.Quaternion(...sim.entityTransform(p.vehicleId!, true).rotation),
      )
    : new THREE.Vector3(0, 0, -1)
  if (info && !info.flightMode && !cockpit) {
    const wanted = Math.atan2(-vehicleForward.x, -vehicleForward.z)
    yaw = followDrivingHeading(
      yaw,
      wanted,
      drivingTelemetry.turnRate,
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
  if (!p.vehicleId && firstPerson) {
    camera.position.fromArray(p.position)
    camera.quaternion
      .copy(playerFrameQ)
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ')))
  } else if (overhead) {
    const wantedHeight = overheadDrivingHeight(drivingTelemetry.speed, mapZoom, tuning)
    mapHeight +=
      (wantedHeight - mapHeight) *
      (1 - Math.exp(-tuning.mapDamping * Math.min(dt, tuning.maxStepSeconds)))
    // Offset half a vertical half-frustum: the car projects to 75% screen height.
    const lookAhead = mapHeight * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.5
    const map = overheadDrivingPose(
      p.position,
      sim.entityTransform(p.vehicleId!, true).rotation,
      mapHeight,
      new THREE.Vector3(0, 1, 0).applyQuaternion(playerFrameQ),
      lookAhead,
    )
    camera.up.copy(map.up)
    camera.position.copy(map.position)
    camera.lookAt(map.target)
  } else if (cockpit && info) {
    const head = driverHeadPose(
      info.driver,
      sim.entityTransform(p.vehicleId!, true).rotation,
      info.isCarrier,
      headYaw,
      headPitch,
      view.vehicleHeadOffset(p.vehicleId!),
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
      target[0] += vehicleForward.x * ahead
      target[2] += vehicleForward.z * ahead
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

  state.yaw = yaw
  state.mapHeight = mapHeight
  state.entrance = vehicleEntrance
  return { player: p, info, altitude, cockpit, overhead }
}
