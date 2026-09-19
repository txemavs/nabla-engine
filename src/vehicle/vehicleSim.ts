/**
 * VehicleSim — Cannon-es RaycastVehicle simulation.
 *
 * Clean rewrite from Agency vehicleSim.ts. Owns the physics world.
 * No Vue, no GLB, no camera — pure simulation.
 *
 * ## Coordinate System
 *
 * Axes (Y-up, right-handed):
 *   +X right · +Y up · +Z forward at yaw 0
 *
 * Engine: applyEngineForce(-throttle * F) → +throttle increases +Z velocity
 * Steer:  setSteeringValue(-steer * max)  → +steer (D key) decreases yaw
 *
 * RaycastVehicle axes:
 *   indexRightAxis: 0 (X)
 *   indexUpAxis: 1 (Y)
 *   indexForwardAxis: 2 (Z)
 *
 * Wheel layout (looking down at car from above):
 *
 *        +Z (forward / nose)
 *          ↑
 *     FL [0]   FR [1]
 *          |
 *        COM ●──── +X (right)
 *          |
 *     RL [2]   RR [3]
 *
 * ## Collision Groups (bitmask)
 *
 * | Group    | Value | Description                                 |
 * |----------|-------|---------------------------------------------|
 * | GROUND   | 1     | Infinite ground plane                       |
 * | CHASSIS  | 2     | Vehicle chassis bodies (car-car collide)    |
 * | STATIC   | 4     | Static obstacles: boxes, ramps, platforms   |
 */
import {
  Body,
  Box,
  ContactMaterial,
  GSSolver,
  Material,
  Plane,
  Quaternion,
  RaycastVehicle,
  SAPBroadphase,
  Vec3,
  World,
  type WheelInfo,
} from 'cannon-es'
import {
  MAX_SUB,
  RECOVER_LIFT_M,
  REMOUNT_MAX_SPEED,
  STEP,
  chassisInertia,
  emptyDebugFrame,
  emptySnapshot,
  specToDefinition,
  specToTune,
  WHEEL_IDS,
  DRIFT_REAR_GRIP,
  type VehicleDebugFrame,
  type VehicleDefinition,
  type VehicleGear,
  type VehicleInput,
  type VehicleSnapshot,
  type VehicleTune,
} from './vehicleDef.js'
import { parseVehicleSpec, type VehicleSpec } from './vehicleSpec.js'
import { applyAntiRollBar, applyVehicleInput, RolloverWatch, isInverted } from './vehicleControl.js'
import type { StaticBox } from './obstacleKit.js'

export const COLLISION_GROUP_GROUND = 1
export const COLLISION_GROUP_CHASSIS = 2
export const COLLISION_GROUP_STATIC = 4

export const COLLISION_MASK_CHASSIS =
  COLLISION_GROUP_GROUND | COLLISION_GROUP_CHASSIS | COLLISION_GROUP_STATIC
export const COLLISION_MASK_STATIC = COLLISION_GROUP_CHASSIS
export const COLLISION_MASK_GROUND = COLLISION_GROUP_CHASSIS | COLLISION_GROUP_STATIC

function yawQuat(yawDeg: number): Quaternion {
  const q = new Quaternion()
  q.setFromAxisAngle(new Vec3(0, 1, 0), (yawDeg * Math.PI) / 180)
  return q
}

function wheelConnY(def: VehicleDefinition): number {
  return def.radius + def.restLength - def.comHeight
}

function quatToYpr(q: Quaternion): { yaw: number; pitch: number; roll: number } {
  const sinr_cosp = 2 * (q.w * q.x + q.y * q.z)
  const cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y)
  const roll = (Math.atan2(sinr_cosp, cosr_cosp) * 180) / Math.PI

  const sinp = 2 * (q.w * q.y - q.z * q.x)
  const pitch = (Math.abs(sinp) >= 1 ? Math.sign(sinp) * 90 : (Math.asin(sinp) * 180) / Math.PI)

  const siny_cosp = 2 * (q.w * q.z + q.x * q.y)
  const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z)
  const yaw = (Math.atan2(siny_cosp, cosy_cosp) * 180) / Math.PI

  return { yaw, pitch, roll }
}

function rotateByQuat(q: Quaternion, v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const vec = new Vec3(v.x, v.y, v.z)
  const result = q.vmult(vec)
  return { x: result.x, y: result.y, z: result.z }
}

