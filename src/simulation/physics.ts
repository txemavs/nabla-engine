/**
 * Rapier world. WASM has to be ready first: `await initPhysics()`.
 */
import RAPIER from '@dimforge/rapier3d-compat/rapier.es.js'
import type {
  Collider,
  ImpulseJoint,
  RigidBody,
  World as RapierWorld,
} from '@dimforge/rapier3d-compat'

let ready: Promise<void> | null = null
let live = false

export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init().then(() => {
    live = true
  })
  return ready
}

function R() {
  if (!live) throw new Error('Call initPhysics() before starting the simulation')
  return RAPIER
}

export class Vec3 {
  private _x: number
  private _y: number
  private _z: number
  silent = false
  notify?: () => void
  constructor(x = 0, y = 0, z = 0) {
    this._x = x
    this._y = y
    this._z = z
  }
  private touch() {
    if (!this.silent) this.notify?.()
  }
  get x() {
    return this._x
  }
  set x(v: number) {
    this._x = v
    this.touch()
  }
  get y() {
    return this._y
  }
  set y(v: number) {
    this._y = v
    this.touch()
  }
  get z() {
    return this._z
  }
  set z(v: number) {
    this._z = v
    this.touch()
  }
  set(x: number, y: number, z: number) {
    this._x = x
    this._y = y
    this._z = z
    this.touch()
    return this
  }
  copy(v: Vec3) {
    return this.set(v._x, v._y, v._z)
  }
  clone() {
    return new Vec3(this._x, this._y, this._z)
  }
  vadd(v: Vec3, target = new Vec3()) {
    return target.set(this._x + v._x, this._y + v._y, this._z + v._z)
  }
  vsub(v: Vec3, target = new Vec3()) {
    return target.set(this._x - v._x, this._y - v._y, this._z - v._z)
  }
  scale(s: number, target = new Vec3()) {
    return target.set(this._x * s, this._y * s, this._z * s)
  }
  cross(v: Vec3, target = new Vec3()) {
    return target.set(
      this._y * v._z - this._z * v._y,
      this._z * v._x - this._x * v._z,
      this._x * v._y - this._y * v._x,
    )
  }
  dot(v: Vec3) {
    return this._x * v._x + this._y * v._y + this._z * v._z
  }
  lengthSquared() {
    return this.dot(this)
  }
  length() {
    return Math.hypot(this._x, this._y, this._z)
  }
  normalize() {
    const n = this.length()
    if (n > 0) this.set(this._x / n, this._y / n, this._z / n)
    return this
  }
  negate(target: Vec3 = this) {
    return target.set(-this._x, -this._y, -this._z)
  }
  distanceTo(v: Vec3) {
    return Math.hypot(this._x - v._x, this._y - v._y, this._z - v._z)
  }
  almostEquals(v: Vec3, p = 1e-6) {
    return (
      Math.abs(this._x - v._x) < p && Math.abs(this._y - v._y) < p && Math.abs(this._z - v._z) < p
    )
  }
  setZero() {
    return this.set(0, 0, 0)
  }
  isZero() {
    return this.lengthSquared() === 0
  }
}

