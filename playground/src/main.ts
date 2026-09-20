/**
 * Nabla Drive Playground — GLB vehicles with SceneNode hierarchy.
 *
 * Demonstrates:
 * - A3 Cabrio with GLB body + wheels as child SceneNodes
 * - Ship 5×10 with GLB hull
 * - Cannon-es RaycastVehicle physics
 * - SceneNode attach/detach API
 * - Debug gizmos (RGB axes + parent-child lines)
 */
import {
  VehicleWorld,
  A3_SPEC,
  A3_MOUNTS,
  A3_ASSETS,
  a3WheelPositions,
  A3_WHEEL_RADIUS,
  SHIP_5X10_SPEC,
  SHIP_MOUNTS,
  SHIP_SIZE,
  SHIP_5X10_ASSETS,
  shipGarageBoxes,
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
  SceneNode,
  sceneDebugLines,
  parseGlb,
} from '@nabla/engine'
import { Renderer, type BoxMesh, type Camera, type GlbMesh, type DebugLine } from './renderer.js'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const hud = document.getElementById('hud') as HTMLDivElement
const renderer = new Renderer(canvas)

// Scene graph root
const sceneRoot = new SceneNode('world')

// A3 Cabrio scene nodes
const a3Root = new SceneNode('a3-root')
const a3Body = new SceneNode('a3-body')
const a3WheelFL = new SceneNode('a3-wheel-fl')
const a3WheelFR = new SceneNode('a3-wheel-fr')
const a3WheelRL = new SceneNode('a3-wheel-rl')
const a3WheelRR = new SceneNode('a3-wheel-rr')
a3Root.attach(a3Body)
a3Root.attach(a3WheelFL)
a3Root.attach(a3WheelFR)
a3Root.attach(a3WheelRL)
a3Root.attach(a3WheelRR)
sceneRoot.attach(a3Root)

// Ship scene node
const shipRoot = new SceneNode('ship-root')
const shipBody = new SceneNode('ship-body')
shipRoot.attach(shipBody)
sceneRoot.attach(shipRoot)

// Avatar scene node (for visualization only)
const avatarNode = new SceneNode('avatar')
sceneRoot.attach(avatarNode)

// Spawn positions — y = comY so vehicle rests on ground correctly
const CAR_START = { x: 5, y: A3_SPEC.comY, z: -5, yaw: 0 }
const SHIP_START = { x: -10, y: SHIP_5X10_SPEC.comY, z: -15, yaw: 0 }
const AVATAR_START = { x: 0, y: WALK_EYE_HEIGHT_MM / 1000, z: 8, yaw: 0 }

// Colors
const CAR_COLOR: [number, number, number] = [0.85, 0.1, 0.1]
const WHEEL_COLOR: [number, number, number] = [0.15, 0.15, 0.15]
const SHIP_COLOR: [number, number, number] = [0.3, 0.5, 0.7]
const AVATAR_COLOR: [number, number, number] = [0.3, 0.8, 0.4]
const RAMP_COLOR: [number, number, number] = [0.4, 0.35, 0.3]

// GLB meshes (loaded async)
let a3BodyMesh: GlbMesh | null = null
let a3WheelMesh: GlbMesh | null = null
let shipBodyMesh: GlbMesh | null = null
let glbsLoaded = false

interface Vehicle {
  id: string
  world: VehicleWorld
  mounts: CarPackMounts
  rootNode: SceneNode
  isHull: boolean
  wheelNodes?: SceneNode[]
  wheelPositions?: ReturnType<typeof a3WheelPositions>
}

// Physics worlds
const carWorld = new VehicleWorld(A3_SPEC)
carWorld.mount(CAR_START, A3_SPEC)

const shipWorld = new VehicleWorld(SHIP_5X10_SPEC)
shipWorld.mount(SHIP_START, SHIP_5X10_SPEC)

// Set initial scene node positions
a3Root.setLocal({ x: CAR_START.x, y: CAR_START.y, z: CAR_START.z, yaw: CAR_START.yaw })
shipRoot.setLocal({ x: SHIP_START.x, y: SHIP_START.y, z: SHIP_START.z, yaw: SHIP_START.yaw })