export interface VehicleSimOptions {
  gravity?: number
  friction?: number
  solverIterations?: number
}

export class VehicleSim {
  def: VehicleDefinition
  tune: VehicleTune
  readonly world: World
  private readonly groundBody: Body
  private chassis: Body | null = null
  private vehicle: RaycastVehicle | null = null
  private pendingDef: VehicleDefinition | null = null
  private gear: VehicleGear = 'idle'
  private engine = 0
  private steerRad = 0
  private readonly rollover = new RolloverWatch()
  private statics: Body[] = []

  lastSnapshot: VehicleSnapshot = emptySnapshot()
  lastDebug: VehicleDebugFrame = emptyDebugFrame()

  constructor(spec?: VehicleSpec, options: VehicleSimOptions = {}) {
    const parsed = parseVehicleSpec(spec)
    this.def = specToDefinition(parsed)
    this.tune = specToTune(parsed)

    const world = new World()
    world.gravity.set(0, options.gravity ?? -9.82, 0)
    world.broadphase = new SAPBroadphase(world)
    world.defaultContactMaterial.friction = options.friction ?? 0.4
    world.defaultContactMaterial.restitution = 0

    const solver = new GSSolver()
    solver.iterations = options.solverIterations ?? 10
    world.solver = solver

    const groundMat = new Material('ground')
    const wheelMat = new Material('wheel')
    world.addContactMaterial(
      new ContactMaterial(groundMat, wheelMat, { friction: 0.8, restitution: 0 }),
    )

    const ground = new Body({
      mass: 0,
      material: groundMat,
      collisionFilterGroup: COLLISION_GROUP_GROUND,
      collisionFilterMask: COLLISION_MASK_GROUND,
    })
    ground.addShape(new Plane())
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
    world.addBody(ground)

    this.world = world
    this.groundBody = ground
  }

  get mounted(): boolean {
    return this.vehicle != null
  }

  mount(pose: { x: number; y: number; z: number; yaw: number }, spec?: VehicleSpec): void {
    if (spec) {
      const parsed = parseVehicleSpec(spec)
      this.def = specToDefinition(parsed)
      this.tune = specToTune(parsed)
    }
    this.pendingDef = null
    this.rollover.reset()

    const yaw = yawQuat(pose.yaw)
    const bodyY = pose.y + this.def.comHeight
    this.buildVehicle({
      x: pose.x,
      y: bodyY,
      z: pose.z,
      qx: yaw.x,
      qy: yaw.y,
      qz: yaw.z,
      qw: yaw.w,
    })
    this.commitSnap(0, false)
  }

  applySpec(next: VehicleSpec, opts?: { defer?: boolean }): void {
    const parsed = parseVehicleSpec(next)
    const def = specToDefinition(parsed)
    const tune = specToTune(parsed)
    this.tune = tune
    this.applyTune(tune)

    if (!this.mounted) {
      this.def = def
      return
    }
    if (!this.needsRebuild(def)) {
      this.def = def
      return
    }
    const defer = opts?.defer !== false && Math.abs(this.forwardSpeed()) > REMOUNT_MAX_SPEED
    if (defer) {
      this.pendingDef = def
      return
    }
    this.rebuild(def)
  }

