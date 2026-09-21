import { portalColliders, portalCrossing, portalLocal, portalMapping } from './portal.js'
import { EARTH_RADIUS, localFrame, localToGeo } from './geography.js'
import { OBB } from 'three/addons/math/OBB.js'
import { Matrix3, Matrix4, Quaternion as RenderQuaternion, Vector3 } from 'three'
import { vehicleDefinition } from './vehicle.js'
import {
  AABB,
  Body,
  Box,
  GSSolver,
  Material,
  LockConstraint,
  Quaternion,
  RaycastVehicle,
  SAPBroadphase,
  Sphere,
  Vec3,
  World,
} from 'cannon-es'
import {
  parseScene,
  SceneGraph,
  type Entity,
  type SceneDocument,
  type Transform,
  type Vec3Tuple,
  type VehicleDefinition,
} from './scene.js'

export const FIXED_STEP = 1 / 60
const PLAYER_HALF_HEIGHT = 0.9
const PLAYER_RADIUS = 0.32
export interface PlayerInput {
  forward: number
  right: number
  yaw: number // radians; yaw=0 faces -Z, positive turns left
  sprint: boolean
  jump: boolean // request; consumed once on the next simulation tick
  brake: boolean
  lift?: number // -1 descend, +1 ascend; neutral holds altitude
  turn?: number // -1 left, +1 right; independent of camera yaw
}
export const idleInput = (): PlayerInput => ({
  forward: 0,
  right: 0,
  yaw: 0,
  sprint: false,
  jump: false,
  brake: false,
})
export interface PlayerSnapshot {
  position: Vec3Tuple // body centre, metres
  yaw: number
  grounded: boolean
  vehicleId: string | null
  speed: number // metres per second
}
interface Vehicle {
  body: Body
  raycast: RaycastVehicle
  entity: Entity
  steer: number
  definition: VehicleDefinition
  flight: { altitude: number; yaw: number } | null
  rampClosed: boolean
}
const vec = (v: Vec3): Vec3Tuple => [v.x, v.y, v.z]
const pose = (b: Body): Transform => ({
  position: vec(b.position),
  rotation: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w],
})
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

/** Owns exactly one physics world. Scene data is copied and never mutated.
 * The host supplies elapsed seconds and input, and reads snapshots after step(). */
export class Simulation {
  private readonly document: SceneDocument
  private readonly graph: SceneGraph
  private readonly portalEntities: Entity[]
  private readonly world = new World({ gravity: new Vec3(0, -9.81, 0) })
  private readonly solidMaterial = new Material({ friction: 0.55, restitution: 0 })
  private readonly characterMaterial = new Material({ friction: 0, restitution: 0 })
  private readonly bodies = new Map<string, Body>()
  private readonly vehicles = new Map<string, Vehicle>()
  private readonly playerBody: Body
  private input = idleInput()
  private jumpPending = false
  private accumulator = 0
  private readonly previousWheels = new Map<string, Transform[]>()
  private vehicleId: string | null = null
  private disposed = false
  private grounded = false
  private support: Body | null = null
  private readonly docks = new Map<string, { carrierId: string; constraint: LockConstraint }>()
  private ticks = 0
  private lostTime = 0
  private portalSequence = 0
  private lastPortalEvent: {
    sequence: number
    actorId: string
    sourceId: string
    destinationId: string
    yawDelta: number
    blocked: boolean
  } | null = null
  private readonly portalLocks = new Map<number, string>()
  get portalEvent() {
    return this.lastPortalEvent ? { ...this.lastPortalEvent } : null
  }

  constructor(raw: SceneDocument) {
    this.document = parseScene(raw)
    this.graph = new SceneGraph(this.document)
    this.portalEntities = this.document.entities.filter((e) => e.portal?.mode === 'open')
    this.world.broadphase = new SAPBroadphase(this.world)
    ;(this.world.solver as GSSolver).iterations = 15
    this.world.defaultContactMaterial.friction = 0.55
    this.world.defaultContactMaterial.restitution = 0
    for (const e of this.document.entities) {
      if (e.motion === 'none' && !e.portal) continue
      const transform = this.graph.worldTransform(e.id)
      const body = new Body({
        mass: e.motion === 'dynamic' ? e.mass : 0,
        material: this.solidMaterial,
      })
      const colliders = e.portal
        ? portalColliders(e)
        : e.kind === 'vehicle'
          ? vehicleDefinition(e).colliders
          : [
              {
                size: e.size,
                transform: {
                  position: [0, 0, 0] as Vec3Tuple,
                  rotation: [0, 0, 0, 1] as [number, number, number, number],
                },
              },
            ]
      for (const collider of colliders)
        body.addShape(
          new Box(new Vec3(...(collider.size.map((n) => n / 2) as Vec3Tuple))),
          new Vec3(...collider.transform.position),
          new Quaternion(...collider.transform.rotation),
        )
      body.position.set(...transform.position)
      body.quaternion.set(...transform.rotation)
      body.previousPosition.copy(body.position)
      body.previousQuaternion.copy(body.quaternion)
      body.linearDamping = 0.05
      body.angularDamping = 0.35
      this.bodies.set(e.id, body)
      if (e.kind === 'vehicle') this.createVehicle(e, body)
      else this.world.addBody(body)
    }
    if (this.document.geography) {
      const terrain = new Body({ mass: 0, material: this.solidMaterial })
      const radius = EARTH_RADIUS + this.document.geography.altitude
      terrain.addShape(new Sphere(radius))
      terrain.position.set(0, -radius, 0)
      this.world.addBody(terrain)
    }
    const spawn = this.document.entities.find((e) => e.kind === 'spawn')!
    this.playerBody = new Body({
      mass: 80,
      material: this.characterMaterial,
      fixedRotation: true,
      linearDamping: 0,
      angularDamping: 1,
    })
    this.playerBody.addShape(new Box(new Vec3(PLAYER_RADIUS, PLAYER_HALF_HEIGHT, PLAYER_RADIUS)))
    this.playerBody.updateMassProperties()
    this.playerBody.position.set(...spawn.transform.position)
    this.playerBody.position.y += PLAYER_HALF_HEIGHT
    this.playerBody.previousPosition.copy(this.playerBody.position)
    this.world.addBody(this.playerBody)
  }