// Body GLB offset: GLB origin is at model origin, physics COM is at comY
// Body node local Y = rideY - comY to align GLB with physics
const a3BodyOffset = A3_SPEC.rideY - A3_SPEC.comY
a3Body.setLocal({ y: a3BodyOffset })

const shipBodyOffset = SHIP_5X10_SPEC.rideY - SHIP_5X10_SPEC.comY
shipBody.setLocal({ y: shipBodyOffset })

// Set wheel positions relative to root (not body)
// Wheels are at hub positions in model space, adjusted for COM offset
const wheelPos = a3WheelPositions()
const wheelYOffset = -A3_SPEC.comY  // wheels are in model space, root is at COM
a3WheelFL.setLocal({ x: wheelPos.FL.x, y: wheelPos.FL.y + wheelYOffset, z: wheelPos.FL.z })
a3WheelFR.setLocal({ x: wheelPos.FR.x, y: wheelPos.FR.y + wheelYOffset, z: wheelPos.FR.z })
a3WheelRL.setLocal({ x: wheelPos.RL.x, y: wheelPos.RL.y + wheelYOffset, z: wheelPos.RL.z })
a3WheelRR.setLocal({ x: wheelPos.RR.x, y: wheelPos.RR.y + wheelYOffset, z: wheelPos.RR.z })

const vehicles: Vehicle[] = [
  {
    id: 'a3cabrio',
    world: carWorld,
    mounts: A3_MOUNTS,
    rootNode: a3Root,
    isHull: false,
    wheelNodes: [a3WheelFL, a3WheelFR, a3WheelRL, a3WheelRR],
    wheelPositions: wheelPos,
  },
  {
    id: 'ship5x10',
    world: shipWorld,
    mounts: SHIP_MOUNTS,
    rootNode: shipRoot,
    isHull: true,
  },
]

let avatar: AvatarState = createAvatarState(AVATAR_START)
let activeVehicle: Vehicle | null = null
let driveView: DriveView = 'chase'
let driveLook: DriveLook = identityDriveLook()
let showDebug = true

const keys = new Set<string>()
const input: AvatarInput = emptyAvatarInput()
let mouseDx = 0, mouseDy = 0
let pointerLocked = false

// Load GLBs
async function loadGlbs(): Promise<void> {
  try {
    const [bodyData, wheelData, shipData] = await Promise.all([
      fetch(A3_ASSETS.body.url).then(r => r.arrayBuffer()),
      fetch(A3_ASSETS.wheel.url).then(r => r.arrayBuffer()),
      fetch(SHIP_5X10_ASSETS.body.url).then(r => r.arrayBuffer()),
    ])

    const bodyPrims = parseGlb(bodyData)
    const wheelPrims = parseGlb(wheelData)
    const shipPrims = parseGlb(shipData)

    // Merge all primitives into single meshes for simplicity
    if (bodyPrims.length > 0) {
      const merged = mergePrimitives(bodyPrims)
      a3BodyMesh = { ...merged, color: CAR_COLOR }
    }
    if (wheelPrims.length > 0) {
      const merged = mergePrimitives(wheelPrims)
      a3WheelMesh = { ...merged, color: WHEEL_COLOR }
    }
    if (shipPrims.length > 0) {
      const merged = mergePrimitives(shipPrims)
      shipBodyMesh = { ...merged, color: SHIP_COLOR }
    }

    glbsLoaded = true
    console.log('GLBs loaded:', {
      body: bodyPrims.length + ' prims',
      wheel: wheelPrims.length + ' prims',
      ship: shipPrims.length + ' prims',
    })
  } catch (e) {
    console.error('Failed to load GLBs:', e)
  }
}

function mergePrimitives(prims: { positions: Float32Array; normals: Float32Array; indices: Uint16Array }[]): {
  positions: Float32Array
  normals: Float32Array
  indices: Uint16Array
} {
  let totalVerts = 0
  let totalIndices = 0
  for (const p of prims) {
    totalVerts += p.positions.length / 3
    totalIndices += p.indices.length
  }

  const positions = new Float32Array(totalVerts * 3)
  const normals = new Float32Array(totalVerts * 3)
  const indices = new Uint16Array(totalIndices)

  let vertOffset = 0
  let indexOffset = 0
  let baseVertex = 0

  for (const p of prims) {
    positions.set(p.positions, vertOffset * 3)
    normals.set(p.normals, vertOffset * 3)
    for (let i = 0; i < p.indices.length; i++) {
      indices[indexOffset + i] = p.indices[i] + baseVertex
    }
    vertOffset += p.positions.length / 3
    indexOffset += p.indices.length
    baseVertex += p.positions.length / 3
  }

  return { positions, normals, indices }
}