export class Quaternion {
  x = 0
  y = 0
  z = 0
  w = 1
  silent = false
  notify?: () => void
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x
    this.y = y
    this.z = z
    this.w = w
  }
  private touch() {
    if (!this.silent) this.notify?.()
  }
  set(x: number, y: number, z: number, w: number) {
    this.x = x
    this.y = y
    this.z = z
    this.w = w
    this.touch()
    return this
  }
  copy(q: Quaternion) {
    return this.set(q.x, q.y, q.z, q.w)
  }
  clone() {
    return new Quaternion().set(this.x, this.y, this.z, this.w)
  }
  inverse(target = new Quaternion()) {
    return target.set(-this.x, -this.y, -this.z, this.w)
  }
  conjugate(target = new Quaternion()) {
    return this.inverse(target)
  }
  mult(q: Quaternion, target = new Quaternion()) {
    return target.set(
      this.w * q.x + this.x * q.w + this.y * q.z - this.z * q.y,
      this.w * q.y - this.x * q.z + this.y * q.w + this.z * q.x,
      this.w * q.z + this.x * q.y - this.y * q.x + this.z * q.w,
      this.w * q.w - this.x * q.x - this.y * q.y - this.z * q.z,
    )
  }
  vmult(v: Vec3, target = new Vec3()) {
    const { x, y, z, w } = this
    const vx = v.x,
      vy = v.y,
      vz = v.z
    const tx = 2 * (y * vz - z * vy)
    const ty = 2 * (z * vx - x * vz)
    const tz = 2 * (x * vy - y * vx)
    return target.set(
      vx + w * tx + (y * tz - z * ty),
      vy + w * ty + (z * tx - x * tz),
      vz + w * tz + (x * ty - y * tx),
    )
  }
  normalize() {
    const n = Math.hypot(this.x, this.y, this.z, this.w) || 1
    return this.set(this.x / n, this.y / n, this.z / n, this.w / n)
  }
  setFromAxisAngle(axis: Vec3, angle: number) {
    const s = Math.sin(angle / 2)
    return this.set(axis.x * s, axis.y * s, axis.z * s, Math.cos(angle / 2))
  }
  /** XYZ Euler. */
  setFromEuler(x: number, y: number, z: number) {
    const c1 = Math.cos(x / 2),
      c2 = Math.cos(y / 2),
      c3 = Math.cos(z / 2)
    const s1 = Math.sin(x / 2),
      s2 = Math.sin(y / 2),
      s3 = Math.sin(z / 2)
    return this.set(
      s1 * c2 * c3 + c1 * s2 * s3,
      c1 * s2 * c3 - s1 * c2 * s3,
      c1 * c2 * s3 + s1 * s2 * c3,
      c1 * c2 * c3 - s1 * s2 * s3,
    )
  }
}

export class AABB {
  lowerBound: Vec3
  upperBound: Vec3
  constructor(options?: { lowerBound: Vec3; upperBound: Vec3 }) {
    this.lowerBound = options?.lowerBound.clone() ?? new Vec3()
    this.upperBound = options?.upperBound.clone() ?? new Vec3()
  }
  overlaps(other: AABB) {
    return !(
      this.upperBound.x < other.lowerBound.x ||
      this.lowerBound.x > other.upperBound.x ||
      this.upperBound.y < other.lowerBound.y ||
      this.lowerBound.y > other.upperBound.y ||
      this.upperBound.z < other.lowerBound.z ||
      this.lowerBound.z > other.upperBound.z
    )
  }
}

export class Material {
  friction: number
  restitution: number
  constructor(options?: { friction?: number; restitution?: number }) {
    this.friction = options?.friction ?? 0.3
    this.restitution = options?.restitution ?? 0
  }
}

export class Sphere {
  radius: number
  collisionResponse = true
  boundingSphereRadius: number
  /** Overrides the body material when set. Gear uses 0 so it does not brake the wheels. */
  friction?: number
  constructor(radius: number) {
    this.radius = radius
    this.boundingSphereRadius = radius
  }
}

export class Box {
  halfExtents: Vec3
  collisionResponse = true
  boundingSphereRadius: number
  constructor(halfExtents: Vec3) {
    this.halfExtents = halfExtents.clone()
    this.boundingSphereRadius = halfExtents.length()
  }
}

export class Heightfield {
  data: number[][]
  elementSize: number
  collisionResponse = true
  boundingSphereRadius: number
  constructor(data: number[][], options?: { elementSize?: number }) {
    this.data = data
    this.elementSize = options?.elementSize ?? 1
    const columns = data.length
    const rows = data[0]?.length ?? 0
    this.boundingSphereRadius = Math.hypot(columns, rows) * this.elementSize
  }
}