  private createVehicle(entity: Entity, body: Body): void {
    const car = new RaycastVehicle({
      chassisBody: body,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    })
    const definition = vehicleDefinition(entity)
    // Front is -Z; all hubs and suspension dimensions are body-local metres.
    for (const [x, y, z] of definition.hubs) {
      car.addWheel({
        chassisConnectionPointLocal: new Vec3(x, y + definition.suspensionRest, z),
        directionLocal: new Vec3(0, -1, 0),
        axleLocal: new Vec3(-1, 0, 0),
        radius: definition.wheelRadius,
        suspensionRestLength: definition.suspensionRest,
        suspensionStiffness: definition.stiffness,
        dampingRelaxation: 2.3,
        dampingCompression: 4.4,
        frictionSlip: 4.5,
        rollInfluence: 0.04,
        maxSuspensionForce: 100000,
        maxSuspensionTravel: 0.3,
      })
    }
    car.addToWorld(this.world)
    this.vehicles.set(entity.id, {
      body,
      raycast: car,
      entity,
      steer: 0,
      definition,
      flight: null,
      rampClosed: false,
    })
  }
  get player(): PlayerSnapshot {
    const vehicle = this.vehicleId ? this.vehicles.get(this.vehicleId) : undefined
    return {
      position: vec((vehicle?.body ?? this.playerBody).position),
      yaw: this.input.yaw,
      grounded: this.grounded,
      vehicleId: this.vehicleId,
      speed: (vehicle?.body ?? this.playerBody).velocity.length(),
    }
  }
  get stats(): { ticks: number; droppedSeconds: number; bodies: number } {
    return { ticks: this.ticks, droppedSeconds: this.lostTime, bodies: this.world.bodies.length }
  }
  setInput(input: PlayerInput): void {
    if (
      ![input.forward, input.right, input.yaw, input.lift ?? 0, input.turn ?? 0].every(
        Number.isFinite,
      )
    )
      throw new Error('Input must be finite')
    this.input = {
      ...input,
      forward: clamp(input.forward, -1, 1),
      right: clamp(input.right, -1, 1),
      lift: clamp(input.lift ?? 0, -1, 1),
      turn: clamp(input.turn ?? 0, -1, 1),
    }
    this.jumpPending ||= input.jump
  }
  private displayedPose(body: Body): Transform {
    if (!body.mass) return pose(body)
    const alpha = clamp(this.accumulator / FIXED_STEP, 0, 1)
    return {
      position: new Vector3(...vec(body.previousPosition))
        .lerp(new Vector3(...vec(body.position)), alpha)
        .toArray(),
      rotation: new RenderQuaternion(
        body.previousQuaternion.x,
        body.previousQuaternion.y,
        body.previousQuaternion.z,
        body.previousQuaternion.w,
      )
        .slerp(
          new RenderQuaternion(
            body.quaternion.x,
            body.quaternion.y,
            body.quaternion.z,
            body.quaternion.w,
          ),
          alpha,
        )
        .toArray(),
    }
  }
  get renderPlayerPosition(): Vec3Tuple {
    return this.displayedPose(
      this.vehicleId ? this.vehicles.get(this.vehicleId)!.body : this.playerBody,
    ).position
  }
  entityTransform(id: string, interpolated = false): Transform {
    const body = this.bodies.get(id)
    if (body) return interpolated ? this.displayedPose(body) : pose(body)
    // Visual descendants follow their physical root using the authored local transform chain.
    const entity = this.document.entities.find((e) => e.id === id)
    if (!entity) throw new Error('Unknown entity: ' + id)
    if (!entity.parentId) return this.graph.worldTransform(id)
    const parent = this.entityTransform(entity.parentId, interpolated)
    const p = new Vec3(...entity.transform.position)
    const q = new Quaternion(...parent.rotation)
    const worldP = q.vmult(p).vadd(new Vec3(...parent.position))
    const localQ = q.clone()
    localQ.set(...entity.transform.rotation)
    const worldQ = q.mult(localQ)
    return { position: vec(worldP), rotation: [worldQ.x, worldQ.y, worldQ.z, worldQ.w] }
  }
  wheelTransforms(id: string, interpolated = false): Transform[] {
    const v = this.vehicles.get(id)
    if (!v) return []
    const current: Transform[] = v.raycast.wheelInfos.map((_, i) => {
      const inContact = v.raycast.wheelInfos[i].isInContact
      v.raycast.updateWheelTransform(i)
      // Cannon updates render transforms by clearing this physics flag; a read must preserve it.
      v.raycast.wheelInfos[i].isInContact = inContact
      const t = v.raycast.wheelInfos[i].worldTransform
      return {
        position: vec(t.position),
        rotation: [t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w],
      }
    })
    const previous = this.previousWheels.get(id)
    if (!interpolated || !previous) return current
    const alpha = clamp(this.accumulator / FIXED_STEP, 0, 1)
    return current.map((p, i) => ({
      position: new Vector3(...previous[i].position)
        .lerp(new Vector3(...p.position), alpha)
        .toArray(),
      rotation: new RenderQuaternion(...previous[i].rotation)
        .slerp(new RenderQuaternion(...p.rotation), alpha)
        .toArray(),
    }))
  }

