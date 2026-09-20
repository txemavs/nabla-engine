/**
 * Nabla Drive Playground — avatar + boxcar + ship5x10 demo.
 *
 * Demonstrates:
 * - Avatar walking with WASD
 * - Rocket/jetpack flight (hold Shift)
 * - Approach and mount vehicles (E key)
 * - Drive with full Cannon-es physics
 * - Exit back to walk/fly
 */
import {
  VehicleWorld,
  BOXCAR_SPEC,
  BOXCAR_MOUNTS,
  BOXCAR_SIZE,
  BOXCAR_WHEEL_RADIUS,
  boxcarWheelPositions,
  SHIP_5X10_SPEC,
  SHIP_MOUNTS,
  SHIP_SIZE,
  type DriveView,
  driveCamera,
  driveExitPosition,
  nextDriveView,
  identityDriveLook,
  driveLookDelta,
  type DriveLook,
  type DriveState,
  type CarPackMounts,
  DRIVE_NEAR_M,
  createAvatarState,
  stepAvatar,
  avatarCamera,
  avatarBodyPose,
  cycleAvatarView,
  setAvatarDriving,
  teleportAvatar,
  type AvatarState,
  type AvatarInput,
  emptyAvatarInput,
  WALK_EYE_HEIGHT_MM,
} from '@nabla/engine'
import { Renderer, type BoxMesh, type Camera } from './renderer.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const hud = document.getElementById('hud') as HTMLDivElement
const renderer = new Renderer(canvas)

const CAR_START = { x: 5, y: 0, z: -5, yaw: 0 }
const SHIP_START = { x: -10, y: 0, z: -15, yaw: 45 }
// Avatar spawns behind origin, facing forward (-Z), sees ground circle + car + ship
const AVATAR_START = { x: 0, y: WALK_EYE_HEIGHT_MM / 1000, z: 8, yaw: 0 }

const CAR_COLOR: [number, number, number] = [0.9, 0.3, 0.2]
const WHEEL_COLOR: [number, number, number] = [0.15, 0.15, 0.15]
const SHIP_COLOR: [number, number, number] = [0.2, 0.5, 0.8]
const AVATAR_COLOR: [number, number, number] = [0.3, 0.8, 0.4]

interface Vehicle {
  id: string
  world: VehicleWorld
  mounts: CarPackMounts
  size: { x: number; y: number; z: number }
  color: [number, number, number]
  isHull: boolean
  wheelRadius?: number
  wheels?: ReturnType<typeof boxcarWheelPositions>
}

const carWorld = new VehicleWorld(BOXCAR_SPEC)
carWorld.mount(CAR_START, BOXCAR_SPEC)

const shipWorld = new VehicleWorld(SHIP_5X10_SPEC)
shipWorld.mount(SHIP_START, SHIP_5X10_SPEC)

const vehicles: Vehicle[] = [
  {
    id: 'boxcar',
    world: carWorld,
    mounts: BOXCAR_MOUNTS,
    size: BOXCAR_SIZE,
    color: CAR_COLOR,
    isHull: false,
    wheelRadius: BOXCAR_WHEEL_RADIUS,
    wheels: boxcarWheelPositions(),
  },
  {
    id: 'ship5x10',
    world: shipWorld,
    mounts: SHIP_MOUNTS,
    size: SHIP_SIZE,
    color: SHIP_COLOR,
    isHull: true,
  },
]

let avatar: AvatarState = createAvatarState(AVATAR_START)
let activeVehicle: Vehicle | null = null
let driveView: DriveView = 'chase'
let driveLook: DriveLook = identityDriveLook()

const keys = new Set<string>()
const input: AvatarInput = emptyAvatarInput()
let mouseDx = 0, mouseDy = 0
let pointerLocked = false

window.addEventListener('keydown', (e) => {
  keys.add(e.code)
  if (e.code === 'KeyC') {
    if (activeVehicle) {
      driveView = nextDriveView(driveView)
      driveLook = identityDriveLook()
    } else {
      avatar = cycleAvatarView(avatar)
    }
  }
  if (e.code === 'KeyE') {
    toggleMount()
  }
  if (e.code === 'Space' && activeVehicle) {
    e.preventDefault()
  }
})
window.addEventListener('keyup', (e) => keys.delete(e.code))

canvas.addEventListener('click', () => {
  if (!pointerLocked) {
    canvas.requestPointerLock()
  }
})

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas
})