/** Static triangle mesh. One collider for a whole surface, not a hull per face. */
export class Trimesh {
  vertices: Float32Array
  indices: Uint32Array
  collisionResponse = true
  boundingSphereRadius: number
  constructor(vertices: Float32Array, indices: Uint32Array) {
    this.vertices = new Float32Array(vertices)
    const forward = new Uint32Array(indices)
    const both = new Uint32Array(forward.length * 2)
    both.set(forward)
    for (let i = 0; i < forward.length; i += 3) {
      both[forward.length + i] = forward[i]
      both[forward.length + i + 1] = forward[i + 2]
      both[forward.length + i + 2] = forward[i + 1]
    }
    this.indices = both
    let radius = 0.01
    for (let i = 0; i < vertices.length; i += 3)
      radius = Math.max(radius, Math.hypot(vertices[i], vertices[i + 1], vertices[i + 2]))
    this.boundingSphereRadius = radius
  }
}

type Shape = Sphere | Box | Heightfield | Trimesh

export class RaycastResult {
  body: Body | null = null
  distance = 0
  hitPointWorld = new Vec3()
  hitNormalWorld = new Vec3()
}

let nextBodyId = 1

export class Body {
  id = nextBodyId++
  index = 0
  mass: number
  material: Material
  fixedRotation: boolean
  linearDamping: number
  angularDamping: number
  position = new Vec3()
  previousPosition = new Vec3()
  interpolatedPosition = new Vec3()
  quaternion = new Quaternion()
  previousQuaternion = new Quaternion()
  velocity = new Vec3()
  angularVelocity = new Vec3()
  torque = new Vec3()
  inertia = new Vec3(1, 1, 1)
  shapes: Shape[] = []
  shapeOffsets: Vec3[] = []
  shapeOrientations: Quaternion[] = []
  aabb = new AABB()
  aabbNeedsUpdate = true
  world: World | null = null
  raw: RigidBody | null = null
  colliders: Collider[] = []
  constructor(options?: {
    mass?: number
    material?: Material
    fixedRotation?: boolean
    linearDamping?: number
    angularDamping?: number
    position?: Vec3
    shape?: Shape
  }) {
    this.mass = options?.mass ?? 0
    this.material = options?.material ?? new Material()
    this.fixedRotation = options?.fixedRotation ?? false
    this.linearDamping = options?.linearDamping ?? 0.01
    this.angularDamping = options?.angularDamping ?? 0.01
    if (options?.position) this.position.copy(options.position)
    if (options?.shape) this.addShape(options.shape)
    const push = () => this.push()
    this.position.notify = push
    this.quaternion.notify = push
    this.velocity.notify = push
    this.angularVelocity.notify = push
  }
  get boundingRadius() {
    return Math.max(...this.shapes.map((s) => s.boundingSphereRadius), 0.5)
  }
  updateBoundingRadius() {}
  addShape(shape: Shape, offset?: Vec3, orientation?: Quaternion) {
    this.shapes.push(shape)
    this.shapeOffsets.push(offset?.clone() ?? new Vec3())
    this.shapeOrientations.push(orientation?.clone() ?? new Quaternion())
    if (this.raw && this.world) this.attach(this.shapes.length - 1)
    this.aabbNeedsUpdate = true
    return shape
  }
  removeShape(shape: Shape) {
    const i = this.shapes.indexOf(shape)
    if (i < 0) return
    const collider = this.colliders[i]
    if (collider && this.world) this.world.raw.removeCollider(collider, true)
    this.shapes.splice(i, 1)
    this.shapeOffsets.splice(i, 1)
    this.shapeOrientations.splice(i, 1)
    this.colliders.splice(i, 1)
    this.aabbNeedsUpdate = true
  }
  updateMassProperties() {
    if (this.raw && this.mass > 0) this.raw.setAdditionalMass(this.mass, true)
  }
  updateAABB() {
    const r = this.boundingRadius
    this.aabb.lowerBound.set(this.position.x - r, this.position.y - r, this.position.z - r)
    this.aabb.upperBound.set(this.position.x + r, this.position.y + r, this.position.z + r)
    this.aabbNeedsUpdate = false
  }
  wakeUp() {
    this.raw?.wakeUp()
  }
  sleep() {
    this.raw?.sleep()
  }
  applyForce(force: Vec3, relative?: Vec3) {
    if (!this.raw || !this.mass) return
    if (relative)
      this.raw.addForceAtPoint(
        force,
        {
          x: this.position.x + relative.x,
          y: this.position.y + relative.y,
          z: this.position.z + relative.z,
        },
        true,
      )
    else this.raw.addForce(force, true)
  }
  applyImpulse(impulse: Vec3, relative?: Vec3) {
    if (!this.raw || !this.mass) return
    if (relative)
      this.raw.applyImpulseAtPoint(
        impulse,
        {
          x: this.position.x + relative.x,
          y: this.position.y + relative.y,
          z: this.position.z + relative.z,
        },
        true,
      )
    else this.raw.applyImpulse(impulse, true)
  }
  pointToLocalFrame(worldPoint: Vec3, target = new Vec3()) {
    return this.quaternion.inverse().vmult(worldPoint.vsub(this.position, new Vec3()), target)
  }
  pointToWorldFrame(local: Vec3, target = new Vec3()) {
    return this.quaternion.vmult(local, target).vadd(this.position, target)
  }
  vectorToLocalFrame(v: Vec3, target = new Vec3()) {
    return this.quaternion.inverse().vmult(v, target)
  }
  vectorToWorldFrame(v: Vec3, target = new Vec3()) {
    return this.quaternion.vmult(v, target)
  }
  getVelocityAtWorldPoint(point: Vec3, target: Vec3) {
    const r = point.vsub(this.position, new Vec3())
    return target.copy(this.velocity).vadd(this.angularVelocity.cross(r), target)
  }
  push() {
    if (!this.raw || this.world?.stepping) return
    this.raw.setTranslation(this.position, true)
    this.raw.setRotation(this.quaternion, true)
    this.raw.setLinvel(this.velocity, true)
    this.raw.setAngvel(this.angularVelocity, true)
    if (this.torque.lengthSquared() > 0) {
      this.raw.addTorque(this.torque, true)
      this.torque.setZero()
    }
    this.raw.setLinearDamping(this.linearDamping)
    this.raw.setAngularDamping(this.angularDamping)
  }
  pull() {
    if (!this.raw) return
    const t = this.raw.translation()
    const q = this.raw.rotation()
    const v = this.raw.linvel()
    const w = this.raw.angvel()
    this.position.silent =
      this.quaternion.silent =
      this.velocity.silent =
      this.angularVelocity.silent =
        true
    this.position.set(t.x, t.y, t.z)
    this.quaternion.set(q.x, q.y, q.z, q.w)
    this.velocity.set(v.x, v.y, v.z)
    this.angularVelocity.set(w.x, w.y, w.z)
    const inertia = this.raw.principalInertia()
    if (inertia.x > 0) this.inertia.set(inertia.x, inertia.y, inertia.z)
    this.position.silent =
      this.quaternion.silent =
      this.velocity.silent =
      this.angularVelocity.silent =
        false
    this.mass = this.raw.isFixed() ? 0 : this.raw.mass()
    this.updateAABB()
  }
  mount(world: World) {
    const api = R()
    const desc = (this.mass > 0 ? api.RigidBodyDesc.dynamic() : api.RigidBodyDesc.fixed())
      .setTranslation(this.position.x, this.position.y, this.position.z)
      .setRotation(this.quaternion)
      .setLinvel(this.velocity.x, this.velocity.y, this.velocity.z)
      .setAngvel(this.angularVelocity)
      .setLinearDamping(this.linearDamping)
      .setAngularDamping(this.angularDamping)
      .setAdditionalMass(Math.max(this.mass, 0))
    // A trimesh has no thickness. Look ahead so a driving step cannot cross it.
    if (this.mass > 0) desc.setCcdEnabled(true).setSoftCcdPrediction(2)
    if (this.fixedRotation) desc.lockRotations()
    this.raw = world.raw.createRigidBody(desc)
    this.world = world
    this.colliders = []
    this.shapes.forEach((_, i) => this.attach(i))
    if (this.mass > 0) this.raw.setAdditionalMass(this.mass, true)
    this.applyInertia()
  }
  /**
   * Density-0 colliders contribute nothing, so mass and inertia are set explicitly.
   * Volume splits the mass, so a thin slab does not take half the chassis.
   */
  applyInertia() {
    if (!this.raw || this.mass <= 0) return
    const boxes = this.shapes.filter((shape): shape is Box => shape instanceof Box)
    const volume = (shape: Box) => {
      const { x, y, z } = shape.halfExtents
      return x * y * z
    }
    const total = boxes.reduce((sum, shape) => sum + volume(shape), 0)
    let ix = 0,
      iy = 0,
      iz = 0
    for (const shape of boxes) {
      const share = total > 0 ? (this.mass * volume(shape)) / total : this.mass
      const { x: hx, y: hy, z: hz } = shape.halfExtents
      ix += (share * (hy * hy + hz * hz)) / 3
      iy += (share * (hx * hx + hz * hz)) / 3
      iz += (share * (hx * hx + hy * hy)) / 3
    }
    if (iy === 0) iy = ix = iz = this.mass
    this.inertia.set(ix, iy, iz)
    this.raw.setAdditionalMassProperties(
      this.mass,
      { x: 0, y: 0, z: 0 },
      { x: ix, y: iy, z: iz },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    )
  }
  private attach(i: number) {
    if (!this.raw || !this.world) return
    const shape = this.shapes[i]
    const offset = this.shapeOffsets[i]
    const orientation = this.shapeOrientations[i]
    const api = R()
    let desc: ReturnType<typeof api.ColliderDesc.cuboid> | null = null
    if (shape instanceof Sphere) desc = api.ColliderDesc.ball(shape.radius)
    else if (shape instanceof Box)
      desc = api.ColliderDesc.cuboid(shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z)
    else if (shape instanceof Trimesh)
      desc = api.ColliderDesc.trimesh(shape.vertices, shape.indices)
    else if (shape instanceof Heightfield) {
      const columns = shape.data.length
      const rows = shape.data[0]?.length ?? 0
      if (columns < 2 || rows < 2) return
      const heights = new Float32Array(columns * rows)
      for (let x = 0; x < columns; x++)
        for (let z = 0; z < rows; z++) heights[x * rows + z] = shape.data[x][z]
      desc = api.ColliderDesc.heightfield(rows - 1, columns - 1, heights, {
        x: (columns - 1) * shape.elementSize,
        y: 1,
        z: (rows - 1) * shape.elementSize,
      })
    }
    if (!desc) return
    const friction =
      shape instanceof Sphere && shape.friction != null ? shape.friction : this.material.friction
    desc
      .setTranslation(
        shape instanceof Heightfield ? 0 : offset.x,
        shape instanceof Heightfield ? 0 : offset.y,
        shape instanceof Heightfield ? 0 : offset.z,
      )
      .setRotation(shape instanceof Heightfield ? { x: 0, y: 0, z: 0, w: 1 } : orientation)
      .setFriction(friction)
      .setRestitution(this.material.restitution)
      .setDensity(0)
    if (!shape.collisionResponse) desc.setSensor(true)
    this.colliders[i] = this.world.raw.createCollider(desc, this.raw)
  }
}