  step(input: VehicleInput, dt: number): VehicleSnapshot {
    if (this.pendingDef && Math.abs(this.forwardSpeed()) <= REMOUNT_MAX_SPEED) {
      this.rebuild(this.pendingDef)
      this.pendingDef = null
    }

    const v = this.vehicle
    const chassis = this.chassis
    if (v && chassis) {
      if (input.recover) this.recover()

      const speed = this.forwardSpeed()
      const applied = applyVehicleInput(
        {
          chassis,
          setSteer: (rad) => {
            v.setSteeringValue(rad, 0)
            v.setSteeringValue(rad, 1)
          },
          setEngine: (force) => {
            v.applyEngineForce(force, 2)
            v.applyEngineForce(force, 3)
          },
          setBrake: (front, rear) => {
            v.setBrake(front, 0)
            v.setBrake(front, 1)
            v.setBrake(rear, 2)
            v.setBrake(rear, 3)
          },
        },
        input,
        this.tune,
        speed,
      )
      this.gear = applied.gear
      this.engine = applied.engine
      this.steerRad = applied.steerRad
      this.applyGrip(Boolean(input.handbrake))

      const wheels = v.wheelInfos as WheelInfo[]
      if (wheels[0] && wheels[1] && wheels[2] && wheels[3]) {
        applyAntiRollBar(chassis, [
          {
            left: { length: wheels[0].suspensionLength, world: wheels[0].chassisConnectionPointWorld },
            right: { length: wheels[1].suspensionLength, world: wheels[1].chassisConnectionPointWorld },
          },
          {
            left: { length: wheels[2].suspensionLength, world: wheels[2].chassisConnectionPointWorld },
            right: { length: wheels[3].suspensionLength, world: wheels[3].chassisConnectionPointWorld },
          },
        ])
      }
    }

    const t = Math.max(0, Math.min(0.05, dt))
    const dropped = t > STEP * MAX_SUB + 1e-6
    this.world.step(STEP, t, MAX_SUB)
    this.commitSnap(Math.min(MAX_SUB, Math.max(1, Math.ceil(t / STEP))), dropped)
    return this.lastSnapshot
  }

  recover(): void {
    const c = this.chassis
    if (!c) return
    const ypr = quatToYpr(c.quaternion)
    const q = yawQuat(ypr.yaw)
    c.quaternion.copy(q)
    c.position.y = this.def.comHeight + RECOVER_LIFT_M
    c.velocity.set(0, 0, 0)
    c.angularVelocity.set(0, 0, 0)
    this.rollover.reset()
    this.commitSnap(0, false)
  }

  setStaticBoxes(boxes: StaticBox[]): void {
    for (const body of this.statics) this.world.removeBody(body)
    this.statics = []

    const mat = this.groundBody.material
    for (const box of boxes) {
      const body = new Body({
        mass: 0,
        material: mat ?? undefined,
        collisionFilterGroup: COLLISION_GROUP_STATIC,
        collisionFilterMask: COLLISION_MASK_STATIC,
      })
      body.addShape(new Box(new Vec3(box.hx, box.hy, box.hz)))
      body.position.set(box.x, box.y, box.z)
      if (box.pitch || box.yaw) {
        body.quaternion.setFromEuler(box.pitch ?? 0, box.yaw ?? 0, 0)
      }
      this.world.addBody(body)
      this.statics.push(body)
    }
  }

  unmount(): void {
    this.disposeVehicle()
    this.pendingDef = null
    this.rollover.reset()
  }

  dispose(): void {
    this.unmount()
    this.setStaticBoxes([])
    this.world.removeBody(this.groundBody)
  }

  private needsRebuild(def: VehicleDefinition): boolean {
    const a = this.def
    return (
      a.mass !== def.mass ||
      a.size.x !== def.size.x ||
      a.size.y !== def.size.y ||
      a.size.z !== def.size.z ||
      a.wheelbase !== def.wheelbase ||
      a.radius !== def.radius ||
      a.restLength !== def.restLength ||
      a.modelFromBody.x !== def.modelFromBody.x ||
      a.modelFromBody.y !== def.modelFromBody.y ||
      a.modelFromBody.z !== def.modelFromBody.z ||
      a.comHeight !== def.comHeight
    )
  }

  private rebuild(def: VehicleDefinition): void {
    const keep = this.keepState()
    this.def = def
    this.buildVehicle(keep)
    this.commitSnap(0, false)
  }

  private keepState(): {
    x: number; y: number; z: number
    qx: number; qy: number; qz: number; qw: number
    vx?: number; vy?: number; vz?: number
    wx?: number; wy?: number; wz?: number
  } | null {
    const c = this.chassis
    if (!c) return null
    return {
      x: c.position.x,
      y: c.position.y,
      z: c.position.z,
      qx: c.quaternion.x,
      qy: c.quaternion.y,
      qz: c.quaternion.z,
      qw: c.quaternion.w,
      vx: c.velocity.x,
      vy: c.velocity.y,
      vz: c.velocity.z,
      wx: c.angularVelocity.x,
      wy: c.angularVelocity.y,
      wz: c.angularVelocity.z,
    }
  }