  step(elapsed: number): void {
    if (this.disposed) throw new Error('Simulation is disposed')
    if (!Number.isFinite(elapsed) || elapsed < 0)
      throw new Error('Elapsed seconds must be finite and nonnegative')
    const accepted = Math.min(elapsed, 0.25)
    this.lostTime += elapsed - accepted
    this.accumulator += accepted
    while (this.accumulator + 1e-10 >= FIXED_STEP) {
      const before = this.portalEntities.length
        ? this.world.bodies
            .filter((b) => b.mass > 0)
            .map((body) => ({ body, position: vec(body.position) }))
        : []
      for (const id of this.vehicles.keys()) this.previousWheels.set(id, this.wheelTransforms(id))
      this.beforeTick()
      this.world.step(FIXED_STEP)
      this.crossPortals(before)
      this.updateGrounded()
      this.accumulator -= FIXED_STEP
      this.ticks++
    }
  }
  private crossPortals(previous: { body: Body; position: Vec3Tuple }[]): void {
    const mouths = this.portalEntities
    if (!mouths.length) return
    for (const { body, position } of previous) {
      const actor = [...this.bodies].find(([, b]) => b === body)?.[0] ?? 'player'
      const vehicle = this.vehicles.get(actor)
      const corners = this.portalEnvelope(body, vehicle)
      const lock = this.portalLocks.get(body.id)
      if (lock) {
        const mouth = mouths.find((e) => e.id === lock)
        if (mouth && corners.some((c) => Math.abs(portalLocal(c, mouth.transform).z) < 0.25))
          continue
        // Keep the lock until the entire body has cleared the exit plane.
        if (mouth) {
          const zs = corners.map((c) => portalLocal(c, mouth.transform).z)
          if (Math.min(...zs) <= 0.15 && Math.max(...zs) >= -0.15) continue
        }
        this.portalLocks.delete(body.id)
      }
      for (const source of mouths) {
        if (source.id === lock) continue
        const a = portalLocal(position, source.transform),
          b = portalLocal(vec(body.position), source.transform)
        const crossing = portalCrossing(position, vec(body.position), source.transform)
        const backwards = a.z < 0 && b.z >= 0
        if (crossing === null && !backwards) continue
        const fraction = crossing ?? -a.z / (b.z - a.z)
        const centre = new Vector3(...position).lerp(new Vector3(...vec(body.position)), fraction)
        const local = portalLocal(centre.toArray(), source.transform)
        if (
          Math.abs(local.x) > source.size[0] / 2 + 5 ||
          Math.abs(local.y) > source.size[1] / 2 + 5
        )
          continue
        const shift = centre.sub(new Vector3(...vec(body.position)))
        const fits = corners.every((c) => {
          const p = portalLocal(new Vector3(...c).add(shift).toArray(), source.transform)
          return (
            Math.abs(p.x) < source.size[0] / 2 - 0.025 && Math.abs(p.y) < source.size[1] / 2 + 0.025
          )
        })
        // A near miss outside the frame must remain ordinary movement.
        const projected = corners.map((c) =>
          portalLocal(new Vector3(...c).add(shift).toArray(), source.transform),
        )
        if (
          Math.min(...projected.map((p) => p.x)) > source.size[0] / 2 ||
          Math.max(...projected.map((p) => p.x)) < -source.size[0] / 2 ||
          Math.min(...projected.map((p) => p.y)) > source.size[1] / 2 ||
          Math.max(...projected.map((p) => p.y)) < -source.size[1] / 2
        )
          continue
        const destination = mouths.find((e) => e.id === source.portal!.pairId)!
        const mapping = portalMapping(source.transform, destination.transform)
        const rotation = new RenderQuaternion().setFromRotationMatrix(mapping)
        const mappedPosition = new Vector3(...vec(body.position)).applyMatrix4(mapping)
        const mappedRotation = rotation
          .clone()
          .multiply(
            new RenderQuaternion(
              body.quaternion.x,
              body.quaternion.y,
              body.quaternion.z,
              body.quaternion.w,
            ),
          )
        const constrained =
          this.docks.has(actor) || [...this.docks.values()].some((d) => d.carrierId === actor)
        const blocked =
          backwards ||
          !fits ||
          constrained ||
          this.portalExitBlocked(body, mappedPosition, mappedRotation, destination)
        if (blocked) {
          body.position.set(...position)
          body.velocity.setZero()
          body.angularVelocity.setZero()
        } else {
          body.position.set(...mappedPosition.toArray())
          body.quaternion.set(...mappedRotation.toArray())
          body.velocity.set(
            ...new Vector3(...vec(body.velocity)).applyQuaternion(rotation).toArray(),
          )
          body.angularVelocity.set(
            ...new Vector3(...vec(body.angularVelocity)).applyQuaternion(rotation).toArray(),
          )
          this.portalLocks.set(body.id, destination.id)
          // A solved contact belongs to the old location; do not expose it at the exit.
          this.world.contacts = this.world.contacts.filter((c) => c.bi !== body && c.bj !== body)
          this.world.frictionEquations = this.world.frictionEquations.filter(
            (c) => c.bi !== body && c.bj !== body,
          )
          if (vehicle) {
            this.previousWheels.delete(actor)
            vehicle.raycast.wheelInfos.forEach((w) => {
              w.isInContact = false
              w.raycastResult.reset()
            })
            if (vehicle.flight) vehicle.flight = null
          }
        }
        body.previousPosition.copy(body.position)
        body.interpolatedPosition.copy(body.position)
        body.previousQuaternion.copy(body.quaternion)
        body.interpolatedQuaternion.copy(body.quaternion)
        body.aabbNeedsUpdate = true
        body.wakeUp()
        this.world.broadphase.dirty = true
        const forward = new Vector3(0, 0, -1).applyQuaternion(rotation)
        const yawDelta = blocked ? 0 : Math.atan2(-forward.x, -forward.z)
        if (actor === this.vehicleId || body === this.playerBody) this.input.yaw += yawDelta
        this.lastPortalEvent = {
          sequence: ++this.portalSequence,
          actorId: actor,
          sourceId: source.id,
          destinationId: destination.id,
          yawDelta,
          blocked,
        }
        break
      }
    }
  }
  private portalEnvelope(body: Body, vehicle?: Vehicle): Vec3Tuple[] {
    const points: Vec3Tuple[] = []
    const addBox = (half: Vec3, offset: Vec3, q: Quaternion) => {
      for (const x of [-1, 1])
        for (const y of [-1, 1])
          for (const z of [-1, 1]) {
            const point = q.vmult(new Vec3(x * half.x, y * half.y, z * half.z)).vadd(offset)
            points.push(vec(body.pointToWorldFrame(point)))
          }
    }
    body.shapes.forEach((shape, i) => {
      if (shape instanceof Box)
        addBox(shape.halfExtents, body.shapeOffsets[i], body.shapeOrientations[i])
    })
    if (vehicle) {
      const [w, h, l] = vehicle.entity.size
      // Include bodywork and the full suspension/wheel envelope, not just the chassis collider.
      const floor = Math.min(
        ...vehicle.definition.hubs.map(
          (hub, i) =>
            hub[1] +
            vehicle.definition.suspensionRest -
            vehicle.definition.wheelRadius -
            vehicle.raycast.wheelInfos[i].suspensionLength,
        ),
      )
      addBox(new Vec3(w / 2, h / 2, l / 2), new Vec3(0, floor + h / 2, 0), new Quaternion())
    }
    return points
  }
  private portalExitBlocked(
    body: Body,
    position: Vector3,
    quaternion: RenderQuaternion,
    destination: Entity,
  ): boolean {
    const normal = new Vector3(0, 0, 1).applyQuaternion(
      new RenderQuaternion(...destination.transform.rotation),
    )
    const shapeBoxes = (other: Body): OBB[] =>
      other.shapes.flatMap((shape, i) => {
        if (!(shape instanceof Box)) return []
        const p = other.pointToWorldFrame(other.shapeOffsets[i]),
          q = other.quaternion.mult(other.shapeOrientations[i])
        return [
          new OBB(
            new Vector3(...vec(p)),
            new Vector3(...vec(shape.halfExtents)).multiplyScalar(0.995),
            new Matrix3().setFromMatrix4(
              new Matrix4().makeRotationFromQuaternion(new RenderQuaternion(q.x, q.y, q.z, q.w)),
            ),
          ),
        ]
      })
    const obstacles = this.world.bodies.filter((b) => b !== body).flatMap(shapeBoxes)
    // Check a clear exit corridor at transfer time; cross-seam contacts are not simulated.
    const length = Math.max(...body.shapes.map((s) => s.boundingSphereRadius), 1) + 0.25
    for (let distance = 0; distance <= length; distance += 0.25) {
      for (let i = 0; i < body.shapes.length; i++) {
        const shape = body.shapes[i]
        if (!(shape instanceof Box)) continue
        const centre = new Vector3(...vec(body.shapeOffsets[i]))
          .applyQuaternion(quaternion)
          .add(position)
          .addScaledVector(normal, distance)
        const q = quaternion
          .clone()
          .multiply(
            new RenderQuaternion(
              ...([
                body.shapeOrientations[i].x,
                body.shapeOrientations[i].y,
                body.shapeOrientations[i].z,
                body.shapeOrientations[i].w,
              ] as [number, number, number, number]),
            ),
          )
        const bounds = new OBB(
          centre,
          new Vector3(...vec(shape.halfExtents)).multiplyScalar(0.98),
          new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromQuaternion(q)),
        )
        if (obstacles.some((obstacle) => bounds.intersectsOBB(obstacle))) return true
      }
    }
    return false
  }
  private updateGrounded(): void {
    const contact =
      !this.vehicleId &&
      this.world.contacts.find(
        (c) =>
          (c.bi === this.playerBody && c.ni.y < -0.55) ||
          (c.bj === this.playerBody && c.ni.y > 0.55),
      )
    this.grounded = Boolean(contact)
    this.support = contact ? (contact.bi === this.playerBody ? contact.bj : contact.bi) : null
  }
  private beforeTick(): void {
    if (this.document.geography)
      for (const body of this.world.bodies) {
        if (!body.mass) continue
        const radial = this.radialUp(body)
        body.applyForce(
          new Vec3(
            -radial.x * 9.81 * body.mass,
            (1 - radial.y) * 9.81 * body.mass,
            -radial.z * 9.81 * body.mass,
          ),
        )
      }
    for (const [id, v] of this.vehicles) {
      if (this.docks.has(id)) continue
      const active = id === this.vehicleId
      if (v.flight) {
        this.fly(v, active)
        continue
      }
      const target = active
        ? (-this.input.right * 0.45) / (1 + v.body.velocity.length() * 0.035)
        : 0
      v.steer += clamp(target - v.steer, -FIXED_STEP * 1.8, FIXED_STEP * 1.8)
      const forward = v.body.quaternion.vmult(new Vec3(0, 0, -1))
      const speed = v.body.velocity.dot(forward)
      const opposing = active && this.input.forward * speed < -0.8
      for (let i = 0; i < 4; i++) {
        v.raycast.setSteeringValue(i < 2 ? v.steer : 0, i)
        v.raycast.applyEngineForce(
          active && i >= 2 && !opposing ? this.input.forward * v.definition.engineForce : 0,
          i,
        )
        const brake = !active
          ? v.definition.brakeForce * 0.4
          : this.input.brake
            ? v.definition.brakeForce * (i >= 2 ? 1.5 : 0.4)
            : opposing
              ? v.definition.brakeForce
              : 0
        v.raycast.setBrake(brake, i)
      }
    }
    if (!this.vehicleId) {
      let x = this.input.right,
        z = this.input.forward
      const len = Math.hypot(x, z)
      if (len > 1) {
        x /= len
        z /= len
      }
      const speed = this.input.sprint ? 7 : 4.2
      const c = Math.cos(this.input.yaw),
        s = Math.sin(this.input.yaw)
      const platformVelocity = new Vec3()
      this.support?.getVelocityAtWorldPoint(this.playerBody.position, platformVelocity)
      const targetX = (x * c - z * s) * speed + platformVelocity.x,
        targetZ = (-x * s - z * c) * speed + platformVelocity.z
      const accel = (this.grounded ? 35 : 9) * FIXED_STEP
      this.playerBody.velocity.x += clamp(targetX - this.playerBody.velocity.x, -accel, accel)
      this.playerBody.velocity.z += clamp(targetZ - this.playerBody.velocity.z, -accel, accel)
      if (this.jumpPending && this.grounded) this.playerBody.velocity.y = 5.5
      this.playerBody.wakeUp()
    }
    this.jumpPending = false
  }

  private radialUp(body: Body): Vec3 {
    if (!this.document.geography) return new Vec3(0, 1, 0)
    const p = body.position.vadd(new Vec3(0, EARTH_RADIUS + this.document.geography.altitude, 0))
    p.normalize()
    return p
  }
  private height(body: Body): number {
    const geo = this.document.geography
    return geo
      ? body.position.vadd(new Vec3(0, EARTH_RADIUS + geo.altitude, 0)).length() -
          EARTH_RADIUS -
          geo.altitude
      : body.position.y
  }
  /** Flight keeps the same collision body and cargo constraints; only wheel forces are disabled. */
  toggleFlight(): string {
    const v = this.vehicleId ? this.vehicles.get(this.vehicleId) : undefined
    if (!v?.definition.flight) return 'Ponte al mando de la nave para cambiar de modo'
    if (v.flight) {
      let supported = false
      this.world.raycastAll(
        v.body.position,
        v.body.position.vadd(this.radialUp(v.body).scale(-1.65)),
        { skipBackfaces: true },
        (hit) => {
          if (
            hit.body !== v.body &&
            hit.body?.mass === 0 &&
            hit.hitNormalWorld.dot(this.radialUp(v.body)) > 0.8
          )
            supported = true
        },
      )
      const up = v.body.quaternion.vmult(new Vec3(0, 1, 0))
      if (!supported || v.body.velocity.length() > 1.5 || up.dot(this.radialUp(v.body)) < 0.96)
        return 'Desciende hasta el suelo y estabiliza la nave antes de activar tierra'
      v.flight = null
      this.world.removeBody(v.body)
      v.raycast.addToWorld(this.world)
      this.setRamp(
        v,
        [...this.docks.values()].some((d) => d.carrierId === v.entity.id),
      )
      return 'Modo tierra'
    }
    const forward = v.body.quaternion.vmult(new Vec3(0, 0, -1))
    v.flight = { altitude: this.height(v.body), yaw: Math.atan2(-forward.x, -forward.z) }
    v.raycast.removeFromWorld(this.world)
    this.world.addBody(v.body)
    this.setRamp(v, true)
    return 'Modo vuelo · stick izquierdo: altura y giro · derecho: inclinación'
  }

  private fly(v: Vehicle, active: boolean): void {
    const flight = v.flight!,
      body = v.body
    const lift = active ? (this.input.lift ?? 0) : 0
    const turn = active ? (this.input.turn ?? 0) : 0
    const forward = active && !this.input.brake ? this.input.forward : 0
    const right = active && !this.input.brake ? this.input.right : 0
    const height = this.height(body),
      radial = this.radialUp(body)
    // Assisted travel is explicitly accelerated with Shift, while ordinary drone speed stays 3 m/s.
    const travelSpeed =
      active && this.input.sprint && this.document.geography
        ? Math.min(2000000, Math.max(30, height * 0.8))
        : 3
    const lead = Math.max(1.5, travelSpeed * 0.8)
    flight.altitude = clamp(
      flight.altitude + lift * travelSpeed * FIXED_STEP,
      Math.max(0, height - lead),
      height + lead,
    )
    flight.yaw -= turn * 1.2 * FIXED_STEP
    let tangent = new Quaternion()
    if (this.document.geography) {
      const point = localToGeo(this.document.geography, vec(body.position))
      const q = localFrame(this.document.geography).invert().multiply(localFrame(point))
      tangent = new Quaternion(q.x, q.y, q.z, q.w)
    }
    const heading = tangent.mult(new Quaternion().setFromAxisAngle(new Vec3(0, 1, 0), flight.yaw))
    const pitch = new Quaternion().setFromAxisAngle(new Vec3(1, 0, 0), -forward * 0.35)
    const roll = new Quaternion().setFromAxisAngle(new Vec3(0, 0, 1), -right * 0.35)
    const desired = heading.mult(pitch).mult(roll)
    const error = body.quaternion.inverse().mult(desired)
    const sign = error.w < 0 ? -1 : 1
    const rate = body.vectorToLocalFrame(body.angularVelocity)
    const torque = new Vec3(
      body.inertia.x * (error.x * sign * 24 - rate.x * 7),
      body.inertia.y * (error.y * sign * 24 - rate.y * 7),
      body.inertia.z * (error.z * sign * 24 - rate.z * 7),
    )
    body.torque.vadd(body.vectorToWorldFrame(torque), body.torque)
    const up = body.quaternion.vmult(new Vec3(0, 1, 0))
    const verticalSpeed = body.velocity.dot(radial)
    const acceleration = clamp(
      (flight.altitude - height) * 5 - verticalSpeed * 4,
      -Math.max(6, travelSpeed * 4, Math.abs(verticalSpeed) * 4),
      Math.max(6, travelSpeed * 4, Math.abs(verticalSpeed) * 4),
    )
    // Distribute assisted lift over the rigid assembly: same net force/moment at its
    // combined centre of mass, without forcing the solver to transmit cruise-scale impulses.
    const accelerationVector = up.scale((9.81 + acceleration) / Math.max(up.dot(radial), 0.4))
    const drag = body.velocity.vsub(radial.scale(verticalSpeed)).scale(-0.9)
    const assistedBodies = [body]
    for (const [id, dock] of this.docks)
      if (dock.carrierId === v.entity.id) assistedBodies.push(this.vehicles.get(id)!.body)
    for (const assisted of assistedBodies) {
      assisted.applyForce(accelerationVector.vadd(drag).scale(assisted.mass))
    }
    body.wakeUp()
  }

  nearestVehicle(): string | null {
    if (this.vehicleId) return null
    let nearest: string | null = null,
      distance = 3.5
    for (const [id, v] of this.vehicles) {
      const target = v.definition.garage
        ? v.body.pointToWorldFrame(new Vec3(...v.definition.driver))
        : v.body.position
      const d = target.distanceTo(this.playerBody.position)
      if (d < distance && v.body.velocity.length() < 1.5) {
        let blocked = false
        this.world.raycastAll(this.playerBody.position, target, { skipBackfaces: true }, (hit) => {
          if (hit.body !== this.playerBody && hit.body !== v.body) blocked = true
        })
        if (blocked) continue
        nearest = id
        distance = d
      }
    }
    return nearest
  }
  /** Interaction returns a useful status; dismount requires a supported, unobstructed exit. */
  interact(): string {
    if (this.disposed) throw new Error('Simulation is disposed')
    if (this.vehicleId) return this.exitVehicle()
    const id = this.nearestVehicle()
    if (!id) return 'Acércate a un coche detenido'
    this.vehicleId = id
    this.world.removeBody(this.playerBody)
    this.playerBody.velocity.setZero()
    this.grounded = false
    return 'Conduciendo ' + this.vehicles.get(id)!.entity.name
  }
  private exitVehicle(): string {
    const v = this.vehicles.get(this.vehicleId!)!
    if (v.body.velocity.length() > 1.5) return 'Detén el coche para salir'
    for (const side of [-1, 1]) {
      const offset = v.body.quaternion.vmult(new Vec3(side * (v.entity.size[0] / 2 + 0.8), 0, 0))
      const candidate = v.body.position.vadd(offset)
      let support = -Infinity
      this.world.raycastAll(
        new Vec3(candidate.x, candidate.y + 1, candidate.z),
        new Vec3(candidate.x, candidate.y - 3, candidate.z),
        { skipBackfaces: true },
        (hit) => {
          if (hit.body !== v.body && hit.hitNormalWorld.y > 0.6)
            support = Math.max(support, hit.hitPointWorld.y)
        },
      )
      if (!Number.isFinite(support)) continue
      candidate.y = support + PLAYER_HALF_HEIGHT + 0.04
      const bounds = new AABB({
        lowerBound: new Vec3(
          candidate.x - PLAYER_RADIUS,
          candidate.y - PLAYER_HALF_HEIGHT,
          candidate.z - PLAYER_RADIUS,
        ),
        upperBound: new Vec3(
          candidate.x + PLAYER_RADIUS,
          candidate.y + PLAYER_HALF_HEIGHT,
          candidate.z + PLAYER_RADIUS,
        ),
      })
      const blocked = this.overlapsBody(bounds)
      if (blocked) continue
      this.playerBody.position.copy(candidate)
      this.playerBody.previousPosition.copy(candidate)
      this.playerBody.velocity.setZero()
      this.playerBody.angularVelocity.setZero()
      this.playerBody.aabbNeedsUpdate = true
      this.world.addBody(this.playerBody)
      this.playerBody.wakeUp()
      this.vehicleId = null
      return 'A pie'
    }
    return 'Las salidas están bloqueadas'
  }
  private overlapsBody(bounds: AABB): boolean {
    const center = bounds.lowerBound.vadd(bounds.upperBound).scale(0.5)
    const half = bounds.upperBound.vsub(bounds.lowerBound).scale(0.5)
    const candidate = new OBB(new Vector3(...vec(center)), new Vector3(...vec(half)))
    return this.world.bodies.some((body) =>
      body.shapes.some((shape, i) => {
        if (!(shape instanceof Box)) return false
        const p = body.pointToWorldFrame(body.shapeOffsets[i])
        const q = body.quaternion.mult(body.shapeOrientations[i])
        const rotation = new Matrix3().setFromMatrix4(
          new Matrix4().makeRotationFromQuaternion(new RenderQuaternion(q.x, q.y, q.z, q.w)),
        )
        return candidate.intersectsOBB(
          new OBB(new Vector3(...vec(p)), new Vector3(...vec(shape.halfExtents)), rotation),
        )
      }),
    )
  }

  vehicleInfo(
    id: string,
    interpolated = false,
  ): {
    steer: number
    driver: Vec3Tuple
    cameraDistance: number
    turnRate: number
    isCarrier: boolean
    dockedTo: string | null
    rampClosed: boolean
    flightMode: boolean
    canFly: boolean
    targetAltitude: number | null
  } {
    const v = this.vehicles.get(id)
    if (!v) throw new Error('Unknown vehicle: ' + id)
    return {
      steer: v.steer,
      driver: new Vector3(...v.definition.driver)
        .applyQuaternion(new RenderQuaternion(...this.entityTransform(id, interpolated).rotation))
        .add(new Vector3(...this.entityTransform(id, interpolated).position))
        .toArray(),
      cameraDistance: v.definition.cameraDistance,
      turnRate: v.body.angularVelocity.y,
      isCarrier: Boolean(v.definition.garage),
      dockedTo: this.docks.get(id)?.carrierId ?? null,
      rampClosed: v.rampClosed,
      flightMode: Boolean(v.flight),
      canFly: Boolean(v.definition.flight),
      targetAltitude: v.flight?.altitude ?? null,
    }
  }

  dockingCandidate(id = this.vehicleId): string | null {
    if (!id || this.docks.has(id)) return null
    const car = this.vehicles.get(id)
    if (!car || car.definition.garage) return null
    for (const [carrierId, carrier] of this.vehicles) {
      const bay = carrier.definition.garage
      if (!bay || [...this.docks.values()].some((d) => d.carrierId === carrierId)) continue
      if (
        carrier.body.velocity.length() > 0.8 ||
        car.body.velocity.vsub(carrier.body.velocity).length() > 0.8
      )
        continue
      // Every chassis corner must be inside, and all four suspension rays must rest on this carrier.
      if (
        !car.raycast.wheelInfos.every(
          (w) => w.raycastResult.hasHit && w.raycastResult.body === carrier.body,
        )
      )
        continue
      const contained = car.definition.colliders.every((collider) => {
        const q = new Quaternion(...collider.transform.rotation)
        for (const x of [-1, 1])
          for (const y of [-1, 1])
            for (const z of [-1, 1]) {
              const point = q
                .vmult(
                  new Vec3(
                    (x * collider.size[0]) / 2,
                    (y * collider.size[1]) / 2,
                    (z * collider.size[2]) / 2,
                  ),
                )
                .vadd(new Vec3(...collider.transform.position))
              const local = carrier.body.pointToLocalFrame(car.body.pointToWorldFrame(point))
              if (vec(local).some((n, i) => n < bay.min[i] - 0.05 || n > bay.max[i])) return false
            }
        return true
      })
      if (contained) return carrierId
    }
    return null
  }

  toggleDock(): string {
    if (!this.vehicleId) return 'Entra en el coche para sujetarlo al garaje'
    const car = this.vehicles.get(this.vehicleId)!
    const dock = this.docks.get(this.vehicleId)
    if (dock) {
      if (this.vehicles.get(dock.carrierId)!.flight)
        return 'Aterriza y activa modo tierra antes de soltar el coche'
      if (this.vehicles.get(dock.carrierId)!.body.velocity.length() > 0.8)
        return 'Detén el container para soltar el coche'
      this.setRamp(this.vehicles.get(dock.carrierId)!, false)
      this.world.removeConstraint(dock.constraint)
      this.docks.delete(this.vehicleId)
      this.world.removeBody(car.body)
      car.raycast.addToWorld(this.world)
      car.body.wakeUp()
      return 'Coche libre · sal marcha atrás por la rampa'
    }
    const carrierId = this.dockingCandidate()
    if (!carrierId) return 'Aparca completamente dentro del garaje y frena'
    const carrier = this.vehicles.get(carrierId)!
    car.raycast.removeFromWorld(this.world)
    this.world.addBody(car.body)
    car.body.velocity.copy(carrier.body.velocity)
    car.body.angularVelocity.copy(carrier.body.angularVelocity)
    const constraint = new LockConstraint(carrier.body, car.body, { maxForce: 1e12 })
    constraint.collideConnected = false
    this.world.addConstraint(constraint)
    this.docks.set(this.vehicleId, { carrierId, constraint })
    this.setRamp(carrier, true)
    return 'A3 sujeto al suelo · T para conducir el container'
  }

  private setRamp(carrier: Vehicle, closed: boolean): void {
    carrier.rampClosed = closed
    const ramp = carrier.definition.garage?.ramp
    if (!ramp) return
    const collider = carrier.definition.colliders[ramp.colliderIndex]
    const hinge = new Vec3(...ramp.hinge)
    const rotation = new Quaternion().setFromAxisAngle(
      new Vec3(1, 0, 0),
      closed ? ramp.closeAngle : 0,
    )
    const offset = rotation.vmult(new Vec3(...collider.transform.position).vsub(hinge)).vadd(hinge)
    carrier.body.shapeOffsets[ramp.colliderIndex].copy(offset)
    carrier.body.shapeOrientations[ramp.colliderIndex].copy(
      rotation.mult(new Quaternion(...collider.transform.rotation)),
    )
    carrier.body.updateBoundingRadius()
    carrier.body.updateMassProperties()
    carrier.body.aabbNeedsUpdate = true
    carrier.body.wakeUp()
  }

  transferControls(): string {
    if (!this.vehicleId) return 'Entra primero en un vehículo'
    const dock = this.docks.get(this.vehicleId)
    const cargoId = [...this.docks].find(([, d]) => d.carrierId === this.vehicleId)?.[0]
    const target = dock?.carrierId ?? cargoId
    if (!target) return 'Sujeta el coche dentro del container para cambiar de mando'
    const active = this.vehicles.get(this.vehicleId)!
    if (active.body.velocity.length() > 0.8) return 'Detén el vehículo antes de cambiar de mando'
    this.vehicleId = target
    return 'Al mando de ' + this.vehicles.get(target)!.entity.name
  }

  /** Keeps a third-person camera in front of the nearest physical obstruction. */
  cameraPosition(target: Vec3Tuple, desired: Vec3Tuple): Vec3Tuple {
    const from = new Vec3(...target),
      to = new Vec3(...desired)
    const delta = to.vsub(from),
      total = delta.length()
    if (total < 0.001) return [...target]
    let distance = total
    const active = this.vehicleId ? this.vehicles.get(this.vehicleId)?.body : null
    this.world.raycastAll(from, to, { skipBackfaces: true }, (hit) => {
      if (hit.body !== this.playerBody && hit.body !== active)
        distance = Math.min(distance, Math.max(0.15, hit.distance - 0.2))
    })
    return vec(from.vadd(delta.scale(distance / total)))
  }
  dispose(): void {
    if (this.disposed) return
    for (const dock of this.docks.values()) this.world.removeConstraint(dock.constraint)
    this.docks.clear()
    this.previousWheels.clear()
    for (const v of this.vehicles.values()) v.raycast.removeFromWorld(this.world)
    for (const b of [...this.world.bodies]) this.world.removeBody(b)
    this.vehicles.clear()
    this.bodies.clear()
    this.disposed = true
  }
}