interface WheelState {
  connection: Vec3
  direction: Vec3
  axle: Vec3
  radius: number
  suspensionRestLength: number
  suspensionStiffness: number
  dampingRelaxation: number
  dampingCompression: number
  frictionSlip: number
  maxSuspensionTravel: number
  maxSuspensionForce: number
  steering: number
  engineForce: number
  brake: number
  isInContact: boolean
  suspensionLength: number
  worldTransform: { position: Vec3; quaternion: Quaternion }
  raycastResult: RaycastResult
}

export class RaycastVehicle {
  chassisBody: Body
  wheelInfos: WheelState[] = []
  indexRightAxis = 0
  indexUpAxis = 1
  indexForwardAxis = 2
  controller: ReturnType<RapierWorld['createVehicleController']> | null = null
  private world: World | null = null
  constructor(options: {
    chassisBody: Body
    indexRightAxis?: number
    indexUpAxis?: number
    indexForwardAxis?: number
  }) {
    this.chassisBody = options.chassisBody
    this.indexRightAxis = options.indexRightAxis ?? 0
    this.indexUpAxis = options.indexUpAxis ?? 1
    this.indexForwardAxis = options.indexForwardAxis ?? 2
  }
  addWheel(options: {
    chassisConnectionPointLocal: Vec3
    directionLocal: Vec3
    axleLocal: Vec3
    radius: number
    suspensionRestLength: number
    suspensionStiffness?: number
    dampingRelaxation?: number
    dampingCompression?: number
    frictionSlip?: number
    maxSuspensionTravel?: number
    maxSuspensionForce?: number
    rollInfluence?: number
  }) {
    this.wheelInfos.push({
      connection: options.chassisConnectionPointLocal.clone(),
      direction: options.directionLocal.clone(),
      axle: options.axleLocal.clone(),
      radius: options.radius,
      suspensionRestLength: options.suspensionRestLength,
      suspensionStiffness: options.suspensionStiffness ?? 30,
      dampingRelaxation: options.dampingRelaxation ?? 2.3,
      dampingCompression: options.dampingCompression ?? 4.4,
      frictionSlip: options.frictionSlip ?? 4,
      maxSuspensionTravel: options.maxSuspensionTravel ?? 0.3,
      maxSuspensionForce: options.maxSuspensionForce ?? 1e5,
      steering: 0,
      engineForce: 0,
      brake: 0,
      isInContact: false,
      suspensionLength: options.suspensionRestLength,
      worldTransform: { position: new Vec3(), quaternion: new Quaternion() },
      raycastResult: new RaycastResult(),
    })
  }
  addToWorld(world: World) {
    this.world = world
    if (this.chassisBody.world !== world) world.addBody(this.chassisBody)
    this.rebuild()
    world.vehicles.add(this)
  }
  removeFromWorld(world: World) {
    this.controller = null
    world.vehicles.delete(this)
    if (this.chassisBody.world === world) world.removeBody(this.chassisBody)
    this.world = null
  }
  setSteeringValue(value: number, index: number) {
    const wheel = this.wheelInfos[index]
    if (!wheel) return
    wheel.steering = value
    this.controller?.setWheelSteering(index, value)
  }
  applyEngineForce(force: number, index: number) {
    const wheel = this.wheelInfos[index]
    if (!wheel) return
    wheel.engineForce = force
    this.controller?.setWheelEngineForce(index, force)
  }
  setBrake(force: number, index: number) {
    const wheel = this.wheelInfos[index]
    if (!wheel) return
    wheel.brake = force
    this.controller?.setWheelBrake(index, force)
  }
  updateWheelTransform(index: number) {
    const wheel = this.wheelInfos[index]
    const body = this.chassisBody
    if (!wheel) return
    // Rapier's hard point is from the last vehicle update, before this step moved the chassis.
    const length = this.controller?.wheelSuspensionLength(index) ?? wheel.suspensionRestLength
    const dir = body.quaternion.vmult(wheel.direction)
    const origin = body.pointToWorldFrame(wheel.connection)
    const dropped = dir.scale(length, new Vec3())
    origin.vadd(dropped, wheel.worldTransform.position)
    const steer = new Quaternion().setFromAxisAngle(new Vec3(0, 1, 0), wheel.steering)
    const spin = new Quaternion().setFromAxisAngle(
      new Vec3(1, 0, 0),
      this.controller?.wheelRotation(index) ?? 0,
    )
    wheel.worldTransform.quaternion.copy(body.quaternion.mult(steer).mult(spin))
    wheel.suspensionLength = length
    wheel.isInContact = this.controller?.wheelIsInContact(index) ?? false
    const hit = this.controller?.wheelContactPoint(index)
    if (hit) wheel.raycastResult.hitPointWorld.set(hit.x, hit.y, hit.z)
  }
  preStep(dt: number) {
    if (!this.controller || !this.chassisBody.raw) return
    this.wheelInfos.forEach((wheel, i) => {
      this.controller!.setWheelSteering(i, wheel.steering)
      this.controller!.setWheelEngineForce(i, wheel.engineForce)
      this.controller!.setWheelBrake(i, wheel.brake)
    })
    const chassis = this.chassisBody.raw
    this.controller.updateVehicle(
      dt,
      undefined,
      undefined,
      (collider) => collider.parent() !== chassis,
    )
  }
  private rebuild() {
    const body = this.chassisBody
    if (!body.raw || !this.world) return
    this.controller = this.world.raw.createVehicleController(body.raw)
    this.controller.indexUpAxis = this.indexUpAxis
    this.controller.setIndexForwardAxis = this.indexForwardAxis
    for (const wheel of this.wheelInfos) {
      const i = this.wheelInfos.indexOf(wheel)
      this.controller.addWheel(
        wheel.connection,
        wheel.direction,
        wheel.axle,
        wheel.suspensionRestLength,
        wheel.radius,
      )
      this.controller.setWheelSuspensionStiffness(i, wheel.suspensionStiffness)
      this.controller.setWheelSuspensionRelaxation(i, wheel.dampingRelaxation)
      this.controller.setWheelSuspensionCompression(i, wheel.dampingCompression)
      this.controller.setWheelFrictionSlip(i, wheel.frictionSlip)
      this.controller.setWheelMaxSuspensionTravel(i, wheel.maxSuspensionTravel)
      this.controller.setWheelMaxSuspensionForce(i, wheel.maxSuspensionForce)
    }
  }
}