  private buildVehicle(
    pose: {
      x: number; y: number; z: number
      qx: number; qy: number; qz: number; qw: number
      vx?: number; vy?: number; vz?: number
      wx?: number; wy?: number; wz?: number
    } | null,
  ): void {
    this.disposeVehicle()
    const d = this.def

    const chassis = new Body({
      mass: d.mass,
      collisionFilterGroup: COLLISION_GROUP_CHASSIS,
      collisionFilterMask: COLLISION_MASK_CHASSIS,
    })
    chassis.addShape(
      new Box(new Vec3(d.colliderHalf.x, d.colliderHalf.y, d.colliderHalf.z)),
      new Vec3(d.colliderOffset.x, d.colliderOffset.y, d.colliderOffset.z),
    )

    if (pose) {
      chassis.position.set(pose.x, pose.y, pose.z)
      chassis.quaternion.set(pose.qx, pose.qy, pose.qz, pose.qw)
      chassis.velocity.set(pose.vx ?? 0, pose.vy ?? 0, pose.vz ?? 0)
      chassis.angularVelocity.set(pose.wx ?? 0, pose.wy ?? 0, pose.wz ?? 0)
    }

    chassis.angularDamping = 0.35
    chassis.linearDamping = 0.08

    const I = chassisInertia(d)
    chassis.inertia.set(I.x, I.y, I.z)
    chassis.invInertia.set(I.x ? 1 / I.x : 0, I.y ? 1 / I.y : 0, I.z ? 1 / I.z : 0)
    chassis.updateInertiaWorld(true)

    this.world.addBody(chassis)

    const vehicle = new RaycastVehicle({
      chassisBody: chassis,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    })

    const connY = wheelConnY(d)
    const halfWb = d.wheelbase / 2
    const track = d.track
    const tune = this.tune

    const corners: [number, number][] = [
      [-track, halfWb],   // FL
      [track, halfWb],    // FR
      [-track, -halfWb],  // RL
      [track, -halfWb],   // RR
    ]

    for (const [lx, lz] of corners) {
      vehicle.addWheel({
        radius: d.radius,
        directionLocal: new Vec3(0, -1, 0),
        axleLocal: new Vec3(-1, 0, 0),
        chassisConnectionPointLocal: new Vec3(lx, connY, lz),
        suspensionStiffness: tune.stiffness,
        suspensionRestLength: d.restLength,
        maxSuspensionTravel: tune.travel,
        dampingRelaxation: tune.damping,
        dampingCompression: tune.damping * 1.15,
        frictionSlip: tune.frictionSlip,
        rollInfluence: tune.rollInfluence,
        maxSuspensionForce: 100000,
        customSlidingRotationalSpeed: -30,
        useCustomSlidingRotationalSpeed: true,
      })
    }

    vehicle.addToWorld(this.world)
    this.chassis = chassis
    this.vehicle = vehicle
  }

  private applyTune(tune: VehicleTune): void {
    const v = this.vehicle
    if (!v) return
    for (const w of v.wheelInfos as WheelInfo[]) {
      w.suspensionStiffness = tune.stiffness
      w.maxSuspensionTravel = tune.travel
      w.dampingRelaxation = tune.damping
      w.dampingCompression = tune.damping * 1.15
      w.frictionSlip = tune.frictionSlip
      w.rollInfluence = tune.rollInfluence
    }
  }

  private applyGrip(handbrake: boolean): void {
    const v = this.vehicle
    if (!v) return
    const mu = this.tune.frictionSlip
    const rearMu = mu * this.tune.rearGrip
    const rear = handbrake ? mu * DRIFT_REAR_GRIP : rearMu
    const wheels = v.wheelInfos as WheelInfo[]
    if (wheels[0]) wheels[0].frictionSlip = mu
    if (wheels[1]) wheels[1].frictionSlip = mu
    if (wheels[2]) wheels[2].frictionSlip = rear
    if (wheels[3]) wheels[3].frictionSlip = rear
  }

  forwardSpeed(): number {
    const c = this.chassis
    if (!c) return 0
    const ypr = quatToYpr(c.quaternion)
    const t = (ypr.yaw * Math.PI) / 180
    return c.velocity.x * Math.sin(t) + c.velocity.z * Math.cos(t)
  }

  private commitSnap(substeps: number, dropped: boolean): void {
    this.lastSnapshot = this.readSnapshot(substeps, dropped)
    this.lastDebug = this.readDebug()
  }