document.addEventListener('mousemove', (e) => {
  if (pointerLocked) {
    mouseDx += e.movementX
    mouseDy += e.movementY
  }
})

function findNearestVehicle(): Vehicle | null {
  const pos = activeVehicle ? activeVehicle.world.readPose() : { x: avatar.x, z: avatar.z }
  let best: Vehicle | null = null
  let bestDist = activeVehicle ? 15 : DRIVE_NEAR_M
  for (const v of vehicles) {
    if (v === activeVehicle) continue
    const vpos = v.world.readPose()
    const reach = v.isHull ? 12 : DRIVE_NEAR_M
    const d = Math.hypot(vpos.x - pos.x, vpos.z - pos.z)
    if (d < Math.min(reach, bestDist)) {
      best = v
      bestDist = d
    }
  }
  return best
}

function toggleMount(): void {
  if (activeVehicle) {
    const exitPos = driveExitPosition(
      vehicleToState(activeVehicle),
      activeVehicle.mounts,
    )
    avatar = teleportAvatar(avatar, {
      x: exitPos.x,
      y: WALK_EYE_HEIGHT_MM / 1000,
      z: exitPos.z,
      yaw: exitPos.yaw,
    })
    avatar = setAvatarDriving(avatar, false)
    activeVehicle = null
    driveView = 'chase'
    driveLook = identityDriveLook()
    return
  }

  const nearest = findNearestVehicle()
  if (nearest) {
    activeVehicle = nearest
    avatar = setAvatarDriving(avatar, true)
    driveLook = identityDriveLook()
  }
}

function updateInput(): void {
  input.forward = keys.has('KeyW') || keys.has('ArrowUp')
  input.backward = keys.has('KeyS') || keys.has('ArrowDown')
  input.left = keys.has('KeyA') || keys.has('ArrowLeft')
  input.right = keys.has('KeyD') || keys.has('ArrowRight')
  input.jump = keys.has('Space')
  input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight')
  input.rocket = keys.has('ShiftLeft') || keys.has('ShiftRight')
  input.mount = keys.has('KeyE')
  input.lookDx = mouseDx
  input.lookDy = mouseDy
  mouseDx = 0
  mouseDy = 0
}

function getDriveInput() {
  const up = keys.has('KeyW') || keys.has('ArrowUp')
  const down = keys.has('KeyS') || keys.has('ArrowDown')
  const left = keys.has('KeyA') || keys.has('ArrowLeft')
  const right = keys.has('KeyD') || keys.has('ArrowRight')
  const handbrake = keys.has('Space')
  const recover = keys.has('KeyR')
  const throttle = (up ? 1 : 0) + (down ? -1 : 0)
  const steer = (left ? -1 : 0) + (right ? 1 : 0)
  return { throttle, steer, handbrake, recover }
}

function vehicleToState(v: Vehicle): DriveState {
  const pose = v.world.readPose()
  const snap = v.world.snapshot
  return {
    id: v.id,
    x: pose.x,
    y: pose.y,
    z: pose.z,
    yaw: pose.yaw,
    pitch: pose.pitch,
    roll: pose.roll,
    qx: pose.qx,
    qy: pose.qy,
    qz: pose.qz,
    qw: pose.qw,
    vx: snap.velocity.x,
    vz: snap.velocity.z,
    focusHeight: v.mounts.focusHeight,
    headingDeg: v.world.spec.headingDeg,
    isHull: v.isHull,
  }
}

function getCamera(): Camera {
  if (activeVehicle) {
    const state = vehicleToState(activeVehicle)
    return driveCamera(state, activeVehicle.mounts, driveView, driveLook)
  }
  return avatarCamera(avatar)
}