export class LockConstraint {
  bodyA: Body
  bodyB: Body
  collideConnected = false
  joint: ImpulseJoint | null = null
  constructor(bodyA: Body, bodyB: Body, _options?: { maxForce?: number }) {
    this.bodyA = bodyA
    this.bodyB = bodyB
  }
}

export class World {
  raw: RapierWorld
  bodies: Body[] = []
  contacts: { bi: Body; bj: Body; ni: Vec3 }[] = []
  vehicles = new Set<RaycastVehicle>()
  constraints = new Map<LockConstraint, ImpulseJoint>()
  gravity: Vec3
  defaultContactMaterial = { friction: 0.3, restitution: 0 }
  stepping = false
  constructor(options?: { gravity?: Vec3 }) {
    const g = options?.gravity ?? new Vec3(0, -9.81, 0)
    this.gravity = g
    this.raw = new (R().World)(g)
    this.raw.integrationParameters.numSolverIterations = 15
  }
  addBody(body: Body) {
    if (body.world === this) return
    body.mount(this)
    this.bodies.push(body)
    this.raw.updateSceneQueries()
  }
  removeBody(body: Body) {
    if (body.world !== this || !body.raw) return
    this.raw.removeRigidBody(body.raw)
    body.raw = null
    body.colliders = []
    body.world = null
    this.raw.updateSceneQueries()
    this.bodies = this.bodies.filter((b) => b !== body)
  }
  addConstraint(constraint: LockConstraint) {
    const a = constraint.bodyA.raw
    const b = constraint.bodyB.raw
    if (!a || !b) return
    const local = constraint.bodyB.pointToLocalFrame(constraint.bodyA.position)
    const frame = constraint.bodyB.quaternion.inverse().mult(constraint.bodyA.quaternion)
    const joint = this.raw.createImpulseJoint(
      R().JointData.fixed({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, local, frame),
      a,
      b,
      true,
    )
    constraint.joint = joint
    this.constraints.set(constraint, joint)
  }
  removeConstraint(constraint: LockConstraint) {
    const joint = this.constraints.get(constraint)
    if (joint) this.raw.removeImpulseJoint(joint, true)
    this.constraints.delete(constraint)
    constraint.joint = null
  }
  intersectsCuboid(center: Vec3, half: Vec3): boolean {
    let hit = false
    this.raw.intersectionsWithShape(
      center,
      { x: 0, y: 0, z: 0, w: 1 },
      new (R().Cuboid)(half.x, half.y, half.z),
      () => {
        hit = true
        return false
      },
    )
    return hit
  }
  raycastClosest(
    from: Vec3,
    to: Vec3,
    options: { skipBackfaces?: boolean },
    result: RaycastResult,
  ) {
    const closest = { hit: null as RaycastResult | null }
    this.raycastAll(from, to, options, (hit) => {
      if (!closest.hit || hit.distance < closest.hit.distance) closest.hit = hit
    })
    if (!closest.hit) return false
    result.body = closest.hit.body
    result.distance = closest.hit.distance
    result.hitPointWorld.copy(closest.hit.hitPointWorld)
    result.hitNormalWorld.copy(closest.hit.hitNormalWorld)
    return true
  }
  raycastAll(
    from: Vec3,
    to: Vec3,
    _options: { skipBackfaces?: boolean },
    callback: (hit: RaycastResult) => void,
  ) {
    const delta = to.vsub(from, new Vec3())
    const max = delta.length()
    if (max < 1e-8) return
    delta.scale(1 / max, delta)
    const ray = new (R().Ray)(from, delta)
    this.raw.intersectionsWithRay(ray, max, true, (hit) => {
      const body = this.bodies.find((b) => b.colliders.includes(hit.collider))
      if (!body) return true
      const result = new RaycastResult()
      result.body = body
      result.distance = hit.timeOfImpact
      result.hitPointWorld.set(
        from.x + delta.x * hit.timeOfImpact,
        from.y + delta.y * hit.timeOfImpact,
        from.z + delta.z * hit.timeOfImpact,
      )
      result.hitNormalWorld.set(hit.normal.x, hit.normal.y, hit.normal.z)
      callback(result)
      return true
    })
  }
  step(dt: number) {
    this.raw.gravity = this.gravity
    for (const body of this.bodies) {
      body.previousPosition.copy(body.position)
      body.previousQuaternion.copy(body.quaternion)
      body.interpolatedPosition.copy(body.position)
      body.push()
    }
    for (const vehicle of this.vehicles) vehicle.preStep(dt)
    this.stepping = true
    this.raw.timestep = dt
    this.raw.step()
    this.stepping = false
    for (const body of this.bodies) {
      body.raw?.resetForces(false)
      body.raw?.resetTorques(false)
    }
    for (const body of this.bodies) body.pull()
    this.contacts = []
    const seen = new Set<string>()
    for (const body of this.bodies) {
      for (const collider of body.colliders) {
        this.raw.contactPairsWith(collider, (other) => {
          const otherBody = this.bodies.find((b) => b.colliders.includes(other))
          if (!otherBody || otherBody === body) return
          const key =
            body.id < otherBody.id ? `${body.id}:${otherBody.id}` : `${otherBody.id}:${body.id}`
          if (seen.has(key)) return
          seen.add(key)
          this.raw.contactPair(collider, other, (manifold, flipped) => {
            if (!manifold.numContacts()) return
            const n = manifold.normal()
            const ni = new Vec3(flipped ? -n.x : n.x, flipped ? -n.y : n.y, flipped ? -n.z : n.z)
            this.contacts.push({
              bi: flipped ? otherBody : body,
              bj: flipped ? body : otherBody,
              ni,
            })
          })
        })
      }
    }
  }
}