  private readSnapshot(substeps: number, dropped: boolean): VehicleSnapshot {
    const c = this.chassis
    const v = this.vehicle
    if (!c) return emptySnapshot()

    const ypr = quatToYpr(c.quaternion)
    const inverted = isInverted(ypr.roll, c.quaternion)
    this.rollover.tick(inverted)

    const wheels = (v?.wheelInfos ?? []) as WheelInfo[]
    const suspension: [number, number, number, number] = [0, 0, 0, 0]
    const slip: [number, number, number, number] = [0, 0, 0, 0]
    let contacts = 0

    for (let i = 0; i < 4; i++) {
      const w = wheels[i]
      if (!w) continue
      if (w.isInContact) contacts += 1
      suspension[i] = w.suspensionLength
      slip[i] = w.sliding ? 1 : 0
    }

    return {
      body: {
        x: c.position.x,
        y: c.position.y,
        z: c.position.z,
        qx: c.quaternion.x,
        qy: c.quaternion.y,
        qz: c.quaternion.z,
        qw: c.quaternion.w,
      },
      ypr,
      velocity: { x: c.velocity.x, y: c.velocity.y, z: c.velocity.z },
      angular: { x: c.angularVelocity.x, y: c.angularVelocity.y, z: c.angularVelocity.z },
      forwardSpeed: this.forwardSpeed(),
      gear: this.gear,
      wheelsInContact: contacts,
      suspension,
      slip,
      substeps,
      dropped,
      inverted,
      engine: this.engine,
      steerRad: this.steerRad,
    }
  }

  private readDebug(): VehicleDebugFrame {
    const c = this.chassis
    const v = this.vehicle
    if (!c || !v) return emptyDebugFrame()

    const q = c.quaternion
    const axis = (local: { x: number; y: number; z: number }) => {
      const w = rotateByQuat(q, local)
      return { x: c.position.x + w.x, y: c.position.y + w.y, z: c.position.z + w.z }
    }

    const modelOff = this.def.modelFromBody
    const meshWorld = rotateByQuat(q, modelOff)

    const wheels = (v.wheelInfos ?? []) as WheelInfo[]
    const out = emptyDebugFrame()

    out.com = { x: c.position.x, y: c.position.y, z: c.position.z }
    out.mesh = { x: c.position.x + meshWorld.x, y: c.position.y + meshWorld.y, z: c.position.z + meshWorld.z }

    const cabin = rotateByQuat(q, this.def.cabinFromBody)
    out.cabin = { x: c.position.x + cabin.x, y: c.position.y + cabin.y, z: c.position.z + cabin.z }

    out.axes = {
      x: axis({ x: 1.2, y: 0, z: 0 }),
      y: axis({ x: 0, y: 1.2, z: 0 }),
      z: axis({ x: 0, y: 0, z: 1.2 }),
    }
    out.vel = {
      x: c.position.x + c.velocity.x * 0.45,
      y: c.position.y + c.velocity.y * 0.45,
      z: c.position.z + c.velocity.z * 0.45,
    }
    out.omega = {
      x: c.position.x + c.angularVelocity.x * 0.55,
      y: c.position.y + c.angularVelocity.y * 0.55,
      z: c.position.z + c.angularVelocity.z * 0.55,
    }
    out.engine = this.engine
    out.steerRad = this.steerRad
    out.gear = this.gear
    out.inertia = chassisInertia(this.def)

    for (let i = 0; i < 4; i++) {
      const w = wheels[i]
      const id = WHEEL_IDS[i] ?? 'FL'
      if (!w) continue
      const conn = w.chassisConnectionPointWorld
      const wt = w.worldTransform.position
      const hit = w.raycastResult?.hitPointWorld
      out.wheels[i] = {
        id,
        conn: { x: conn.x, y: conn.y, z: conn.z },
        center: { x: wt.x, y: wt.y, z: wt.z },
        contact: w.isInContact && hit ? { x: hit.x, y: hit.y, z: hit.z } : null,
        inContact: Boolean(w.isInContact),
        suspension: w.suspensionLength,
        slip: Boolean(w.sliding),
        steer: w.steering,
        engine: w.engineForce,
      }
    }
    return out
  }

  private disposeVehicle(): void {
    if (this.vehicle) {
      this.vehicle.removeFromWorld(this.world)
      this.vehicle = null
    }
    if (this.chassis) {
      this.world.removeBody(this.chassis)
      this.chassis = null
    }
  }
}