loadGlbs()

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
  if (e.code === 'KeyG') {
    showDebug = !showDebug
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
  input.rocket = keys.has('KeyF')
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

function updateSceneNodes(): void {
  // Update vehicle scene nodes from physics
  for (const v of vehicles) {
    const pose = v.world.readPose()
    v.rootNode.setLocal({
      x: pose.x,
      y: pose.y,
      z: pose.z,
      yaw: pose.yaw,
      pitch: pose.pitch,
      roll: pose.roll,
    })

    // Update wheel nodes from suspension
    if (v.wheelNodes && v.wheelPositions) {
      const snap = v.world.snapshot
      const ids = ['FL', 'FR', 'RL', 'RR'] as const
      for (let i = 0; i < 4; i++) {
        const wid = ids[i]
        const wp = v.wheelPositions[wid]
        const susp = snap.suspension[i] ?? 0
        const steerAngle = i < 2 ? snap.steerRad * 180 / Math.PI : 0
        v.wheelNodes[i].setLocal({
          x: wp.x,
          y: wp.y - susp * 0.3,  // suspension compression
          z: wp.z,
          yaw: steerAngle,
        })
      }
    }
  }

  // Update avatar node
  if (!activeVehicle) {
    const body = avatarBodyPose(avatar)
    avatarNode.setLocal({ x: body.x, y: body.y, z: body.z, yaw: body.yaw })
    avatarNode.visible = avatar.view === 'chase'
  } else {
    avatarNode.visible = false
  }
}

function buildFallbackBoxes(): BoxMesh[] {
  // Fallback boxes when GLBs not loaded
  const boxes: BoxMesh[] = []

  for (const v of vehicles) {
    const pose = v.world.readPose()
    if (v.isHull) {
      boxes.push({
        x: pose.x,
        y: pose.y + SHIP_SIZE.y / 2,
        z: pose.z,
        hx: SHIP_SIZE.x / 2,
        hy: SHIP_SIZE.y / 2,
        hz: SHIP_SIZE.z / 2,
        yaw: pose.yaw,
        pitch: pose.pitch,
        roll: pose.roll,
        color: SHIP_COLOR,
      })
    } else {
      // Car body
      boxes.push({
        x: pose.x,
        y: pose.y + 0.7,
        z: pose.z,
        hx: 0.9,
        hy: 0.7,
        hz: 2.1,
        yaw: pose.yaw,
        pitch: pose.pitch,
        roll: pose.roll,
        color: CAR_COLOR,
      })
      // Wheels
      if (v.wheelNodes) {
        for (const wn of v.wheelNodes) {
          const wp = wn.worldPosition
          boxes.push({
            x: wp.x,
            y: wp.y,
            z: wp.z,
            hx: 0.12,
            hy: A3_WHEEL_RADIUS,
            hz: A3_WHEEL_RADIUS,
            yaw: wn.worldPose.yaw + pose.yaw,
            color: WHEEL_COLOR,
          })
        }
      }
    }
  }

  // Ship garage ramp/floor boxes
  const shipPose = shipWorld.readPose()
  const garageBoxes = shipGarageBoxes(shipPose)
  for (const gb of garageBoxes) {
    boxes.push({
      x: gb.x,
      y: gb.y,
      z: gb.z,
      hx: gb.hx,
      hy: gb.hy,
      hz: gb.hz,
      yaw: (gb.yaw ?? 0) * 180 / Math.PI,
      pitch: (gb.pitch ?? 0) * 180 / Math.PI,
      color: RAMP_COLOR,
    })
  }

  // Avatar body
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
      View: ${driveView} | Debug: ${showDebug ? 'ON' : 'OFF'}<br>
      <span style="font-size:11px;color:#aaa">${camInfo}</span><br>
      <span style="color:#888">E: exit | C: view | R: recover | G: debug</span>
    `
  } else {
    const nearest = findNearestVehicle()
    const mode = avatar.mode === 'rocket' ? '🚀 Flying' : '🚶 Walking'
    const alt = avatar.y - WALK_EYE_HEIGHT_MM / 1000
    hud.innerHTML = `
      <b>${mode}</b> | View: ${avatar.view} | Debug: ${showDebug ? 'ON' : 'OFF'}<br>
      Alt: ${alt.toFixed(1)} m ${avatar.rocketBurn > 0 ? `| Burn: ${(avatar.rocketBurn / 20 * 100).toFixed(0)}%` : ''}<br>
      GLBs: ${glbsLoaded ? '✓ loaded' : 'loading...'}<br>
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

  // Update scene graph from physics
  updateSceneNodes()

  const w = window.innerWidth
  const h = window.innerHeight
  if (canvas.width !== w || canvas.height !== h) {
    renderer.resize(w, h)
  }

  const cam = getCamera()

  // 1. Begin frame: clear, draw ground and origin gizmo
  renderer.beginFrame(cam)

  // 2. Render GLB meshes if loaded, otherwise fallback boxes
  if (glbsLoaded) {
    // A3 body
    if (a3BodyMesh) {
      renderer.renderGlbMesh(cam, a3BodyMesh, a3Body.worldMatrix)
    }
    // A3 wheels
    if (a3WheelMesh) {
      renderer.renderGlbMesh(cam, a3WheelMesh, a3WheelFL.worldMatrix)
      renderer.renderGlbMesh(cam, a3WheelMesh, a3WheelFR.worldMatrix)
      renderer.renderGlbMesh(cam, a3WheelMesh, a3WheelRL.worldMatrix)
      renderer.renderGlbMesh(cam, a3WheelMesh, a3WheelRR.worldMatrix)
    }
    // Ship
    if (shipBodyMesh) {
      renderer.renderGlbMesh(cam, shipBodyMesh, shipBody.worldMatrix)
    }
  } else {
    // Fallback: procedural boxes when GLBs not loaded
    const fallbackBoxes = buildFallbackBoxes()
    renderer.renderBoxes(cam, fallbackBoxes)
  }

  // 3. Always render garage ramp boxes (physics colliders)
  const shipPose = shipWorld.readPose()
  const garageBoxes = shipGarageBoxes(shipPose)
  const rampBoxes: BoxMesh[] = garageBoxes.map(gb => ({
    x: gb.x,
    y: gb.y,
    z: gb.z,
    hx: gb.hx,
    hy: gb.hy,
    hz: gb.hz,
    yaw: (gb.yaw ?? 0) * 180 / Math.PI,
    pitch: (gb.pitch ?? 0) * 180 / Math.PI,
    color: RAMP_COLOR,
  }))
  renderer.renderBoxes(cam, rampBoxes)

  // 4. Avatar body (when in chase view and not driving)
  if (!activeVehicle && avatar.view === 'chase') {
    const body = avatarBodyPose(avatar)
    renderer.renderBoxes(cam, [{
      x: body.x,
      y: body.y,
      z: body.z,
      hx: 0.3,
      hy: 0.9,
      hz: 0.2,
      yaw: body.yaw,
      color: AVATAR_COLOR,
    }])
  }

  // 5. Debug lines (scene node gizmos)
  if (showDebug) {
    const debugLines = sceneDebugLines(sceneRoot, 0.5)
    renderer.renderDebugLines(cam, debugLines as DebugLine[])
  }

  updateHud()

  requestAnimationFrame(loop)
}

requestAnimationFrame(loop)

console.log('Nabla Drive Playground loaded')
console.log('Controls:')
console.log('  WASD/Arrows - Walk/Drive')
console.log('  Shift - Sprint')
console.log('  F - Rocket/Jetpack')
console.log('  Space - Jump (walk) / Handbrake (drive)')
console.log('  E - Enter/Exit vehicle')
console.log('  C - Cycle camera view')
console.log('  G - Toggle debug gizmos')
console.log('  R - Recover vehicle')
