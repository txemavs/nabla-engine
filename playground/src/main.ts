/**
 * Nabla Drive Playground — boxcar + ship5x10 demo.
 *
 * Demonstrates:
 * - Cannon-es RaycastVehicle physics (correct Y-up, +Z forward axes)
 * - Two Nabla packs: boxcar (procedural car) and ship5x10 (hovercraft)
 * - Enter/exit between vehicles (E/F key)
 * - WASD/arrows drive, Space handbrake, R recover
 * - Chase/pilot/far/top cameras (C key)
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
  nextDriveView,
  identityDriveLook,
  type DriveLook,
  type DriveState,
  type CarPackMounts,
} from '@nabla/engine'
import { Renderer, type BoxMesh, type Camera } from './renderer.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const hud = document.getElementById('hud') as HTMLDivElement
const renderer = new Renderer(canvas)

const CAR_START = { x: 0, y: 0, z: 0, yaw: 0 }
const SHIP_START = { x: 15, y: 0, z: 10, yaw: -45 }

const CAR_COLOR: [number, number, number] = [0.9, 0.3, 0.2]
const WHEEL_COLOR: [number, number, number] = [0.15, 0.15, 0.15]
const SHIP_COLOR: [number, number, number] = [0.2, 0.5, 0.8]

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

let activeVehicle: Vehicle | null = vehicles[0]!
let view: DriveView = 'chase'
let look: DriveLook = identityDriveLook()

const keys = new Set<string>()
window.addEventListener('keydown', (e) => {
  keys.add(e.code)
  if (e.code === 'KeyC') {
    view = nextDriveView(view)
    look = identityDriveLook()
  }
  if (e.code === 'KeyE' || e.code === 'KeyF') {
    toggleVehicle()
  }
})
window.addEventListener('keyup', (e) => keys.delete(e.code))

function toggleVehicle(): void {
  if (!activeVehicle) {
    const nearest = findNearestVehicle()
    if (nearest) {
      activeVehicle = nearest
      look = identityDriveLook()
    }
    return
  }
  const others = vehicles.filter(v => v !== activeVehicle)
  const currentPose = activeVehicle.world.readPose()
  let best: Vehicle | null = null
  let bestDist = 15
  for (const v of others) {
    const pose = v.world.readPose()
    const d = Math.hypot(pose.x - currentPose.x, pose.z - currentPose.z)
    if (d < bestDist) {
      best = v
      bestDist = d
    }
  }
  if (best) {
    activeVehicle = best
    look = identityDriveLook()
  }
}

function findNearestVehicle(): Vehicle | null {
  return vehicles[0] ?? null
}

function getInput() {
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
  if (!activeVehicle) {
    return { x: 0, y: 10, z: 20, rx: -20, ry: 0 }
  }
  const state = vehicleToState(activeVehicle)
  const cam = driveCamera(state, activeVehicle.mounts, view, look)
  return cam
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
  return boxes
}

let lastTime = performance.now()

function loop(time: number): void {
  const dt = Math.min((time - lastTime) / 1000, 0.05)
  lastTime = time

  const input = getInput()
  if (activeVehicle) {
    activeVehicle.world.step(input, dt)
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

  if (activeVehicle) {
    const snap = activeVehicle.world.snapshot
    const speed = Math.abs(snap.forwardSpeed * 3.6)
    hud.innerHTML = `
      <b>${activeVehicle.id}</b><br>
      Speed: ${speed.toFixed(1)} km/h<br>
      Gear: ${snap.gear}<br>
      View: ${view}<br>
      <span style="color:#888">E/F: switch vehicle</span>
    `
  } else {
    hud.innerHTML = `<span style="color:#888">Press E/F to enter a vehicle</span>`
  }

  requestAnimationFrame(loop)
}

requestAnimationFrame(loop)

console.log('Nabla Drive Playground loaded')
console.log('Vehicles:', vehicles.map(v => v.id))
