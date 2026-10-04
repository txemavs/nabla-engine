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

export function createGameCameraState(): GameCameraState {
  return {
    mode: 'chase',
    firstPerson: true,
    yaw: 0,
    pitch: 0.24,
    headYaw: 0,
    headPitch: 0.05,
    lastLookTime: 0,
    mapHeight: 45,
    mapZoom: 1,
    entrance: null,
    telemetry: new DrivingTelemetry(),
  }
}

/** Studio's gameplay camera, independent of editor UI and renderer ownership.
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
  const fov = (cockpit && info) || (!p.vehicleId && firstPerson) ? 70 : 48
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
    )
  } else if (info && p.speed > 1 && now - lastLookTime > 1400 && !cockpit) {
    const wanted = Math.atan2(-vehicleForward.x, -vehicleForward.z)
    yaw +=
      Math.atan2(Math.sin(wanted - yaw), Math.cos(wanted - yaw)) *
      (1 - Math.exp(-2 * Math.min(dt, 0.1)))
  }
  const target: Vec3Tuple = [
    p.position[0],
    p.position[1] + (info?.isCarrier ? 1 : 0.55),
    p.position[2],
  ]
  if (p.interiorId) {
    const anchor = new THREE.Vector3(0, 0.55, 0)
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
    const wantedHeight = overheadDrivingHeight(drivingTelemetry.speed, mapZoom)
    mapHeight += (wantedHeight - mapHeight) * (1 - Math.exp(-3 * Math.min(dt, 0.1)))
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
        Math.min(3.5, drivingTelemetry.speed * 0.14) *
        THREE.MathUtils.smoothstep(now - lastLookTime, 900, 1400)
      target[0] += vehicleForward.x * ahead
      target[2] += vehicleForward.z * ahead
    }
    const distance =
      (info?.cameraDistance ?? 5.5) * (1 + 2 * THREE.MathUtils.smoothstep(altitude, 50000, 2000000))
    const travelPitch =
      now - lastLookTime > 10000
        ? Math.max(pitch, THREE.MathUtils.smoothstep(altitude, 1000, 500000) * 1.56)
        : pitch
    const desired: Vec3Tuple = [
      cameraAnchor[0] + Math.sin(yaw) * distance * Math.cos(travelPitch),
      cameraAnchor[1] + 0.8 + Math.sin(travelPitch) * distance,
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
    const t = THREE.MathUtils.smoothstep(elapsed, 150, 1200)
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
    if (elapsed >= 1200) vehicleEntrance = null
  } else vehicleEntrance = null

  state.yaw = yaw
  state.mapHeight = mapHeight
  state.entrance = vehicleEntrance
  return { player: p, info, altitude, cockpit, overhead }
}