function buildBoxes(): BoxMesh[] {
  const boxes: BoxMesh[] = []

  for (const v of vehicles) {
    const pose = v.world.readPose()
    boxes.push({
      x: pose.x,
      y: pose.y + v.size.y / 2,
      z: pose.z,
      hx: v.size.x / 2,
      hy: v.size.y / 2,
      hz: v.size.z / 2,
      yaw: pose.yaw,
      pitch: pose.pitch,
      roll: pose.roll,
      color: v.color,
    })

    if (v.wheels && v.wheelRadius) {
      const snap = v.world.snapshot
      const rad = (pose.yaw * Math.PI) / 180
      const cos = Math.cos(rad), sin = Math.sin(rad)
      const wheelPos = v.wheels
      const wheelIds: ('FL' | 'FR' | 'RL' | 'RR')[] = ['FL', 'FR', 'RL', 'RR']
      for (let i = 0; i < 4; i++) {
        const wid = wheelIds[i]
        const wp = wheelPos[wid]
        const susp = snap.suspension[i] ?? 0
        const steerAngle = i < 2 ? snap.steerRad * 180 / Math.PI : 0
        const wx = pose.x + wp.x * cos - wp.z * sin
        const wz = pose.z + wp.x * sin + wp.z * cos
        const wy = pose.y + v.wheelRadius - susp * 0.5
        boxes.push({
          x: wx,
          y: wy,
          z: wz,
          hx: 0.12,
          hy: v.wheelRadius,
          hz: v.wheelRadius,
          yaw: pose.yaw + steerAngle,
          color: WHEEL_COLOR,
        })
      }
    }
  }

  // Only draw avatar body in chase view (3rd person) - not in first person
  if (!activeVehicle && avatar.view === 'chase') {
    const body = avatarBodyPose(avatar)
    boxes.push({
      x: body.x,
      y: body.y,
      z: body.z,
      hx: 0.3,
      hy: 0.9,
      hz: 0.2,
      yaw: body.yaw,
      color: AVATAR_COLOR,
    })
  }

  return boxes
}

function updateHud(): void {
  const cam = getCamera()
  const camInfo = `cam: (${cam.x.toFixed(1)}, ${cam.y.toFixed(1)}, ${cam.z.toFixed(1)}) yaw=${cam.ry.toFixed(0)}° pitch=${cam.rx.toFixed(0)}°`
  
  if (activeVehicle) {
    const snap = activeVehicle.world.snapshot
    const speed = Math.abs(snap.forwardSpeed * 3.6)
    hud.innerHTML = `
      <b>Driving: ${activeVehicle.id}</b><br>
      Speed: ${speed.toFixed(1)} km/h | Gear: ${snap.gear}<br>
      View: ${driveView}<br>
      <span style="font-size:11px;color:#aaa">${camInfo}</span><br>
      <span style="color:#888">E: exit | C: view | R: recover</span>
    `
  } else {
    const nearest = findNearestVehicle()
    const mode = avatar.mode === 'rocket' ? '🚀 Flying' : '🚶 Walking'
    const alt = avatar.y - WALK_EYE_HEIGHT_MM / 1000
    hud.innerHTML = `
      <b>${mode}</b> | View: ${avatar.view}<br>
      Alt: ${alt.toFixed(1)} m ${avatar.rocketBurn > 0 ? `| Burn: ${(avatar.rocketBurn / 20 * 100).toFixed(0)}%` : ''}<br>
      <span style="font-size:11px;color:#aaa">${camInfo}</span><br>
      ${nearest ? `<span style="color:#0f0">E: enter ${nearest.id}</span>` : '<span style="color:#888">Walk to a vehicle</span>'}
    `
  }
}

let lastTime = performance.now()

function loop(time: number): void {
  const dt = Math.min((time - lastTime) / 1000, 0.05)
  lastTime = time

  updateInput()

  if (activeVehicle) {
    const driveInput = getDriveInput()
    activeVehicle.world.step(driveInput, dt)

    if (input.lookDx || input.lookDy) {
      driveLook = driveLookDelta(driveLook, input.lookDx, input.lookDy, driveView)
    }
  } else {
    avatar = stepAvatar(avatar, input, dt, 0)
  }

  for (const v of vehicles) {
    if (v !== activeVehicle) {
      v.world.step({ throttle: 0, steer: 0 }, dt)
    }
  }

  const w = window.innerWidth
  const h = window.innerHeight
  if (canvas.width !== w || canvas.height !== h) {
    renderer.resize(w, h)
  }

  const cam = getCamera()
  const boxes = buildBoxes()
  renderer.render(cam, boxes)

  updateHud()

  requestAnimationFrame(loop)
}

requestAnimationFrame(loop)

console.log('Nabla Drive Playground loaded')
console.log('Controls:')
console.log('  WASD/Arrows - Walk/Drive')
console.log('  Shift - Sprint/Rocket thrust')
console.log('  Space - Jump (walk) / Handbrake (drive)')
console.log('  E - Enter/Exit vehicle')
console.log('  C - Cycle camera view')
console.log('  R - Recover vehicle')
console.log('Vehicles:', vehicles.map(v => v.id))
