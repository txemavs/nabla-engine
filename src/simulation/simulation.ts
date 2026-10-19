import { ForkliftMechanism, type ForkliftInput } from './forklift.js'
import { explosionTuning } from '../config/gameplay-tuning.js'
import { TowOverload } from './tow-overload.js'
import { VehicleDamage } from './vehicle-damage.js'
/** Own one physics world and coordinate independent collision, portal and vehicle subsystems. */
import { VehicleDocking } from './vehicle-docking.js'
import { PortalTraversal } from './portal-traversal.js'
import { MapCollisions } from './map-collisions.js'
import { PlanetCatchFloor } from './catch-floor.js'
import { createEntityBody } from './entity-body.js'
import { RoadAssist } from './road-assist.js'
import {
  nearestRoadPoint,
  ROAD_SNAP_MAX_DISTANCE,
  RoadSegmentIndex,
  type RoadCenterline,
} from './road-snap.js'
import { classifyWheelSurface, type PavedArea, type WheelSurface } from './wheel-surface.js'
import { portalEnvelope, portalExitBlocked } from './portal-clearance.js'
import { constrainTerrainBoundary } from './terrain-boundary.js'
import { ejectionDefaults, simulationDefaults, mapCollisionDefaults } from '../config/simulation.js'
import { slideSpeed, startEjection, stepEjection, type RiderEjection } from './rider-ejection.js'
import {
  createWheeledVehicle,
  stepWheeledVehicle,
  syncWheeledDamping,
  wheeledTelemetry,
  wheelContacts,
  shiftWheeledVehicle,
  automaticWheeledTransmission,
  setWheeledEngineMode,
  enterWheeledVehicle,
} from './vehicles/wheeled/runtime.js'
import { engagePark, hasEngineModes, startIgnition } from './vehicles/drivetrain.js'
import type { EngineMode } from './vehicles/wheeled/contracts.js'
import {
  createTwoWheeledVehicle,
  resetTwoWheeled,
  stepTwoWheeledVehicle,
  twoWheeledPose,
  type TwoWheeledPose,
  type TwoWheeledVehicle,
} from './vehicles/two-wheeled/index.js'
import type {
  GearClackProfile,
  WheeledInput,
  WheelContactSnapshot,
} from './vehicles/wheeled/contracts.js'
import { stepBoatInWater } from './vehicles/boat.js'
import { stepFlight } from './vehicles/flight.js'
import { PlanetCollisions, type PlanetCollisionTile } from '../planet/index.js'
import { SceneEditor } from '../scene/history.js'
import {
  assertHostedMouths,
  assertPlaceable,
  portalColliders,
  portalLocal,
} from '../entity/portal/portal.js'
import { EARTH_RADIUS, geoToLocal, localFrame, localToGeo } from '../math/geo/sphere.js'
import { Quaternion as RenderQuaternion, Vector3 } from 'three'
import { vehicleDefinition, type Vehicle } from '../entity/vehicle/vehicle.js'
import type { VehicleDefinition } from '../entity/vehicle/field.js'
import {
  AABB,
  Body,
  Box,
  Material,
  HingeConstraint,
  Quaternion,
  Sphere,
  Trimesh,
  Vec3,
  World,
} from './physics.js'
import { isMapBuilding, type Entity, type Transform, type Vec3Tuple } from '../entity/schema.js'
import { parseScene, replaceMapScene, type SceneDocument } from '../scene/document.js'
import { SceneGraph } from '../scene/graph.js'
import { addLandingGearShapes, hasLandingGear, removeLandingGearShapes } from './landing-gear.js'
import {
  addTrailerJoint,
  bindTrailerTow,
  clearTrailerTow,
  createTrailerJoint,
  hitchCandidate as findHitchCandidate,
  removeJointsFor,
  trailerTowedBy,
} from './trailer-hitch.js'

export const FIXED_STEP = simulationDefaults.fixedStepSeconds

/** R reset options; see `Simulation.recoverVehicle`. */
/** Read-only physical shapes for scaled contact adapters; never render mesh bounds. */
export interface EntityCollisionPart {
  key: string
  transform: Transform
  shape: { kind: 'box'; halfExtents: Vec3Tuple } | { kind: 'sphere'; radius: number }
  friction: number
  restitution: number
}

export interface RecoverVehicleOptions {
  /** Move to the nearest road centreline before uprighting (default false). */
  snapToRoad?: boolean
  /** Extra centrelines in the simulation frame, e.g. streamed OSM navigation roads. */
  roads?: Iterable<RoadCenterline>
  /** Search radius in metres (default `ROAD_SNAP_MAX_DISTANCE`). */
  maxRoadDistance?: number
}
const PLAYER_HALF_HEIGHT = simulationDefaults.playerHalfHeight
const PLAYER_RADIUS = simulationDefaults.playerRadius
export { idleInput, type PlayerInput, type PlayerSnapshot } from './contracts.js'
import { gearLabel } from '../entity/vehicle/gear-label.js'
import type { ImpactSurface } from '../config/impact-sounds.js'
import { idleInput, type PlayerInput, type PlayerSnapshot } from './contracts.js'
const vec = (v: Vec3): Vec3Tuple => [v.x, v.y, v.z]
const pose = (b: Body): Transform => ({
  position: vec(b.position),
  rotation: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w],
})
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
/** Road vehicles (cars, trucks) have an automatic selector; boats and aircraft do not. */
const hasGearSelector = (d: VehicleDefinition): boolean =>
  !d.passive && !d.boat && !d.plane && !d.flight

/** Owns exactly one physics world. Scene data is copied and never mutated.
 * The host supplies elapsed seconds and input, and reads snapshots after step(). */
export class Simulation {
  private readonly damage = new VehicleDamage()
  private readonly explosions: {
    entityId: string
    position: Vec3Tuple
    cause: 'weapon' | 'impact'
    occupied: boolean
  }[] = []
  vehicleDamage(id: string): { health: number; destroyed: boolean } {
    return { health: this.damage.remaining(id), destroyed: this.damage.destroyed(id) }
  }
  /** Actual weapon hits only; ray probes never cause damage. */
  damageVehicle(id: string | null, amount: number): void {
    if (!id || !this.vehicles.has(id) || this.vehicles.get(id)!.definition.passive) return
    this.damage.apply(id, amount)
    this.resolveExplosions()
  }
  consumeExplosions(): {
    entityId: string
    position: Vec3Tuple
    cause: 'weapon' | 'impact'
    occupied: boolean
  }[] {
    return this.explosions.splice(0)
  }
  private resolveExplosions(cause: 'weapon' | 'impact' = 'weapon'): void {
    let pending = this.damage.drain()
    while (pending.length) {
      for (const id of pending) {
        const v = this.vehicles.get(id)
        if (!v) continue
        const occupied = this.vehicleId === id
        v.helm = 'off'
        v.prop = 0
        v.drivetrain.ignition = 'running'
        v.drivetrain.rpm = v.drivetrain.force = v.drivetrain.load = 0
        this.gentleRecovery = null
        this.bikeMountHold = null
        if (this.vehicleId === id) this.ejectRider(v)
        const centre = v.body.position.clone()
        const up = this.radialUp(v.body)
        this.explosions.push({ entityId: id, position: vec(centre), cause, occupied })
        for (const body of this.world.bodies) {
          if (!body.mass) continue
          const direction = body.position.vsub(centre)
          const distance = direction.length()
          if (distance >= explosionTuning.radiusMetres) continue
          const strength = 1 - distance / explosionTuning.radiusMetres
          if (distance > 0.1) direction.normalize()
          else direction.copy(up)
          direction.vadd(up.scale(0.45), direction)
          body.wakeUp()
          // Uneven pressure hits away from the centre of mass, producing real tumble.
          const application = new Vec3(
            (Math.random() - 0.5) * explosionTuning.offsetX,
            (Math.random() - 0.5) * explosionTuning.offsetY,
            (Math.random() - 0.5) * explosionTuning.offsetZ,
          )
          direction.x += (Math.random() - 0.5) * explosionTuning.directionJitter
          direction.z += (Math.random() - 0.5) * explosionTuning.directionJitter
          body.applyImpulse(
            direction.scale(body.mass * explosionTuning.impulseSpeed * strength),
            application,
          )
          for (const [otherId, other] of this.vehicles)
            if (other.body === body && otherId !== id && !other.definition.passive)
              this.damage.apply(otherId, strength * 45)
        }
      }
      pending = this.damage.drain()
    }
  }
  private readonly document: SceneDocument
  private readonly terrainEntity: Entity | undefined
  private waterLevel = 0
  setWaterLevel(metres: number): void {
    if (Number.isFinite(metres)) this.waterLevel = clamp(metres, -5, 50)
  }
  /** Top face of the gray disk, once the occupied actor has dropped under the sea. */
  catchDisk(): Transform | null {
    return this.fallbackFloor.pose()
  }
  private minimumFlightAltitude: number
  private graph: SceneGraph
  private entitiesById = new Map<string, Entity>()
  private terrainGrounds: { e: Entity; pose: Transform }[] = []
  private readonly portalEntities: Entity[]
  private readonly world = new World({ gravity: new Vec3(0, -simulationDefaults.gravity, 0) })
  private readonly solidMaterial = new Material({
    friction: simulationDefaults.solidFriction,
    restitution: 0,
  })
  private readonly planetCollisions = new PlanetCollisions(this.world, this.solidMaterial)
  setPlanetTiles(tiles: PlanetCollisionTile[]): void {
    this.planetCollisions.setTiles(tiles)
  }
  /** Prepare hot-reloaded terrain without moving any actor or stepping physics. */
  preparePlanetReplacement(
    previousId: string,
    tile: PlanetCollisionTile,
  ): (() => void) | undefined {
    return this.planetCollisions.prepareReplacement(
      previousId,
      tile,
      [
        vec(this.playerBody.position),
        ...[...this.vehicles.values()].map((v) => vec(v.body.position)),
      ],
      this.mapBuildingsEnabled,
    )
  }
  discardPlanetReplacement(): void {
    this.planetCollisions.discardReplacement()
  }
  /** Small streamed scenery bodies, owned and retired by the host layer. */
  /**
   * Static or dynamic scenery pole. `shape.half` overrides the default box (a thin sign post);
   * `shape.solid` gives it the same surface as the planet's static colliders (trees, lamp posts).
   */
  createSceneryPole(
    position: Vec3Tuple,
    height: number,
    movable: boolean,
    shape?: { half?: Vec3Tuple; solid?: boolean; surface?: ImpactSurface },
  ) {
    if (
      this.disposed ||
      height <= 0 ||
      !Number.isFinite(height) ||
      !position.every(Number.isFinite)
    )
      throw new Error('Invalid scenery pole')
    const body = new Body({
      mass: movable ? 18 : 0,
      position: new Vec3(...position),
      shape: new Box(
        new Vec3(...(shape?.half ?? [movable ? 0.045 : 0.09, height / 2, movable ? 0.045 : 0.09])),
      ),
      ...(shape?.solid ? { material: this.solidMaterial } : {}),
      linearDamping: 0.15,
      angularDamping: 0.2,
    })
    this.world.addBody(body)
    if (shape?.surface) this.bodySurfaces.set(body, shape.surface)
    body.preserveSleep = movable
    if (movable) body.setBreakawayAnchor(true)
    let removed = false
    return {
      impact: (point: Vec3Tuple, direction: Vec3Tuple, impulse: number) => {
        if (removed || this.disposed || !movable) return
        body.setBreakawayAnchor(false)
        body.wakeUp()
        body.applyImpulse(
          new Vec3(...direction).scale(Math.min(20, Math.max(0, impulse))),
          new Vec3(...point).vsub(body.position),
        )
      },
      pose: () => ({
        position: vec(body.position),
        rotation: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w] as [
          number,
          number,
          number,
          number,
        ],
      }),
      restore: (position: Vec3Tuple, rotation: [number, number, number, number]) => {
        if (removed || this.disposed) return
        body.raw?.wakeUp()
        body.position.set(...position)
        body.quaternion.set(...rotation)
        if (movable && Math.abs(rotation[0]) + Math.abs(rotation[2]) > 0.001)
          body.setBreakawayAnchor(false)
        body.raw?.sleep()
      },
      dispose: () => {
        if (!removed && !this.disposed) this.world.removeBody(body)
        removed = true
      },
    }
  }

  /** Positions of the player and every vehicle: the bodies scenery must be ready for. */
  sceneryActors(): Vec3Tuple[] {
    return [
      vec(this.playerBody.position),
      ...[...this.vehicles.values()].map((v) => vec(v.body.position)),
    ]
  }
  /** Frozen inspection keeps authored body poses intact while terrain streams. */
  terrainSupportPaused = false
  /** Keep resting actors above newly refined ground while collision coverage swaps. */
  capturePlanetSupport(sample: (position: Vec3Tuple) => number | undefined): () => void {
    const bodies = [...this.vehicles.values()].map((v) => v.body)
    if (!this.interiorId && !this.vehicleId) bodies.push(this.playerBody)
    const support = bodies
      .map((body) => ({ body, height: sample(vec(body.position)) }))
      .filter(
        ({ body, height }) =>
          height !== undefined &&
          Math.abs(body.position.y - height) < 3 &&
          Math.abs(body.velocity.y) < 3,
      )
    return () => {
      if (this.terrainSupportPaused) return
      for (const { body, height } of support) {
        const next = sample(vec(body.position))
        if (next === undefined || next <= height!) continue
        const rise = next - height!
        body.position.y += rise
        body.previousPosition.y += rise
        body.interpolatedPosition.y += rise
        body.aabbNeedsUpdate = true
        body.wakeUp()
      }
    }
  }
  preparePlanetCollisions(): boolean {
    this.planetCollisions.update(this.sceneryActors(), this.mapBuildingsEnabled)
    return this.planetCollisions.ready
  }
  private readonly characterMaterial = new Material({ friction: 0, restitution: 0 })
  private readonly forklifts = new WeakMap<Vehicle, ForkliftMechanism>()
  private forkliftInput: ForkliftInput = [0, 0, 0]
  setForkliftInput(input: ForkliftInput): void {
    this.forkliftInput = input.map((v) =>
      Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0,
    ) as ForkliftInput
  }
  forkliftPose(id: string) {
    const v = this.vehicles.get(id)
    const m = v && this.forklifts.get(v)
    return m ? { lift: m.lift, tilt: m.tilt, side: m.side } : null
  }
  private readonly bodies = new Map<string, Body>()
  /** Impact-sound surface of tagged bodies (scenery poles); see `config/impact-sounds.ts`. */
  private readonly bodySurfaces = new WeakMap<Body, ImpactSurface>()
  private mapBuildingsEnabled = true
  private collisionDistance = 400
  private readonly mapCollision = new MapCollisions(this.world)
  private readonly deferredMapBodies = this.mapCollision.deferredMapBodies
  private readonly mapBodies = this.mapCollision.mapBodies
  private readonly fallbackFloor = new PlanetCatchFloor(this.world, this.solidMaterial)
  private readonly vehicles = new Map<string, Vehicle>()
  private readonly hostedShapes = new Map<string, Box[]>()
  private readonly playerBody: Body
  private input = idleInput()
  private jumpPending = false
  private accumulator = 0
  private readonly previousWheels = new Map<string, Transform[]>()
  private vehicleId: string | null = null
  private interiorId: string | null = null
  private hoverJumpTime = 0
  private ejection: RiderEjection | null = null
  private readonly fallRest = new Map<string, number>()
  private gentleRecovery: {
    vehicleId: string
    phase: 'rising' | 'lifting'
    elapsed: number
    from?: Quaternion
    to?: Quaternion
    position?: Vec3
    targetY?: number
    riderPosition: Vec3
  } | null = null
  private bikeMountHold: {
    vehicleId: string
    elapsed: number
    position: Vec3
    rotation: Quaternion
  } | null = null
  private disposed = false
  private grounded = false
  private support: Body | null = null
  private readonly garage = new VehicleDocking(this.world, this.vehicles, (v, closed) =>
    this.setRamp(v, closed),
  )
  private readonly docks = this.garage.docks
  private readonly trailerJoints: HingeConstraint[] = []
  private readonly towOverload = new TowOverload()
  private ticks = 0
  private lostTime = 0
  private readonly roadGuidance = new RoadAssist()
  /** Host carriageways (OSM navigation roads) in the simulation frame. Scene roads are added. */
  private hostSurfaceRoads: RoadCenterline[] = []
  private readonly portalTraversal = new PortalTraversal()
  /**
   * The rider thrown off a crashed two-wheeler, from the throw until control returns (flying,
   * down on the ground, getting up); null otherwise. Input is ignored meanwhile.
   */
  get playerEjection(): RiderEjection | null {
    return this.ejection
  }
  /** Low-speed tip-over recovery, for the avatar's lifting pose. */
  get playerBikeRecovery(): {
    vehicleId: string
    phase: 'rising' | 'lifting' | 'boarding'
    progress: number
  } | null {
    const r = this.gentleRecovery
    if (this.bikeMountHold)
      return {
        vehicleId: this.bikeMountHold.vehicleId,
        phase: 'boarding',
        progress: Math.min(1, this.bikeMountHold.elapsed / 0.85),
      }
    return r
      ? {
          vehicleId: r.vehicleId,
          phase: r.phase,
          progress: Math.min(
            1,
            r.phase === 'rising'
              ? (this.ejection?.phaseElapsed ?? ejectionDefaults.riseSeconds) /
                  ejectionDefaults.riseSeconds
              : r.elapsed / 1.7,
          ),
        }
      : null
  }
  get portalEvent() {
    return this.portalTraversal.event
  }

  constructor(
    raw: SceneDocument,
    readonly options: {
      playerMode?: 'walk' | 'hover'
      mapBuildingsEnabled?: boolean
      experimentalLargeScene?: boolean
      planetaryTerrain?: boolean
      /** Damage from strong physical impacts; weapon damage is always explicit. */
      vehicleDamage?: boolean
      /**
       * Start-up sequence when a driver gets into a geared road vehicle: starter cranking, then
       * the needle sweep while the engine settles to idle, all in P (default true). False only
       * selects P.
       */
      ignition?: boolean
    } = {},
  ) {
    this.mapBuildingsEnabled = options.mapBuildingsEnabled ?? true
    this.document = parseScene(raw, options.experimentalLargeScene)
    this.terrainEntity = this.document.entities.find((e) => e.terrain)
    this.minimumFlightAltitude = this.terrainEntity?.terrain
      ? Math.min(...this.terrainEntity.terrain.heights) - 10
      : options.planetaryTerrain
        ? -12000
        : 0
    this.graph = SceneGraph.fromValidated(this.document)
    this.entitiesById = new Map(this.document.entities.map((e) => [e.id, e]))
    this.terrainGrounds = this.document.entities
      .filter((e) => e.terrain)
      .map((e) => ({ e, pose: this.graph.worldTransform(e.id) }))
    this.portalEntities = this.document.entities.filter((e) => e.portal)
    this.world.raw.integrationParameters.numSolverIterations = simulationDefaults.solverIterations
    this.world.defaultContactMaterial.friction = simulationDefaults.solidFriction
    this.world.defaultContactMaterial.restitution = 0
    for (const e of this.document.entities) this.addEntityBody(e)
    for (const v of this.vehicles.values()) this.attachTrailerJoint(v)
    for (const mouth of this.portalEntities) if (mouth.parentId) this.rebuildPortalCollider(mouth)
    for (const v of this.vehicles.values())
      if (v.definition.garage) {
        const active = this.portalEntities.some(
          (e) => e.parentId === v.entity.id && e.portal!.clearsRamp && e.portal!.mode !== 'closed',
        )
        this.setRamp(v, v.definition.passive ? true : active)
        if (active) v.rampAngle = v.rampTarget
        this.updateRamp(v, 0)
      }
    if (this.document.geography) {
      const terrain = new Body({ mass: 0, material: this.solidMaterial })
      const radius = EARTH_RADIUS + this.document.geography.altitude
      const sink =
        options.planetaryTerrain || this.document.entities.some((e) => e.terrain) ? 200 : 0
      terrain.addShape(new Sphere(radius - sink))
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
    this.playerBody.addShape(new Box(new Vec3(PLAYER_RADIUS, this.playerHalfHeight, PLAYER_RADIUS)))
    this.playerBody.updateMassProperties()
    this.playerBody.position.set(...spawn.transform.position)
    this.playerBody.position.y += this.options.playerMode === 'hover' ? 1.25 : PLAYER_HALF_HEIGHT
    this.playerBody.previousPosition.copy(this.playerBody.position)
    this.world.addBody(this.playerBody)
  }

  portalState(id: string): NonNullable<Entity['portal']> {
    const mouth = this.portalEntities.find((e) => e.id === id)
    if (!mouth?.portal) throw new Error('Unknown portal')
    return { ...mouth.portal }
  }

  /** Runtime links are atomic and do not modify the authored document owned by the host. */
  configurePortal(
    id: string,
    destinationId: string | null,
    mode: 'closed' | 'window' | 'open',
  ): string {
    const editor = new SceneEditor(this.document)
    const source = this.portalEntities.find((e) => e.id === id)
    if (!source) throw new Error('Portal desconocido')
    if (source.portal!.pairId !== destinationId) editor.linkPortals(id, destinationId)
    editor.setPortalMode(id, mode)
    const next = editor.document
    const changed = this.portalEntities.filter(
      (e) =>
        JSON.stringify(e.portal) !==
        JSON.stringify(next.entities.find((n) => n.id === e.id)!.portal),
    )
    for (const mouth of next.entities.filter(
      (e) => e.portal?.clearsRamp && e.portal.mode !== 'closed',
    )) {
      const carrier = this.vehicles.get(mouth.parentId ?? '')
      if (!carrier?.rampClosed)
        throw new Error('Cierra por completo la puerta del garaje antes de activar el portal')
    }
    for (const mouth of changed) {
      const transform = this.entityTransform(mouth.id)
      for (const body of this.world.bodies) {
        if (!body.mass || body === this.bodies.get(mouth.parentId ?? '')) continue
        const actor = [...this.vehicles.values()].find((v) => v.body === body)
        const corners = portalEnvelope(body, actor).map((p) => portalLocal(p, transform))
        if (
          corners.length &&
          Math.min(...corners.map((p) => p.z)) < 0.2 &&
          Math.max(...corners.map((p) => p.z)) > -0.2 &&
          Math.min(...corners.map((p) => p.x)) < mouth.size[0] / 2 &&
          Math.max(...corners.map((p) => p.x)) > -mouth.size[0] / 2 &&
          Math.min(...corners.map((p) => p.y)) < mouth.size[1] / 2 &&
          Math.max(...corners.map((p) => p.y)) > -mouth.size[1] / 2
        )
          throw new Error('Paso ocupado: despeja el marco antes de cambiar la conexión')
      }
    }
    for (const mouth of changed)
      mouth.portal = { ...next.entities.find((e) => e.id === mouth.id)!.portal! }
    for (const mouth of changed) this.rebuildPortalCollider(mouth)
    for (const vehicle of this.vehicles.values()) this.updateRamp(vehicle, 0)
    return mode === 'closed' ? 'Portal cerrado' : 'Portal conectado'
  }

  private rebuildPortalCollider(mouth: Entity): void {
    const host = mouth.parentId ? this.bodies.get(mouth.parentId)! : this.bodies.get(mouth.id)!
    if (mouth.parentId)
      for (const shape of this.hostedShapes.get(mouth.id) ?? []) host.removeShape(shape)
    else for (const shape of [...host.shapes]) host.removeShape(shape)
    const shapes: Box[] = []
    const q = new Quaternion(
      ...(mouth.parentId ? mouth.transform.rotation : ([0, 0, 0, 1] as const)),
    )
    const origin = new Vec3(...(mouth.parentId ? mouth.transform.position : ([0, 0, 0] as const)))
    for (const collider of portalColliders(mouth)) {
      const shape = new Box(new Vec3(...(collider.size.map((n) => n / 2) as Vec3Tuple)))
      host.addShape(
        shape,
        q.vmult(new Vec3(...collider.transform.position)).vadd(origin),
        q.mult(new Quaternion(...collider.transform.rotation)),
      )
      shapes.push(shape)
    }
    if (mouth.parentId) this.hostedShapes.set(mouth.id, shapes)
    host.updateBoundingRadius()
    host.updateMassProperties()
    host.aabbNeedsUpdate = true
    host.wakeUp()
  }

  /** Add/remove only static map entities without touching actor state or the physics clock. */
  replaceMapEntities(remove: Set<string>, add: Entity[], experimentalLargeScene = false): void {
    for (const e of [...this.document.entities.filter((e) => remove.has(e.id)), ...add])
      if (e.motion === 'dynamic' || e.kind === 'spawn' || e.portal || e.kind === 'vehicle')
        throw new Error('Streaming only supports static map entities')
    const next = replaceMapScene(this.document, remove, add, experimentalLargeScene)
    this.document.entities = next.entities
    this.graph = SceneGraph.fromValidated(this.document)
    this.entitiesById = new Map(this.document.entities.map((e) => [e.id, e]))
    this.terrainGrounds = this.document.entities
      .filter((e) => e.terrain)
      .map((e) => ({ e, pose: this.graph.worldTransform(e.id) }))
    for (const id of remove) {
      const b = this.bodies.get(id)
      if (b) this.world.removeBody(b)
      this.bodies.delete(id)
      this.mapBodies.delete(id)
      this.deferredMapBodies.delete(id)
    }
    for (const e of add) {
      if ((isMapBuilding(e) && e.motion === 'static') || e.road) {
        const pose = this.graph.worldTransform(e.id)
        const points = e.geometry?.vertices ?? e.road?.paths.flat() ?? []
        const radius = points.reduce((r, v) => Math.max(r, Math.hypot(...v)), 1)
        this.deferredMapBodies.set(e.id, { entity: e, center: new Vec3(...pose.position), radius })
      } else this.addEntityBody(e)
    }
    this.mapCollision.invalidate()
    this.preparePlanetCollisions()
    this.installNearbyMapBodies()
    this.minimumFlightAltitude = Math.min(
      0,
      ...this.document.entities.flatMap((e) =>
        e.terrain ? [Math.min(...e.terrain.heights) - 10] : [],
      ),
    )
  }
  /**
   * Add plain vehicles to a running simulation (the game menu and host `placeVehicle`).
   * Tow joints are kept when the tractor is in this batch or already in the world.
   * The batch may also carry unlinked, closed portal mouths hosted on one of its vehicles
   * (the carrier stern portal from `presetEntities`); they join the portal system closed.
   */
  addVehicles(added: Entity[]): void {
    const vehicles = added.filter((e) => !e.portal)
    const mouths = added.filter((e) => e.portal)
    for (const e of vehicles) {
      if (e.kind !== 'vehicle' || !e.vehicle)
        throw new Error(`Entity ${e.id} is not a plain vehicle`)
      if (this.entitiesById.has(e.id)) throw new Error(`Entity id already in use: ${e.id}`)
      if (e.vehicle.tow) {
        const tractor =
          added.find((other) => other.id === e.vehicle!.tow!.vehicleId) ??
          this.entitiesById.get(e.vehicle.tow.vehicleId)
        if (!tractor?.vehicle || tractor.vehicle.passive || tractor.id === e.id)
          throw new Error('Trailer requires a powered towing vehicle')
      }
    }
    assertHostedMouths(mouths, vehicles, this.entitiesById)
    const copies = structuredClone([...vehicles, ...mouths])
    this.document.entities = [...this.document.entities, ...copies]
    this.graph = SceneGraph.fromValidated(this.document)
    this.entitiesById = new Map(this.document.entities.map((e) => [e.id, e]))
    for (const e of copies) if (!e.portal) this.addEntityBody(e)
    for (const e of copies) {
      const vehicle = this.vehicles.get(e.id)
      if (vehicle) this.attachTrailerJoint(vehicle)
    }
    for (const mouth of copies.filter((e) => e.portal)) {
      this.portalEntities.push(mouth)
      this.rebuildPortalCollider(mouth)
    }
  }
  /**
   * Add placed scenery to a running simulation: standalone portals, sprites, lamps and static
   * boxes, including standalone dynamic props (the game add menu and host `placeEntities`). Portals may be linked within the batch;
   * links to existing mouths are made afterwards with `configurePortal`.
   */
  addPlaced(added: Entity[]): void {
    assertPlaceable(added, this.entitiesById)
    const copies = structuredClone(added)
    this.document.entities = [...this.document.entities, ...copies]
    this.graph = SceneGraph.fromValidated(this.document)
    this.entitiesById = new Map(this.document.entities.map((e) => [e.id, e]))
    for (const e of copies) this.addEntityBody(e)
    for (const e of copies) if (e.portal) this.portalEntities.push(e)
  }
  /**
   * Remove entities installed by `addPlaced`. A mouth linked to a portal that stays is unlinked
   * (and closed) first, so the partner never points at a missing mouth.
   */
  removePlaced(ids: readonly string[]): void {
    const removing = new Set(ids)
    const entities = ids.map((id) => {
      const e = this.entitiesById.get(id)
      if (!e) throw new Error(`Unknown entity: ${id}`)
      if (e.kind === 'vehicle' || e.parentId) throw new Error(`Not a placed entity: ${id}`)
      return e
    })
    for (const e of entities)
      if (e.portal?.pairId && !removing.has(e.portal.pairId))
        this.configurePortal(e.id, null, 'closed')
    for (const e of entities) {
      const body = this.bodies.get(e.id)
      if (body?.world === this.world) this.world.removeBody(body)
      this.bodies.delete(e.id)
      this.mapBodies.delete(e.id)
      if (e.portal) this.portalEntities.splice(this.portalEntities.indexOf(e), 1)
    }
    this.document.entities = this.document.entities.filter((e) => !removing.has(e.id))
    this.graph = SceneGraph.fromValidated(this.document)
    this.entitiesById = new Map(this.document.entities.map((e) => [e.id, e]))
  }
  /**
   * Every live vehicle in insertion order (start vehicle, host fleet, spawned ones), with the
   * tractor a trailer is hitched to. For exporting placements; poses come from `entityTransform`.
   */
  vehicleList(): { id: string; entity: Entity; towedBy: string | null }[] {
    return [...this.vehicles.values()].map((v) => ({
      id: v.entity.id,
      entity: v.entity,
      towedBy: v.definition.tow?.vehicleId ?? null,
    }))
  }
  /** Authored definition of a live vehicle, including ones added with `addVehicles`; null if unknown. */
  vehicleSpec(id: string): VehicleDefinition | null {
    return this.vehicles.get(id)?.definition ?? null
  }
  /** Remove a vehicle added with `addVehicles`. The player must not be inside it. */
  removeVehicle(id: string): void {
    const v = this.vehicles.get(id)
    if (!v) throw new Error(`No vehicle ${id}`)
    if (this.vehicleId === id) throw new Error('Leave the vehicle before removing it')
    const mouths = this.portalEntities.filter((e) => e.parentId === id)
    // A linked partner must not keep pointing at a mouth that is about to disappear.
    for (const mouth of mouths)
      if (mouth.portal!.pairId !== null) this.configurePortal(mouth.id, null, 'closed')
    for (const mouth of mouths) {
      this.portalEntities.splice(this.portalEntities.indexOf(mouth), 1)
      this.hostedShapes.delete(mouth.id)
    }
    this.detachTrailerJoints(v)
    for (const trailer of this.vehicles.values()) {
      if (trailer.definition.tow?.vehicleId !== id) continue
      this.releaseTrailer(trailer)
    }
    v.raycast.removeFromWorld(this.world)
    if (v.body.world === this.world) this.world.removeBody(v.body)
    this.vehicles.delete(id)
    this.damage.remove(id)
    this.bodies.delete(id)
    this.previousWheels.delete(id)
    this.document.entities = this.document.entities.filter(
      (e) => e.id !== id && !mouths.includes(e),
    )
    this.graph = SceneGraph.fromValidated(this.document)
    this.entitiesById = new Map(this.document.entities.map((e) => [e.id, e]))
  }
  private attachTrailerJoint(trailer: Vehicle): void {
    const tow = trailer.definition.tow
    if (!tow || this.trailerJoints.some((joint) => joint.bodyB === trailer.body)) return
    const tractor = this.vehicles.get(tow.vehicleId)
    if (!tractor) throw new Error('Trailer requires a powered towing vehicle')
    this.setLandingGear(trailer, false)
    this.alignTrailer(trailer, tractor)
    addTrailerJoint(this.world, this.trailerJoints, createTrailerJoint(tractor, trailer))
  }
  private detachTrailerJoints(vehicle: Vehicle): void {
    removeJointsFor(this.world, this.trailerJoints, vehicle)
  }
  private releaseTrailer(trailer: Vehicle): void {
    this.detachTrailerJoints(trailer)
    clearTrailerTow(trailer)
    this.setLandingGear(trailer, true)
    trailer.body.wakeUp()
  }
  private setLandingGear(vehicle: Vehicle, deployed: boolean): void {
    if (!hasLandingGear(vehicle.definition)) return
    if (deployed) {
      if (vehicle.landingGear.length) return
      vehicle.landingGear = addLandingGearShapes(vehicle.body, vehicle.definition)
      return
    }
    if (!vehicle.landingGear.length) return
    removeLandingGearShapes(vehicle.body, vehicle.landingGear)
    vehicle.landingGear = []
  }
  /**
   * Couple `trailerId` to `tractorId`. Omit the trailer to use the nearest hitchable one.
   * Retracts landing legs on the trailer.
   */
  hitchTrailer(tractorId: string, trailerId?: string): string {
    if (this.disposed) throw new Error('Simulation is disposed')
    const tractor = this.vehicles.get(tractorId)
    if (!tractor?.definition.hitch || tractor.definition.passive)
      throw new Error('Hitch requires a powered tractor with a fifth-wheel mount')
    const trailer = trailerId
      ? this.vehicles.get(trailerId)
      : findHitchCandidate(tractor, this.vehicles.values())
    if (!trailer) throw new Error('No free trailer in hitch range')
    if (trailer.entity.id === tractorId) throw new Error('A tractor cannot hitch to itself')
    if (!trailer.definition.passive || !trailer.definition.towAnchor)
      throw new Error('Only a free trailer with a kingpin can be hitched')
    if (trailer.definition.tow) throw new Error(`Trailer ${trailer.entity.id} is already hitched`)
    bindTrailerTow(tractor, trailer)
    this.attachTrailerJoint(trailer)
    return trailer.entity.id
  }
  /** Uncouple a trailer. Omit the id to release every trailer on the occupied tractor. */
  unhitchTrailer(trailerId?: string): string[] {
    if (this.disposed) throw new Error('Simulation is disposed')
    const ids = trailerId
      ? [trailerId]
      : [...this.vehicles.values()]
          .filter((v) => this.vehicleId !== null && trailerTowedBy(v, this.vehicleId))
          .map((v) => v.entity.id)
    const released: string[] = []
    for (const id of ids) {
      const trailer = this.vehicles.get(id)
      if (!trailer?.definition.tow) continue
      this.releaseTrailer(trailer)
      released.push(id)
    }
    return released
  }
  /** Occupied tractor: hitch a nearby free trailer, or uncouple the attached one. */
  toggleHitch(): string | null {
    if (this.disposed) throw new Error('Simulation is disposed')
    const id = this.vehicleId
    if (!id) return null
    const tractor = this.vehicles.get(id)
    if (!tractor?.definition.hitch || tractor.definition.passive) return null
    const attached = [...this.vehicles.values()].find((v) => trailerTowedBy(v, id))
    if (attached) {
      this.releaseTrailer(attached)
      return 'Remolque suelto'
    }
    const trailer = findHitchCandidate(tractor, this.vehicles.values())
    if (!trailer) return 'Acerca el plato al kingpin y detén el camión'
    bindTrailerTow(tractor, trailer)
    this.attachTrailerJoint(trailer)
    return 'Remolque enganchado'
  }
  hitchCandidate(tractorId = this.vehicleId): string | null {
    if (!tractorId) return null
    const tractor = this.vehicles.get(tractorId)
    if (!tractor) return null
    return findHitchCandidate(tractor, this.vehicles.values())?.entity.id ?? null
  }
  private addEntityBody(e: Entity): void {
    const created = createEntityBody(
      e,
      this.graph.worldTransform(e.id),
      this.entitiesById,
      this.solidMaterial,
      this.mapBuildingsEnabled,
    )
    if (!created) return
    const { body, mapBody } = created
    this.bodies.set(e.id, body)
    if (mapBody) this.mapBodies.set(e.id, body)
    if (e.kind === 'vehicle') this.createVehicle(e, body)
    else this.world.addBody(body)
  }

  setMapBuildingsEnabled(enabled: boolean): void {
    this.mapBuildingsEnabled = enabled
    this.mapCollision.invalidate()
    this.preparePlanetCollisions()
    this.installNearbyMapBodies()
    if (enabled)
      for (const e of this.document.entities) {
        if (
          isMapBuilding(e) &&
          e.motion === 'static' &&
          !this.bodies.has(e.id) &&
          !this.deferredMapBodies.has(e.id)
        )
          this.addEntityBody(e)
      }
    this.updateMapCollisions()
  }
  setCollisionDistance(distance: number): void {
    if (!Number.isFinite(distance) || distance < 200 || distance > 2000)
      throw new Error('Collision distance must be 200–2000 m')
    this.collisionDistance = distance
    this.preparePlanetCollisions()
    this.installNearbyMapBodies()
    this.updateMapCollisions()
  }
  get collisionStats() {
    return {
      active: [...this.mapBodies.values()].filter((b) => b.world === this.world).length,
      total: this.document.entities.reduce(
        (count, e) =>
          count + Number(!!e.source && e.motion === 'static' && !e.terrain && !e.portal),
        0,
      ),
    }
  }
  private installNearbyMapBodies(): void {
    if (!this.mapCollision.deferredMapBodies.size) return
    this.mapCollision.install(
      [this.playerBody, ...[...this.vehicles.values()].map((v) => v.body)],
      this.mapBuildingsEnabled,
      this.collisionDistance,
      (e) => this.addEntityBody(e),
    )
  }
  /** Keep terrain, actors and portal colliders. Cull map solids conservatively around every actor. */
  private updateMapCollisions(): void {
    if (!this.mapBodies.size) return
    this.mapCollision.update(
      [this.playerBody, ...[...this.vehicles.values()].map((v) => v.body)],
      this.mapBuildingsEnabled,
      this.collisionDistance,
      this.entitiesById,
    )
  }

  private constrainTerrainBoundary(): void {
    if (!this.terrainGrounds.length) return
    constrainTerrainBoundary(this.terrainGrounds, [
      this.playerBody,
      ...[...this.vehicles.values()].map((v) => v.body),
    ])
  }

  private createVehicle(entity: Entity, body: Body): void {
    const definition = vehicleDefinition(entity)
    const options = { parked: hasGearSelector(definition) }
    const wheeled = definition.twoWheeled
      ? createTwoWheeledVehicle(body, definition, options)
      : createWheeledVehicle(body, definition, options)
    const car = wheeled.raycast
    if (definition.boat) {
      body.linearDamping = 0.01
      body.angularDamping = 0.35
      this.world.addBody(body)
    } else car.addToWorld(this.world)
    const vehicle: Vehicle = {
      ...wheeled,
      entity,
      landingGear: [],
      prop: 0,
      definition,
      flight: null,
      rampClosed: false,
      rampAngle: 0,
      rampTarget: 0,
      rampExtension: 0,
      rampExtensionTarget: 0,
      rampPortalActive: false,
      cruiseSpeed: 1000,
      helm: 'car',
    }
    this.vehicles.set(entity.id, vehicle)
    if (!definition.tow) this.setLandingGear(vehicle, true)
  }
  get player(): PlayerSnapshot {
    const vehicle = this.vehicleId ? this.vehicles.get(this.vehicleId) : undefined
    return {
      position: vec((vehicle?.body ?? this.playerBody).position),
      yaw: this.input.yaw,
      grounded: this.grounded,
      vehicleId: this.vehicleId,
      interiorId: this.interiorId,
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
      riderRight: Number.isFinite(input.riderRight) ? clamp(input.riderRight!, -1, 1) : 0,
      serviceBrake: Number.isFinite(input.serviceBrake) ? clamp(input.serviceBrake!, 0, 1) : 0,
      clutch: Number.isFinite(input.clutch) ? clamp(input.clutch!, 0, 1) : 0,
      selectedGear:
        Number.isInteger(input.selectedGear) &&
        input.selectedGear! >= -1 &&
        input.selectedGear! <= 10
          ? input.selectedGear
          : undefined,
      rearBrake: Number.isFinite(input.rearBrake) ? clamp(input.rearBrake!, 0, 1) : 0,
      riderForward: Number.isFinite(input.riderForward) ? clamp(input.riderForward!, -1, 1) : 0,
    }
    this.jumpPending ||= input.jump && this.footStance === 'standing'
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
  /** Host-provided collision surfaces (for example an XR room), in simulation metres. */
  private externalSurfaces = new Map<string, Body>()
  setExternalCollisionMesh(id: string, vertices: Float32Array | null, indices?: Uint32Array): void {
    const previous = this.externalSurfaces.get(id)
    if (previous) {
      this.world.removeBody(previous)
      this.externalSurfaces.delete(id)
    }
    if (!vertices || !indices) return
    const body = new Body({ mass: 0 })
    body.addShape(new Trimesh(vertices, indices))
    this.world.addBody(body)
    this.externalSurfaces.set(id, body)
  }
  /** Reposition a held assembly atomically; the host pauses stepping while manipulating it. */
  relocateVehicles(poses: { id: string; transform: Transform }[]): void {
    this.relocateEntities(poses)
  }
  /** Relocate ordinary dynamic props and vehicles through their shared Engine bodies. */
  relocateEntities(poses: { id: string; transform: Transform }[]): void {
    // Validate the whole assembly before moving any body. Teleports must preserve the
    // unit-quaternion invariant even while ordinary physics stepping is paused.
    const normalized = poses.map(({ id, transform }) => {
      const length = Math.hypot(...transform.rotation)
      if (
        ![...transform.position, ...transform.rotation].every(Number.isFinite) ||
        !Number.isFinite(length) ||
        length < 1e-12
      )
        throw new Error(`Invalid vehicle relocation: ${id}`)
      return {
        id,
        transform: {
          position: transform.position,
          rotation: transform.rotation.map((value) => value / length) as Transform['rotation'],
        },
      }
    })
    for (const { id, transform } of normalized) {
      const body = this.bodies.get(id)
      const vehicle = this.vehicles.get(id)
      if (!body || body.mass <= 0) continue
      body.position.set(...transform.position)
      body.quaternion.set(...transform.rotation)
      body.previousPosition.copy(body.position)
      body.previousQuaternion.copy(body.quaternion)
      body.velocity.setZero()
      body.angularVelocity.setZero()
      body.wakeUp()
      if (vehicle?.twoWheeled) resetTwoWheeled(vehicle.twoWheeled)
    }
    this.previousWheels.clear()
  }
  /** Release a manipulated rigid assembly into the ordinary physics world. */
  releaseVehicles(motion: { id: string; velocity: Vec3Tuple; angularVelocity: Vec3Tuple }[]): void {
    this.releaseEntities(motion)
  }
  releaseEntities(motion: { id: string; velocity: Vec3Tuple; angularVelocity: Vec3Tuple }[]): void {
    for (const entry of motion)
      if (![...entry.velocity, ...entry.angularVelocity].every(Number.isFinite))
        throw new Error(`Invalid vehicle release: ${entry.id}`)
    for (const entry of motion) {
      const body = this.bodies.get(entry.id)
      if (!body) continue
      body.velocity.set(...entry.velocity)
      body.angularVelocity.set(...entry.angularVelocity)
      body.wakeUp()
    }
  }
  /** Linear velocity in simulation metres/second, shared by scaled XR adapters. */
  entityVelocity(id: string): Vec3Tuple {
    const body = this.bodies.get(id)
    return body ? vec(body.velocity) : [0, 0, 0]
  }
  /** Physical chassis/equipment shapes and the raycast tyres' spherical envelopes.
   * This lets a differently scaled view share contacts with room props without
   * changing its drivetrain, gravity, suspension, or full-size simulation rules.
   */
  entityCollisionParts(id: string): EntityCollisionPart[] {
    const body = this.bodies.get(id)
    if (!body) return []
    const parts: EntityCollisionPart[] = []
    for (let i = 0; i < body.shapes.length; i++) {
      const shape = body.shapes[i]
      if (!shape.collisionResponse || body.colliders[i]?.isEnabled() === false) continue
      const definition: EntityCollisionPart['shape'] | null =
        shape instanceof Box
          ? { kind: 'box', halfExtents: vec(shape.halfExtents) }
          : shape instanceof Sphere
            ? { kind: 'sphere', radius: shape.radius }
            : null
      if (!definition) continue
      const position = body.quaternion.vmult(body.shapeOffsets[i]).vadd(body.position)
      const rotation = body.quaternion.clone().mult(body.shapeOrientations[i])
      parts.push({
        key: `shape-${i}`,
        shape: definition,
        transform: {
          position: vec(position),
          rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
        },
        friction: body.material.friction,
        restitution: body.material.restitution,
      })
    }
    const vehicle = this.vehicles.get(id)
    if (vehicle)
      this.wheelTransforms(id).forEach((transform, i) => {
        parts.push({
          key: `wheel-${i}`,
          shape: { kind: 'sphere', radius: vehicle.raycast.wheelInfos[i].radius },
          transform,
          friction: 0.7,
          restitution: 0.05,
        })
      })
    return parts
  }
  entityTransform(id: string, interpolated = false): Transform {
    const body = this.bodies.get(id)
    if (body) return interpolated ? this.displayedPose(body) : pose(body)
    // Visual descendants follow their physical root using the authored local transform chain.
    const entity = this.entitiesById.get(id)
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
      v.raycast.updateWheelTransform(i)
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

  private wheeledInput(): WheeledInput {
    return {
      throttle: this.input.forward,
      steering: this.input.right,
      serviceBrake: this.input.serviceBrake,
      clutch: this.input.clutch,
      selectedGear: this.input.selectedGear,
      handbrake: this.input.brake,
      launch: this.input.sprint,
      rider: { right: this.input.riderRight ?? 0, forward: this.input.riderForward ?? 0 },
      lever: this.input.frontBrake ?? 0,
      pedal: this.input.rearBrake ?? 0,
    }
  }
  /**
   * Carriageways used to tell asphalt from grass. Pass the same roads the R reset snaps to
   * (OSM navigation roads). Scene roads are always included. Omit or pass nothing to clear
   * the host set. An empty world (no scene roads and no host roads) leaves the surface unknown.
   */
  /** Paved non-road areas (OSM car parks): asphalt grip and black skid marks inside them. */
  setSurfaceAreas(areas?: Iterable<PavedArea> | null): void {
    const next = areas ? [...areas] : []
    const current = this.hostSurfaceAreas
    if (next.length === current.length && next.every((area, i) => area === current[i])) return
    this.hostSurfaceAreas = next
  }
  private hostSurfaceAreas: PavedArea[] = []
  setSurfaceRoads(roads?: Iterable<RoadCenterline> | null): void {
    const next = roads ? [...roads] : []
    const current = this.hostSurfaceRoads
    // Hosts pass a fresh array every frame; keep the current one (and its segment index) when
    // it holds the same roads.
    if (next.length === current.length && next.every((road, i) => road === current[i])) return
    this.hostSurfaceRoads = next
  }
  private surfaceRoads(): RoadCenterline[] {
    const scene = this.roadGuidance.centerlines(
      this.document.entities,
      this.graph,
      this.entitiesById,
    )
    return this.hostSurfaceRoads.length ? scene.concat(this.hostSurfaceRoads) : scene
  }
  /** Segment grid over {@link surfaceRoads}, rebuilt only when the scene or host roads change. */
  private surfaceIndex(): RoadSegmentIndex | null {
    const scene = this.roadGuidance.centerlines(
      this.document.entities,
      this.graph,
      this.entitiesById,
    )
    const cache = this.surfaceIndexCache
    if (cache && cache.scene === scene && cache.host === this.hostSurfaceRoads) return cache.index
    const index = new RoadSegmentIndex(this.surfaceRoads())
    this.surfaceIndexCache = { scene, host: this.hostSurfaceRoads, index }
    return index
  }
  private surfaceIndexCache: {
    scene: RoadCenterline[]
    host: RoadCenterline[]
    index: RoadSegmentIndex
  } | null = null
  private wheelSurfaces(v: {
    raycast: {
      wheelInfos: {
        isInContact: boolean
        raycastResult: { hitPointWorld: { x: number; z: number } }
      }[]
    }
  }): (WheelSurface | null)[] | undefined {
    const roads = this.surfaceIndex()
    const areas = this.hostSurfaceAreas
    if (!roads?.size && !areas.length) return undefined
    return v.raycast.wheelInfos.map((wheel) =>
      wheel.isInContact
        ? classifyWheelSurface(
            wheel.raycastResult.hitPointWorld.x,
            wheel.raycastResult.hitPointWorld.z,
            roads ?? [],
            undefined,
            areas,
          )
        : null,
    )
  }
  /** Contact-derived FFB. Pneumatic trail is an approximation, not a vendor-specific effect. */
  vehicleFeedback(id: string): import('./contracts.js').VehicleFeedback | null {
    const v = this.vehicles.get(id)
    if (!v || v.flight || v.definition.boat || v.twoWheeled) return null
    const controller = v.raycast.controller
    const front = v.definition.rearSteering ? [2, 3] : [0, 1]
    let torque = 0,
      load = 0
    let grounded = false
    for (let i = 0; i < v.raycast.wheelInfos.length; i++) {
      if (!controller?.wheelIsInContact(i)) continue
      grounded = true
      load += controller.wheelSuspensionForce(i) ?? 0
      if (front.includes(i))
        torque -= (((controller.wheelSideImpulse(i) ?? 0) / FIXED_STEP) * 0.06) / 15
    }
    const ground = wheeledTelemetry(v, this.wheeledInput(), id === this.vehicleId)
    return {
      steeringTorqueNm: Number.isFinite(torque) ? torque : 0,
      suspensionLoad: load / Math.max(1, v.body.mass * simulationDefaults.gravity),
      tireSlip: ground.tireSlip,
      grounded,
    }
  }
  /** Per-wheel absolute-world contact snapshots for any tyre effect or diagnostic. */
  wheelContactInfo(
    id: string,
  ): { -readonly [K in keyof WheelContactSnapshot]: WheelContactSnapshot[K] }[] {
    const v = this.vehicles.get(id)
    if (!v) return []
    const contacts = wheelContacts(
      v,
      this.wheeledInput(),
      id === this.vehicleId,
      !v.definition.boat,
    )
    const surfaces = this.wheelSurfaces(v)
    if (!surfaces) return contacts
    return contacts.map((contact, i) => ({ ...contact, surface: surfaces[i] ?? null }))
  }

  step(elapsed: number): void {
    if (this.disposed) throw new Error('Simulation is disposed')
    if (!Number.isFinite(elapsed) || elapsed < 0)
      throw new Error('Elapsed seconds must be finite and nonnegative')
    this.preparePlanetCollisions()
    this.installNearbyMapBodies()
    const accepted = Math.min(elapsed, FIXED_STEP * simulationDefaults.maxSubsteps)
    this.lostTime += elapsed - accepted
    this.accumulator += accepted
    while (this.accumulator + 1e-10 >= FIXED_STEP) {
      this.world.rebase(
        (this.vehicleId ? this.vehicles.get(this.vehicleId)!.body : this.playerBody).position,
      )
      const before = this.portalEntities.length
        ? this.world.bodies
            .filter((b) => b.mass > 0)
            .map((body) => ({ body, position: vec(body.position) }))
        : []
      for (const id of this.vehicles.keys()) this.previousWheels.set(id, this.wheelTransforms(id))
      const mouthBefore = new Map(
        this.portalEntities.map((e) => [e.id, this.entityTransform(e.id)]),
      )
      this.updateInterior()
      const host = this.interiorBody()
      const carry =
        host && !this.vehicleId
          ? {
              local: host.pointToLocalFrame(this.playerBody.position),
              start: this.playerBody.position.clone(),
              rotation: host.quaternion.clone(),
              velocity: new Vec3(),
            }
          : null
      if (carry) host!.getVelocityAtWorldPoint(this.playerBody.position, carry.velocity)
      if (this.ticks % mapCollisionDefaults.activationIntervalTicks === 0)
        this.updateMapCollisions()
      for (const vehicle of this.vehicles.values()) {
        if (vehicle.definition.forklift) {
          let mechanism = this.forklifts.get(vehicle)
          if (!mechanism) {
            mechanism = new ForkliftMechanism(vehicle)
            this.forklifts.set(vehicle, mechanism)
          }
          mechanism.update(
            this.player.vehicleId === vehicle.entity.id ? this.forkliftInput : [0, 0, 0],
            FIXED_STEP,
          )
        }
        this.updateRamp(vehicle, FIXED_STEP)
        if (vehicle.definition.garage?.ramp?.loadAngle !== undefined && vehicle.rampClosed)
          for (const [id, car] of this.vehicles)
            if (!car.definition.passive && this.garage.candidate(id) === vehicle.entity.id)
              this.garage.attach(id, vehicle.entity.id)
      }
      this.beforeTick()
      this.updateCatchFloor()
      const impactVelocities = this.options.vehicleDamage
        ? new Map(this.world.bodies.map((body) => [body, body.velocity.clone()]))
        : null
      this.world.step(FIXED_STEP)
      if (impactVelocities) {
        for (const contact of this.world.contacts) {
          const relative = impactVelocities.get(contact.bi)!.vsub(impactVelocities.get(contact.bj)!)
          const speed = Math.abs(relative.dot(contact.ni))
          for (const [id, vehicle] of this.vehicles) {
            if (vehicle.definition.passive) continue
            if (vehicle.body === contact.bi || vehicle.body === contact.bj)
              this.damage.impact(
                id,
                vehicle.body === contact.bi ? contact.bj.id : contact.bi.id,
                speed,
                this.ticks * FIXED_STEP,
              )
          }
        }
        this.resolveExplosions('impact')
      }
      for (let i = this.trailerJoints.length - 1; i >= 0; i--) {
        const joint = this.trailerJoints[i]
        const driver = this.vehicleId ? this.vehicles.get(this.vehicleId) : undefined
        if (
          !this.towOverload.step(
            this.world,
            joint,
            driver?.body === joint.bodyA && this.input.forward < 0,
            FIXED_STEP,
          )
        )
          continue
        this.world.removeConstraint(joint)
        this.trailerJoints.splice(i, 1)
        for (const trailer of this.vehicles.values())
          if (trailer.body === joint.bodyB) this.releaseTrailer(trailer)
      }
      this.constrainTerrainBoundary()
      if (carry && host) {
        const relative = this.playerBody.position
          .vsub(carry.start)
          .vsub(carry.velocity.scale(FIXED_STEP))
        carry.local.vadd(carry.rotation.inverse().vmult(relative), carry.local)
        this.playerBody.position.copy(host.pointToWorldFrame(carry.local))
        this.playerBody.quaternion.copy(host.quaternion)
        this.playerBody.aabbNeedsUpdate = true
      }
      this.crossPortals(before, mouthBefore)
      this.updateInterior()
      this.updateGrounded()
      this.stepGentleRecovery()
      this.accumulator -= FIXED_STEP
      this.ticks++
    }
  }
  private crossPortals(
    previous: { body: Body; position: Vec3Tuple }[],
    beforeMouths: Map<string, Transform>,
  ): void {
    if (!this.portalEntities.length) return
    this.portalTraversal.cross(previous, beforeMouths, {
      portals: this.portalEntities,
      bodies: this.bodies,
      vehicles: this.vehicles,
      world: this.world,
      playerBody: this.playerBody,
      input: this.input,
      activeVehicle: this.vehicleId,
      transform: (id) => this.entityTransform(id),
      interiorBody: () => this.interiorBody(),
      setInteriorId: (id) => {
        this.interiorId = id
      },
      isDocked: (id) =>
        this.docks.has(id) || [...this.docks.values()].some((d) => d.carrierId === id),
      exitBlocked: (body, position, quaternion, destination) =>
        this.portalExitBlocked(body, position, quaternion, destination),
      refreshCollisions: () => this.updateMapCollisions(),
      clearWheelHistory: (id) => {
        this.previousWheels.delete(id)
        // The velocity is now in the exit's frame: not an impact.
        const twoWheeled = this.vehicles.get(id)?.twoWheeled
        if (twoWheeled) twoWheeled.previousVelocity = null
      },
    })
  }

  private portalExitBlocked(
    body: Body,
    position: Vector3,
    quaternion: RenderQuaternion,
    destination: Entity,
  ): boolean {
    const map = [...this.mapBodies]
      .filter(([id]) => this.mapBuildingsEnabled || !isMapBuilding(this.entitiesById.get(id)))
      .map(([, body]) => body)
    return portalExitBlocked(body, position, quaternion, destination, [
      ...this.world.bodies,
      ...map,
    ])
  }
  private footStance: 'standing' | 'crouching' | 'prone' = 'standing'
  get stance(): 'standing' | 'crouching' | 'prone' {
    return this.footStance
  }
  get eyeOffset(): number {
    return this.footStance === 'standing' ? 0.75 : this.footStance === 'crouching' ? 0.4 : 0.15
  }
  setStance(next: 'standing' | 'crouching' | 'prone'): void {
    if (this.vehicleId || next === this.footStance) return
    const oldHalf = this.playerHalfHeight
    this.footStance = next
    const half = this.playerHalfHeight
    this.playerBody.removeShape(this.playerBody.shapes[0])
    this.playerBody.addShape(new Box(new Vec3(PLAYER_RADIUS, half, PLAYER_RADIUS)))
    this.playerBody.position.vadd(
      this.radialUp(this.playerBody).scale(half - oldHalf),
      this.playerBody.position,
    )
    this.playerBody.previousPosition.copy(this.playerBody.position)
    this.playerBody.updateMassProperties()
    this.playerBody.updateBoundingRadius()
    this.playerBody.aabbNeedsUpdate = true
    this.playerBody.wakeUp()
    this.jumpPending = false
  }
  private get playerHalfHeight(): number {
    return this.footStance === 'prone'
      ? 0.2
      : this.footStance === 'crouching'
        ? 0.5
        : this.options.playerMode === 'hover'
          ? 0.28
          : PLAYER_HALF_HEIGHT
  }

  get playerFrame(): Transform | null {
    return this.interiorId ? this.entityTransform(this.interiorId, true) : null
  }
  private interiorBody(): Body | null {
    return this.interiorId ? (this.vehicles.get(this.interiorId)?.body ?? null) : null
  }
  private setInterior(id: string | null): void {
    if (id === this.interiorId) return
    const old = this.interiorBody()?.quaternion ?? new Quaternion()
    const forward = old.vmult(new Vec3(-Math.sin(this.input.yaw), 0, -Math.cos(this.input.yaw)))
    this.interiorId = id
    const next = this.interiorBody()?.quaternion ?? new Quaternion()
    const local = next.inverse().vmult(forward)
    this.input.yaw = Math.atan2(-local.x, -local.z)
    this.playerBody.quaternion.copy(next)
    this.playerBody.previousQuaternion.copy(next)
  }
  private updateInterior(): void {
    if (this.vehicleId) return
    const inside = (v: Vehicle, margin = 0) => {
      const bounds = v.definition.interior
      if (!bounds) return false
      const p = vec(v.body.pointToLocalFrame(this.playerBody.position))
      return p.every((n, i) => n > bounds.min[i] - margin - 0.2 && n < bounds.max[i] + margin + 0.2)
    }
    const current = this.interiorId ? this.vehicles.get(this.interiorId) : null
    if (current && inside(current, 0.2)) return
    this.setInterior(
      [...this.vehicles.values()].find((v) => v.definition.interior && inside(v))?.entity.id ??
        null,
    )
  }

  /** Gravity outside the cushion; predictive braking above the supporting surface. */
  private hover(): void {
    const body = this.playerBody,
      host = this.interiorBody()
    const up = host ? host.quaternion.vmult(new Vec3(0, 1, 0)) : new Vec3(0, 1, 0)
    const platformVelocity = new Vec3()
    host?.getVelocityAtWorldPoint(body.position, platformVelocity)
    const vertical = body.velocity.vsub(platformVelocity).dot(up)
    let distance = Infinity
    const sensor = Math.max(3, Math.min(300, (vertical * vertical) / 50 + 2))
    this.world.raycastAll(
      body.position,
      body.position.vsub(up.scale(sensor)),
      { skipBackfaces: true },
      (hit) => {
        if (hit.body !== body && hit.hitNormalWorld.dot(up) > 0.5)
          distance = Math.min(distance, hit.distance)
      },
    )
    if (this.hoverJumpTime > 0) this.hoverJumpTime -= FIXED_STEP
    if (this.jumpPending && this.hoverJumpTime <= 0 && distance < 1.65 && Math.abs(vertical) < 1) {
      body.velocity.vadd(up.scale(5.5 - vertical), body.velocity)
      this.hoverJumpTime = 0.45
      return
    }
    if (this.hoverJumpTime > 0 || !Number.isFinite(distance)) return
    // Normal gravity brings the monitor back down; the cushion brakes a fall before impact.
    if (distance <= 1.7 || (vertical < -1 && distance < (vertical * vertical) / 50 + 1.4)) {
      const braking =
        vertical < -1 ? (vertical * vertical) / (2 * Math.max(0.1, distance - 1.25)) : -Infinity
      const acceleration = clamp(
        Math.max((1.25 - distance) * 45 - vertical * 12, braking),
        -simulationDefaults.gravity,
        70,
      )
      body.applyForce(up.scale(body.mass * (simulationDefaults.gravity + acceleration)))
    }
  }

  /** Ambient-light probe ignores the complete vehicle assembly, including trailers and hosted parts. */
  vehicleSunOccluded(id: string, direction: Vec3Tuple, range = 200): boolean {
    const vehicle = this.vehicles.get(id)
    if (!vehicle || !direction.every(Number.isFinite) || !Number.isFinite(range) || range <= 0)
      return false
    const ray = new Vec3(...direction)
    if (ray.length() < 0.001) return false
    ray.normalize()
    const owned = new Set([id])
    for (const [otherId, other] of this.vehicles)
      if (other.definition.tow?.vehicleId === id) owned.add(otherId)
    let changed = true
    while (changed) {
      changed = false
      for (const entity of this.entitiesById.values())
        if (entity.parentId && owned.has(entity.parentId) && !owned.has(entity.id)) {
          owned.add(entity.id)
          changed = true
        }
    }
    const ignored = new Set([this.playerBody, vehicle.body])
    for (const ownId of owned) {
      const body = this.bodies.get(ownId)
      if (body) ignored.add(body)
    }
    const from = vehicle.body
      .pointToWorldFrame(new Vec3(...vehicle.definition.driver))
      .vadd(this.radialUp(vehicle.body).scale(0.4))
    let blocked = false
    this.world.raycastAll(
      from,
      from.vadd(ray.scale(Math.min(range, 1000))),
      { skipBackfaces: true },
      (hit) => {
        if (hit.body && !ignored.has(hit.body)) blocked = true
      },
    )
    return blocked
  }

  /** Hitscan against physical solids. Shots stop at the first obstruction. */
  shoot(
    origin: Vec3Tuple,
    direction: Vec3Tuple,
    range = 150,
    impulse = 12,
    excludeEntityId?: string,
  ): {
    point: Vec3Tuple
    normal: Vec3Tuple
    entityId: string | null
    /** What the hit body presents to a shot (scenery layers tag their poles); null when untagged. */
    surface: ImpactSurface | null
  } | null {
    const ray = new Vec3(...direction)
    if (
      !Number.isFinite(range) ||
      range <= 0 ||
      !origin.every(Number.isFinite) ||
      !direction.every(Number.isFinite) ||
      ray.length() < 0.001
    )
      return null
    ray.normalize()
    const from = new Vec3(...origin),
      to = from.vadd(ray.scale(Math.min(range, 1000)))
    let nearest = Infinity
    let point: Vec3 | null = null
    let normal = new Vec3()
    let body: Body | null = null
    const occupiedBody = this.vehicleId ? this.vehicles.get(this.vehicleId)?.body : null
    this.world.raycastAll(from, to, { skipBackfaces: true }, (hit) => {
      if (
        hit.body !== this.playerBody &&
        hit.body !== occupiedBody &&
        hit.body !== (excludeEntityId ? this.bodies.get(excludeEntityId) : undefined) &&
        hit.distance < nearest
      ) {
        nearest = hit.distance
        point = hit.hitPointWorld.clone()
        normal = hit.hitNormalWorld.clone()
        body = hit.body
      }
    })
    if (!point || !body) return null
    const target = body as Body,
      impact = point as Vec3
    if (target.mass > 0 && Number.isFinite(impulse) && impulse > 0) {
      target.wakeUp()
      target.applyImpulse(ray.scale(Math.min(impulse, 50)), impact.vsub(target.position))
    }
    return {
      point: vec(impact),
      normal: vec(normal),
      entityId: [...this.bodies].find(([, value]) => value === target)?.[0] ?? null,
      surface: this.bodySurfaces.get(target) ?? null,
    }
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
            -radial.x * simulationDefaults.gravity * body.mass,
            (1 - radial.y) * simulationDefaults.gravity * body.mass,
            -radial.z * simulationDefaults.gravity * body.mass,
          ),
        )
      }
    const interior = this.interiorBody()
    if (interior && !this.vehicleId) {
      const up = interior.quaternion.vmult(new Vec3(0, 1, 0))
      const gravityUp = this.document.geography ? this.radialUp(this.playerBody) : new Vec3(0, 1, 0)
      this.playerBody.applyForce(
        gravityUp.vsub(up).scale(simulationDefaults.gravity * this.playerBody.mass),
      )
      this.playerBody.quaternion.copy(interior.quaternion)
    }
    const drivingInput = this.wheeledInput()
    for (const [id, v] of this.vehicles) {
      if (this.damage.destroyed(id)) {
        v.helm = 'off'
        v.drivetrain.ignition = 'running'
        v.drivetrain.rpm = v.drivetrain.force = v.drivetrain.load = 0
        for (let wheel = 0; wheel < v.raycast.wheelInfos.length; wheel++) {
          v.raycast.applyEngineForce(0, wheel)
          v.raycast.setBrake(0, wheel)
        }
        continue
      }
      const dock = this.docks.get(id)
      syncWheeledDamping(
        v,
        dock ? (this.vehicles.get(dock.carrierId)?.body.linearDamping ?? 0.05) : undefined,
      )
      if (dock) {
        if (v.twoWheeled) v.twoWheeled.previousVelocity = null
        continue
      }
      const active = id === this.vehicleId || v.definition.tow?.vehicleId === this.vehicleId
      if (v.definition.plane) this.spoolEngine(v, active)
      if (v.flight) {
        this.fly(v, active)
        continue
      }
      if (v.definition.boat) {
        this.pilotBoat(v, active)
        continue
      }
      if (v.twoWheeled) {
        if (
          this.bikeMountHold?.vehicleId === id ||
          (this.gentleRecovery?.vehicleId === id && this.gentleRecovery.phase === 'lifting')
        )
          continue
        stepTwoWheeledVehicle(
          v as TwoWheeledVehicle,
          drivingInput,
          FIXED_STEP,
          active,
          v.helm !== 'off',
          this.radialUp(v.body),
          simulationDefaults.gravity,
          this.wheelSurfaces(v),
        )
        if (v.twoWheeled.ejectPending) {
          v.twoWheeled.ejectPending = false
          if (id === this.vehicleId) this.ejectRider(v)
        }
        if (!v.twoWheeled.fallen || id !== this.vehicleId) this.fallRest.delete(id)
        else {
          // Terrain contacts can keep a tipped chassis gently rocking or sliding.
          // Treat that as settled enough to hold it while the rider lifts it.
          const tryingToRide =
            Math.abs(drivingInput.throttle) > 0.01 ||
            Math.abs(drivingInput.steering) > 0.01 ||
            drivingInput.handbrake ||
            (drivingInput.lever ?? 0) > 0.01
          const resting =
            !tryingToRide && v.body.velocity.length() < 1.5 && v.body.angularVelocity.length() < 2
          const seconds = resting ? (this.fallRest.get(id) ?? 0) + FIXED_STEP : 0
          this.fallRest.set(id, seconds)
          if (seconds >= 0.45) this.beginGentleRecovery(v)
        }
        continue
      }
      stepWheeledVehicle(
        v,
        drivingInput,
        FIXED_STEP,
        active,
        v.helm !== 'off',
        this.wheelSurfaces(v),
      )
      if (active && this.roadGuidance.enabled)
        this.roadGuidance.apply(
          v,
          this.input.right,
          this.document.entities,
          this.graph,
          this.entitiesById,
        )
    }
    if (!this.vehicleId && this.ejection) this.stepEjection()
    else if (!this.vehicleId && !this.gentleRecovery) {
      let x = this.input.right,
        z = this.input.forward
      const len = Math.hypot(x, z)
      if (len > 1) {
        x /= len
        z /= len
      }
      const speed =
        this.footStance === 'prone'
          ? 1
          : this.footStance === 'crouching'
            ? 2
            : this.input.sprint
              ? simulationDefaults.sprintSpeed
              : simulationDefaults.walkSpeed
      const c = Math.cos(this.input.yaw),
        s = Math.sin(this.input.yaw)
      const platformVelocity = new Vec3()
      const host = this.interiorBody()
      ;(host ?? this.support)?.getVelocityAtWorldPoint(this.playerBody.position, platformVelocity)
      const frame = host?.quaternion ?? new Quaternion()
      const relative = frame.inverse().vmult(this.playerBody.velocity.vsub(platformVelocity))
      const targetX = (x * c - z * s) * speed,
        targetZ = (-x * s - z * c) * speed
      const accel =
        (this.grounded || this.options.playerMode === 'hover'
          ? simulationDefaults.groundAcceleration
          : simulationDefaults.airAcceleration) * FIXED_STEP
      relative.x += clamp(targetX - relative.x, -accel, accel)
      relative.z += clamp(targetZ - relative.z, -accel, accel)
      frame.vmult(relative).vadd(platformVelocity, this.playerBody.velocity)
      if (this.options.playerMode === 'hover') this.hover()
      if (this.options.playerMode !== 'hover' && this.jumpPending && this.grounded)
        this.playerBody.velocity.y = simulationDefaults.jumpSpeed
      this.playerBody.wakeUp()
    }
    this.jumpPending = false
  }

  /**
   * Throw the rider off a crashed two-wheeler: from just above the driver point, with most of the
   * machine's velocity from just before the crash and a hop. The player is on foot from now on, without control until
   * `stepEjection` has them back up.
   */
  private ejectRider(v: Vehicle): void {
    const up = this.radialUp(v.body)
    const start = v.twoWheeled
      ? v.body
          .pointToWorldFrame(new Vec3(...v.definition.driver))
          .vadd(up.scale(ejectionDefaults.clearance))
      : v.body.position.vadd(up.scale(v.entity.size[1] / 2 + this.playerHalfHeight + 0.5))
    this.playerBody.position.copy(start)
    this.playerBody.previousPosition.copy(start)
    this.playerBody.velocity.copy(
      (v.twoWheeled ? new Vec3(...v.twoWheeled.recentVelocity) : v.body.velocity.clone())
        .scale(ejectionDefaults.carry)
        .vadd(up.scale(ejectionDefaults.hop)),
    )
    this.playerBody.angularVelocity.setZero()
    this.playerBody.aabbNeedsUpdate = true
    this.world.addBody(this.playerBody)
    this.playerBody.wakeUp()
    this.vehicleId = null
    this.grounded = false
    this.hoverJumpTime = 0
    this.ejection = startEjection(v.entity.id, v.twoWheeled?.crashSpeed ?? v.body.velocity.length())
  }
  /**
   * One tick of a thrown rider: no input and no hover cushion while flying and sliding (plain
   * gravity, ground friction once down), the cushion back on while getting up.
   */
  private stepEjection(): void {
    const body = this.playerBody
    const vehicleId = this.ejection!.vehicleId
    if (this.ejection!.elapsed > 1.5 && body.velocity.length() < 0.4 && this.liftNearbyBike())
      return
    const up = this.radialUp(body)
    const vertical = body.velocity.dot(up)
    const horizontal = body.velocity.vsub(up.scale(vertical))
    let groundSpeed = horizontal.length()
    if (this.ejection!.phase === 'down' && this.grounded && groundSpeed > 0) {
      const left = slideSpeed(groundSpeed, simulationDefaults.gravity, FIXED_STEP)
      horizontal.scale(left / groundSpeed).vadd(up.scale(vertical), body.velocity)
      groundSpeed = left
    }
    this.ejection = stepEjection(
      this.ejection!,
      this.grounded,
      body.velocity.length(),
      groundSpeed,
      FIXED_STEP,
    )
    if (this.ejection?.phase !== 'flying' && this.ejection?.phase !== 'down')
      if (this.options.playerMode === 'hover') this.hover()
    body.wakeUp()
    if (!this.ejection && !this.gentleRecovery && this.nearestVehicle() === vehicleId) {
      const bike = this.vehicles.get(vehicleId)
      if (bike?.twoWheeled?.fallen) this.beginGentleRecovery(bike, true)
    }
  }

  private radialUp(body: Body): Vec3 {
    if (!this.document.geography) return new Vec3(0, 1, 0)
    const p = body.position.vadd(new Vec3(0, EARTH_RADIUS + this.document.geography.altitude, 0))
    p.normalize()
    return p
  }
  /** Resume an in-place lift beside a stationary fallen bike, including a stuck grounded rider. */
  liftNearbyBike(): boolean {
    if (this.gentleRecovery) return true
    const id = this.vehicleId ?? this.ejection?.vehicleId ?? this.nearestVehicle()
    const bike = id ? this.vehicles.get(id) : undefined
    if (
      !bike?.twoWheeled ||
      !(bike.twoWheeled.fallen || bike.twoWheeled.crashed) ||
      bike.body.velocity.length() > 1.5 ||
      (!this.vehicleId && this.playerBody.velocity.length() > 0.6)
    )
      return false
    if (!this.vehicleId) {
      const from = this.playerBody.position.clone()
      // Keep the reach ray above the terrain even when the fallen helmet is partly buried.
      from.y = Math.max(from.y, bike.body.position.y + 0.5)
      const target = this.hullPoint(bike, from)
      target.y = Math.max(target.y, from.y)
      if (from.distanceTo(target) > 2.75 || this.hullBlocked(bike, from, target)) return false
    }
    return this.beginGentleRecovery(bike, !this.vehicleId)
  }
  /** Supported, clear footing beside a slow fallen bike; no recovery over a drop or through a wall. */
  private beginGentleRecovery(v: Vehicle, pickingUp = false): boolean {
    if (this.damage.destroyed(v.entity.id)) return false
    if (this.gentleRecovery || !v.twoWheeled || (!pickingUp && this.vehicleId !== v.entity.id))
      return false
    const up = this.radialUp(v.body)
    if (up.y < 0.98) return false // Keep planetary recovery near the local upright frame.
    const forward = v.body.quaternion.vmult(new Vec3(0, 0, -1))
    forward.y = 0
    if (forward.lengthSquared() < 0.01) {
      const right = v.body.quaternion.vmult(new Vec3(1, 0, 0))
      right.y = 0
      up.cross(right, forward)
    }
    if (forward.lengthSquared() < 0.01) return false
    forward.normalize()
    const yaw = Math.atan2(-forward.x, -forward.z)
    const upright = new Quaternion().setFromAxisAngle(up, yaw)
    const candidates = [-1, 1].map((side) =>
      v.body.position.vadd(upright.vmult(new Vec3(side * (v.entity.size[0] / 2 + 0.8), 0, 0))),
    )
    if (pickingUp) candidates.unshift(this.playerBody.position.clone())
    for (const candidate of candidates) {
      let support = -Infinity
      this.world.raycastAll(
        new Vec3(candidate.x, candidate.y + 1, candidate.z),
        new Vec3(candidate.x, candidate.y - 2, candidate.z),
        { skipBackfaces: true },
        (hit) => {
          if (hit.body !== v.body && hit.body !== this.playerBody && hit.hitNormalWorld.y > 0.6)
            support = Math.max(support, hit.hitPointWorld.y)
        },
      )
      if (!Number.isFinite(support)) continue
      candidate.y = support + this.playerHalfHeight + 0.04
      const half = new Vec3(PLAYER_RADIUS, this.playerHalfHeight, PLAYER_RADIUS)
      if (
        this.overlapsBody(
          new AABB({ lowerBound: candidate.vsub(half), upperBound: candidate.vadd(half) }),
        )
      )
        continue
      this.placeOnFoot(candidate)
      this.input.yaw = Math.atan2(candidate.x - v.body.position.x, candidate.z - v.body.position.z)
      this.ejection = pickingUp ? null : { ...startEjection(v.entity.id, 0), phase: 'rising' }
      this.gentleRecovery = {
        vehicleId: v.entity.id,
        phase: 'rising',
        elapsed: 0,
        to: upright,
        riderPosition: this.playerBody.position.clone(),
      }
      return true
    }
    return false
  }
  /** Ease the actual chassis upright at the same spot, then put the recovered rider back in the seat. */
  private stepGentleRecovery(): void {
    const hold = this.bikeMountHold
    if (hold) {
      const bike = this.vehicles.get(hold.vehicleId)
      if (!bike || this.vehicleId !== hold.vehicleId) this.bikeMountHold = null
      else {
        bike.body.position.copy(hold.position)
        bike.body.quaternion.copy(hold.rotation)
        bike.body.previousPosition.copy(hold.position)
        bike.body.previousQuaternion.copy(hold.rotation)
        bike.body.velocity.setZero()
        bike.body.angularVelocity.setZero()
        bike.body.torque.setZero()
        bike.body.aabbNeedsUpdate = true
        hold.elapsed += FIXED_STEP
        if (hold.elapsed >= 0.85) this.bikeMountHold = null
      }
      return
    }
    const r = this.gentleRecovery
    if (!r) return
    const v = this.vehicles.get(r.vehicleId)
    if (
      !v?.twoWheeled ||
      this.vehicleId ||
      this.playerBody.position.distanceTo(v.body.position) > 4
    ) {
      this.gentleRecovery = null
      return
    }
    // Getting off can carry a little chassis velocity. Keep the rider's footing through
    // the rise and lift instead of letting that momentum drift them away from the bike.
    this.playerBody.position.x = r.riderPosition.x
    this.playerBody.position.z = r.riderPosition.z
    this.playerBody.velocity.x = 0
    this.playerBody.velocity.z = 0
    this.playerBody.aabbNeedsUpdate = true
    if (r.phase === 'rising') {
      if (this.ejection) return
      const ground = this.groundUnder(v.body.position.x, v.body.position.z, v.body.position.y)
      if (ground === null || Math.abs(ground - v.body.position.y) > 2) {
        this.gentleRecovery = null
        return
      }
      r.phase = 'lifting'
      r.elapsed = 0
      r.from = v.body.quaternion.clone()
      r.position = v.body.position.clone()
      r.targetY =
        ground +
        Math.max(
          ...v.definition.hubs.map(
            (h, i) =>
              (i === 0 ? v.definition.wheelRadius : v.twoWheeled!.geometry.rearWheelRadius) - h[1],
          ),
        ) +
        0.04
    }
    r.elapsed += FIXED_STEP
    const t = Math.min(1, r.elapsed / 1.7),
      blend = t * t * (3 - 2 * t)
    const from = r.from!,
      to = r.to!
    const sign = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w < 0 ? -1 : 1
    v.body.quaternion
      .set(
        from.x * (1 - blend) + to.x * sign * blend,
        from.y * (1 - blend) + to.y * sign * blend,
        from.z * (1 - blend) + to.z * sign * blend,
        from.w * (1 - blend) + to.w * sign * blend,
      )
      .normalize()
    v.body.position.set(
      r.position!.x,
      r.position!.y + (r.targetY! - r.position!.y) * blend,
      r.position!.z,
    )
    v.body.velocity.setZero()
    v.body.angularVelocity.setZero()
    v.body.aabbNeedsUpdate = true
    v.body.wakeUp()
    this.playerBody.velocity.setZero()
    if (this.options.playerMode === 'hover') this.hover()
    if (t === 1) {
      resetTwoWheeled(v.twoWheeled)
      this.fallRest.delete(r.vehicleId)
      this.gentleRecovery = null
      this.startInVehicle(r.vehicleId)
      this.bikeMountHold = {
        vehicleId: r.vehicleId,
        elapsed: 0,
        position: v.body.position.clone(),
        rotation: v.body.quaternion.clone(),
      }
    }
  }
  private height(body: Body): number {
    return this.altitude(body.position)
  }
  private altitude(point: Vec3): number {
    const geo = this.document.geography
    return geo
      ? point.vadd(new Vec3(0, EARTH_RADIUS + geo.altitude, 0)).length() -
          EARTH_RADIUS -
          geo.altitude
      : point.y
  }
  /** Flat slab 30 m under the sea. Tracks the occupied body so a hole cannot drop it forever. */
  private updateCatchFloor(): void {
    const geo = this.document.geography
    if (geo)
      this.fallbackFloor.update(
        geo,
        this.vehicleId
          ? this.vehicles.get(this.vehicleId)!.body
          : (this.interiorBody() ?? this.playerBody),
        this.waterLevel,
      )
  }

  /** 0 is stopped, 1 is full prop. Idles while occupied and windmills in the slipstream. */
  private spoolEngine(v: Vehicle, active: boolean): void {
    const running = active && v.helm !== 'off'
    const throttle = running
      ? v.flight
        ? Math.max(0, this.input.lift ?? 0)
        : Math.abs(this.input.forward)
      : 0
    const wind = clamp(v.body.velocity.length() / 55, 0, 0.35)
    const target = running ? 0.22 + Math.min(1, throttle) * 0.78 : wind
    const rate = target > v.prop ? 0.7 : 0.28
    v.prop += clamp(target - v.prop, -FIXED_STEP * rate, FIXED_STEP * rate)
  }
  /**
   * 400 CV on a 6 m planing hull. Thrust is applied at the stern, along the
   * outboard, so the boat pivots and the stern steps out. The helm and the
   * prop both lag the stick.
   */
  private pilotBoat(v: Vehicle, active: boolean): void {
    stepBoatInWater(
      v,
      this.input,
      {
        sample: (keel, body) => ({
          up: this.radialUp(body),
          depth: this.waterLevel - (this.document.geography?.altitude ?? 0) - this.altitude(keel),
        }),
      },
      FIXED_STEP,
      active,
    )
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
    v.helm = 'drone'
    return 'Modo vuelo · stick izquierdo: altura y giro · derecho: inclinación'
  }

  relocateVehicle(id: string, latitude: number, longitude: number): string {
    const v = this.vehicles.get(id)
    const geo = this.document.geography
    if (!v || !geo) return 'Sin planeta'
    const here = localToGeo(geo, [v.body.position.x, v.body.position.y, v.body.position.z])
    const next = geoToLocal(geo, {
      latitude,
      longitude,
      altitude: Math.max(here.altitude, 15),
    })
    const delta = new Vec3(...next).vsub(v.body.position)
    v.body.position.set(...next)
    v.body.previousPosition.copy(v.body.position)
    v.body.interpolatedPosition.copy(v.body.position)
    v.body.velocity.setZero()
    v.body.angularVelocity.setZero()
    v.body.wakeUp()
    if (v.twoWheeled) v.twoWheeled.previousVelocity = null
    // Someone standing in the cabin travels with the ship instead of being left behind.
    if (this.interiorId === id && !this.vehicleId) {
      this.playerBody.position.vadd(delta, this.playerBody.position)
      this.playerBody.previousPosition.copy(this.playerBody.position)
      this.playerBody.interpolatedPosition.copy(this.playerBody.position)
      this.playerBody.velocity.setZero()
    }
    return 'En destino'
  }

  /**
   * Upright the occupied car and drop it from 3 m. Keeps yaw and the XZ spot by default.
   * With `snapToRoad`, it first moves to the closest point of the nearest road centreline
   * (scene roads plus host-supplied `roads`, e.g. OSM navigation roads) within
   * `maxRoadDistance` metres, facing along the road in the direction closest to the old heading.
   * Flying craft in flight and boats never snap; no road or no ground under it keeps the spot.
   */
  recoverVehicle(options: RecoverVehicleOptions = {}): string {
    this.bikeMountHold = null
    const id = this.vehicleId
    const v = id ? this.vehicles.get(id) : undefined
    if (!v) return 'Monta en un coche'
    if (this.damage.destroyed(id!)) return 'Vehículo destruido'
    if (this.docks.has(id!)) return 'Desengancha antes de enderezar'
    const up = new Vec3(0, 1, 0)
    let forward = v.body.quaternion.vmult(new Vec3(0, 0, -1))
    forward = forward.vsub(up.scale(forward.dot(up)))
    if (forward.lengthSquared() < 1e-4) {
      const right = v.body.quaternion.vmult(new Vec3(1, 0, 0))
      forward = up.cross(right).negate()
    }
    forward.normalize()
    const dry = (x: number, y: number, z: number) =>
      !this.document.geography ||
      this.altitude(new Vec3(x, y, z)) + this.document.geography.altitude > this.waterLevel + 0.05
    let snapped: { x: number; y: number; z: number } | null = null
    let roadMissing = false
    if (options.snapToRoad && !v.flight && !v.definition.boat) {
      const road = nearestRoadPoint(
        v.body.position.x,
        v.body.position.z,
        [
          ...(options.roads ?? []),
          ...this.roadGuidance.centerlines(this.document.entities, this.graph, this.entitiesById),
        ],
        options.maxRoadDistance ?? ROAD_SNAP_MAX_DISTANCE,
        (candidate) => {
          const y = this.groundUnder(candidate.x, candidate.z, v.body.position.y, true)
          if (y === null || !dry(candidate.x, y, candidate.z)) return false
          // Check a footprint, not just a centre point at the edge of a loaded tile.
          for (const along of [-2, 2])
            for (const across of [-1, 1]) {
              const support = this.groundUnder(
                candidate.x + candidate.dx * along - candidate.dz * across,
                candidate.z + candidate.dz * along + candidate.dx * across,
                y,
                true,
              )
              if (support === null || Math.abs(support - y) > 1.5) return false
            }
          return true
        },
      )
      const ground = road ? this.groundUnder(road.x, road.z, v.body.position.y, true) : null
      if (road && ground !== null) {
        // Face along the road, keeping whichever direction is closer to the old heading.
        const sign = road.dx * forward.x + road.dz * forward.z < 0 ? -1 : 1
        forward = new Vec3(road.dx * sign, 0, road.dz * sign)
        snapped = { x: road.x, y: ground, z: road.z }
      } else roadMissing = true
    }
    const localGround = roadMissing
      ? this.groundUnder(v.body.position.x, v.body.position.z, v.body.position.y, true)
      : null
    if (
      roadMissing &&
      (localGround === null || !dry(v.body.position.x, localGround, v.body.position.z))
    )
      return 'No hay una vía seca con suelo cargado cerca'
    v.body.quaternion.setFromAxisAngle(up, Math.atan2(-forward.x, -forward.z))
    v.body.previousQuaternion.copy(v.body.quaternion)
    if (snapped) v.body.position.set(snapped.x, snapped.y + 3, snapped.z)
    else if (localGround !== null) v.body.position.y = localGround + 3
    else v.body.position.y += 3
    v.body.previousPosition.copy(v.body.position)
    v.body.interpolatedPosition.copy(v.body.position)
    v.body.velocity.setZero()
    v.body.angularVelocity.setZero()
    v.body.wakeUp()
    if (v.twoWheeled) resetTwoWheeled(v.twoWheeled)
    for (const trailer of this.vehicles.values()) {
      if (trailer.definition.tow?.vehicleId === id) this.alignTrailer(trailer, v)
    }
    if (snapped) return 'En la vía más cercana'
    return roadMissing ? 'Sin vía cerca · coche enderezado' : 'Coche enderezado'
  }
  /**
   * Highest static, upward-facing surface at (x, z) within ±600 m of `nearY`, ignoring
   * vehicles; null where no collision is loaded.
   */
  private groundUnder(x: number, z: number, nearY: number, allLoaded = false): number | null {
    const vehicleBodies = new Set<Body>([...this.vehicles.values()].map((v) => v.body))
    let best: number | null = null
    let top = nearY + 600,
      bottom = nearY - 600
    if (allLoaded) {
      // A fallen car can be thousands of metres below the map. Search the actual
      // loaded collision bounds instead of a ray centred on its fallen height.
      for (const body of this.world.bodies) {
        if (body.mass !== 0 || vehicleBodies.has(body) || this.fallbackFloor.owns(body)) continue
        if (body.aabbNeedsUpdate) body.updateAABB()
        const { lowerBound: lo, upperBound: hi } = body.aabb
        if (x < lo.x || x > hi.x || z < lo.z || z > hi.z) continue
        if (Number.isFinite(hi.y) && Math.abs(hi.y) < 1e7) top = Math.max(top, hi.y + 1)
        if (Number.isFinite(lo.y) && Math.abs(lo.y) < 1e7) bottom = Math.min(bottom, lo.y - 1)
      }
    }
    this.world.raycastAll(
      new Vec3(x, top, z),
      new Vec3(x, bottom, z),
      { skipBackfaces: true },
      (hit) => {
        if (!hit.body || hit.body.mass !== 0 || vehicleBodies.has(hit.body)) return
        if (allLoaded && this.fallbackFloor.owns(hit.body)) return
        if (hit.hitNormalWorld.y < 0.5) return
        if (best === null || hit.hitPointWorld.y > best) best = hit.hitPointWorld.y
      },
    )
    return best
  }
  private alignTrailer(trailer: Vehicle, tractor: Vehicle): void {
    const tow = trailer.definition.tow!
    trailer.body.quaternion.copy(tractor.body.quaternion)
    trailer.body.position.copy(
      tractor.body
        .pointToWorldFrame(new Vec3(...tow.hitch))
        .vsub(trailer.body.quaternion.vmult(new Vec3(...tow.anchor))),
    )
    trailer.body.previousPosition.copy(trailer.body.position)
    trailer.body.interpolatedPosition.copy(trailer.body.position)
    trailer.body.previousQuaternion.copy(trailer.body.quaternion)
    trailer.body.velocity.setZero()
    trailer.body.angularVelocity.setZero()
    trailer.body.wakeUp()
  }
  /** Change the shared plane speed regime without resetting pose or velocity. */
  setFlightSpeedMode(id: string, mode: 'slow' | 'fast'): boolean {
    const vehicle = this.vehicles.get(id)
    if (!vehicle?.flight || !vehicle.definition.aircraft) return false
    vehicle.flight.speedMode = mode
    return true
  }
  setHelmMode(mode: Vehicle['helm']): string {
    const v = this.vehicleId ? this.vehicles.get(this.vehicleId) : undefined
    if (!v?.definition.flight) return 'Ponte al mando de la nave para cambiar de modo'
    if (mode === 'car') {
      v.helm = 'car'
      if (!v.flight) return 'Modo coche'
      const landed = this.toggleFlight()
      if (v.flight) v.helm = 'drone'
      return landed
    }
    if (mode === 'off') {
      v.helm = 'off'
      return 'Nave apagada'
    }
    if (!v.flight) {
      const forward = v.body.quaternion.vmult(new Vec3(0, 0, -1))
      v.flight = { altitude: this.height(v.body), yaw: Math.atan2(-forward.x, -forward.z) }
      v.raycast.removeFromWorld(this.world)
      this.world.addBody(v.body)
      this.setRamp(v, true)
    }
    v.helm = mode
    if (mode === 'drone') v.cruiseSpeed = 300
    if (mode === 'space') v.cruiseSpeed = 1000
    return {
      auto: 'Piloto automático',
      drone: 'Modo dron',
      plane: 'Modo avión',
      space: 'Modo nave espacial',
    }[mode]
  }

  cycleHelmMode(): string {
    const v = this.vehicleId ? this.vehicles.get(this.vehicleId) : undefined
    if (!v?.definition.flight) return 'Ponte al mando de la nave para cambiar de modo'
    const order: Vehicle['helm'][] = ['off', 'auto', 'car', 'drone', 'plane', 'space']
    let index = order.indexOf(v.helm)
    for (let step = 0; step < order.length; step++) {
      index = (index + 1) % order.length
      const next = order[index]
      if (next === 'car' && v.flight) continue
      return this.setHelmMode(next)
    }
    return this.setHelmMode(v.helm)
  }

  private fly(v: Vehicle, active: boolean): void {
    let tangent = new Quaternion()
    if (this.document.geography) {
      const point = localToGeo(this.document.geography, vec(v.body.position))
      const q = localFrame(this.document.geography).invert().multiply(localFrame(point))
      tangent = new Quaternion(q.x, q.y, q.z, q.w)
    }
    const cargo: Body[] = []
    for (const [id, dock] of this.docks)
      if (dock.carrierId === v.entity.id) cargo.push(this.vehicles.get(id)!.body)
    stepFlight(
      v,
      this.input,
      {
        height: this.height(v.body),
        up: this.radialUp(v.body),
        tangent,
        minimumAltitude: this.minimumFlightAltitude,
        planetary: !!this.document.geography,
        cargo,
      },
      FIXED_STEP,
      active,
    )
  }

  /** Closest point of a vehicle's hull box to `from`: where a hand can reach it. */
  private hullPoint(v: Vehicle, from: Vec3): Vec3 {
    const local = v.body.pointToLocalFrame(from)
    const half = v.entity.size.map((size) => Math.max(0.1, size / 2))
    return v.body.pointToWorldFrame(
      new Vec3(
        clamp(local.x, -half[0], half[0]),
        clamp(local.y, -half[1], half[1]),
        clamp(local.z, -half[2], half[2]),
      ),
    )
  }
  /** True when a wall, building or hill stands between `from` and the vehicle hull point. */
  private hullBlocked(v: Vehicle, from: Vec3, target: Vec3): boolean {
    let blocked = false
    this.world.raycastAll(from, target, { skipBackfaces: true }, (hit) => {
      if (hit.body !== this.playerBody && hit.body !== v.body) blocked = true
    })
    return blocked
  }
  nearestVehicle(): string | null {
    if (this.vehicleId) return null
    let nearest: string | null = null,
      distance = Infinity
    for (const [id, v] of this.vehicles) {
      // Reach the hull/doors, not an arbitrary model origin or distant pilot seat.
      if (v.definition.passive) continue
      const local = v.body.pointToLocalFrame(this.playerBody.position)
      const target = this.hullPoint(v, this.playerBody.position)
      // A tipped chassis can put its hull point beneath the supporting terrain.
      // Reach the exposed upper side, rather than treating that ground as a wall.
      if (v.twoWheeled?.fallen || v.twoWheeled?.crashed)
        target.y = Math.max(target.y, this.playerBody.position.y - this.playerHalfHeight + 0.3)
      const reach = target.distanceTo(this.playerBody.position)
      // A carrier hull encloses its cargo: prefer the car beside the monitor,
      // while keeping the helm reachable around the hull when no car is nearer.
      const d =
        reach +
        (v.definition.interior
          ? Math.min(2, local.distanceTo(new Vec3(...v.definition.driver)) * 0.25)
          : 0)
      const platformVelocity = new Vec3()
      v.body.getVelocityAtWorldPoint(this.playerBody.position, platformVelocity)
      const relativeSpeed = this.playerBody.velocity.vsub(platformVelocity).length()
      if (
        reach < 2.75 &&
        d < distance &&
        (v.body.velocity.length() < 1.5 || (this.interiorId === id && relativeSpeed < 2))
      ) {
        if (this.hullBlocked(v, this.playerBody.position, target)) continue
        nearest = id
        distance = d
      }
    }
    return nearest
  }
  /**
   * Interaction returns a useful status; dismount requires a supported, unobstructed exit.
   * Picking up a fallen two-wheeler animates an in-place lift before mounting; R remains a reset.
   */
  interact(_recover?: RecoverVehicleOptions): string {
    if (this.disposed) throw new Error('Simulation is disposed')
    if (this.gentleRecovery) {
      this.gentleRecovery = null
      this.ejection = null
      return 'A pie · moto en el suelo'
    }
    if (this.vehicleId) return this.exitVehicle()
    const id = this.nearestVehicle()
    if (!id) return 'Acércate a un vehículo detenido y pulsa E para entrar'
    const v = this.vehicles.get(id)!
    if (this.damage.destroyed(id)) return 'Vehículo destruido'
    const lying = !!v.twoWheeled && (v.twoWheeled.crashed || v.twoWheeled.fallen)
    if (lying)
      return this.beginGentleRecovery(v, true)
        ? 'Levantando la moto'
        : 'No hay espacio para levantar la moto'
    this.startInVehicle(id)
    return 'Conduciendo ' + v.entity.name
  }
  /** Explicit scenario entry; ordinary interaction still checks reach and obstructions. */
  startInVehicle(id: string): void {
    if (
      this.disposed ||
      this.vehicleId ||
      !this.vehicles.has(id) ||
      this.damage.destroyed(id) ||
      this.vehicles.get(id)!.definition.passive
    )
      throw new Error('Invalid initial vehicle')
    this.setInterior(null)
    this.vehicleId = id
    this.bikeMountHold = null
    this.gentleRecovery = null
    this.ejection = null
    this.world.removeBody(this.playerBody)
    this.playerBody.velocity.setZero()
    this.grounded = false
    if (this.vehicles.get(id)!.definition.plane) this.setHelmMode('plane')
    this.takeSeat(id)
  }
  /**
   * Every way into a road vehicle's seat (E, a scenario/host spawn in the seat, a control
   * transfer) lands in P with the brakes holding it, then runs the start-up sequence.
   * Boats, planes and flight-capable vehicles have no gear selector and are left alone.
   */
  private takeSeat(id: string): void {
    const v = this.vehicles.get(id)
    if (!v || !hasGearSelector(v.definition)) return
    enterWheeledVehicle(v, this.options.ignition ?? true)
  }
  /**
   * Keep the player's road vehicle switched off (silent, no drive torque, still in P and held by
   * its brakes) until `startEngine()`; a start-up already under way is cancelled. For hosts that
   * play the start-up later, e.g. a start camera sequence. False when the player is not at the
   * wheel of a road vehicle.
   */
  holdEngine(): boolean {
    const v = this.vehicleId ? this.vehicles.get(this.vehicleId) : undefined
    if (!v || !hasGearSelector(v.definition)) return false
    v.helm = 'off'
    v.drivetrain.ignition = 'running'
    v.drivetrain.ignitionElapsed = 0
    return true
  }
  /**
   * Switch a held road vehicle back on and run the normal start-up sequence (starter, needle
   * sweep, idle; all in P). False when the player is not at the wheel of a road vehicle.
   */
  startEngine(): boolean {
    const v = this.vehicleId ? this.vehicles.get(this.vehicleId) : undefined
    if (!v || !hasGearSelector(v.definition)) return false
    if (v.helm === 'off') v.helm = 'car'
    startIgnition(v.drivetrain)
    return true
  }
  private exitVehicle(): string {
    const v = this.vehicles.get(this.vehicleId!)!
    if (v.body.velocity.length() > 1.5) return 'Detén el vehículo antes de salir'
    if (v.definition.boat) {
      const top = Math.max(
        0,
        ...(v.definition.colliders ?? []).map((c) => c.transform.position[1] + c.size[1] / 2),
      )
      for (const z of [1.6, -1.6]) {
        const candidate = v.body.pointToWorldFrame(
          new Vec3(0, top + this.playerHalfHeight + 0.08, z),
        )
        const half = new Vec3(PLAYER_RADIUS, this.playerHalfHeight, PLAYER_RADIUS)
        if (
          this.overlapsBody(
            new AABB({ lowerBound: candidate.vsub(half), upperBound: candidate.vadd(half) }),
          )
        )
          continue
        this.playerBody.position.copy(candidate)
        this.playerBody.previousPosition.copy(candidate)
        v.body.getVelocityAtWorldPoint(candidate, this.playerBody.velocity)
        this.playerBody.angularVelocity.setZero()
        this.playerBody.aabbNeedsUpdate = true
        this.vehicleId = null
        this.world.addBody(this.playerBody)
        this.playerBody.wakeUp()
        return 'A bordo · E para volver al mando'
      }
      return 'La cubierta está ocupada'
    }
    if (v.definition.interior) {
      const exit = v.definition.interior.exit
      for (const x of [exit[0], -exit[0]]) {
        const candidate = v.body.pointToWorldFrame(new Vec3(x, exit[1], exit[2]))
        const radius = this.playerHalfHeight
        const bounds = new AABB({
          lowerBound: candidate.vsub(new Vec3(PLAYER_RADIUS, radius, PLAYER_RADIUS)),
          upperBound: candidate.vadd(new Vec3(PLAYER_RADIUS, radius, PLAYER_RADIUS)),
        })
        if (this.overlapsBody(bounds)) continue
        this.playerBody.position.copy(candidate)
        this.playerBody.previousPosition.copy(candidate)
        v.body.getVelocityAtWorldPoint(candidate, this.playerBody.velocity)
        this.playerBody.angularVelocity.setZero()
        this.playerBody.aabbNeedsUpdate = true
        this.vehicleId = null
        this.setInterior(v.entity.id)
        this.input.yaw = 0
        this.world.addBody(this.playerBody)
        this.playerBody.wakeUp()
        return 'Dentro de la nave · E para volver al mando'
      }
      return 'El pasillo interior está ocupado'
    }
    let fallbackExit: Vec3 | null = null
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
      candidate.y =
        support + (this.options.playerMode === 'hover' ? 1.25 : PLAYER_HALF_HEIGHT) + 0.04
      const bounds = new AABB({
        lowerBound: new Vec3(
          candidate.x - PLAYER_RADIUS,
          candidate.y - this.playerHalfHeight,
          candidate.z - PLAYER_RADIUS,
        ),
        upperBound: new Vec3(
          candidate.x + PLAYER_RADIUS,
          candidate.y + this.playerHalfHeight,
          candidate.z + PLAYER_RADIUS,
        ),
      })
      const blocked = this.overlapsBody(bounds)
      if (blocked) continue
      // Prefer the side from which the vehicle can be boarded again: a hollow building collider
      // does not overlap the player, yet its wall would make every vehicle unreachable.
      if (this.hullBlocked(v, candidate, this.hullPoint(v, candidate))) {
        fallbackExit ??= candidate
        continue
      }
      this.placeOnFoot(candidate)
      return this.options.playerMode === 'hover' ? 'Monitor volante' : 'A pie'
    }
    if (fallbackExit) {
      this.placeOnFoot(fallbackExit)
      return this.options.playerMode === 'hover' ? 'Monitor volante' : 'A pie'
    }
    return 'Las salidas están bloqueadas'
  }
  private placeOnFoot(candidate: Vec3): void {
    this.bikeMountHold = null
    const leaving = this.vehicleId ? this.vehicles.get(this.vehicleId) : undefined
    if (
      leaving &&
      !leaving.definition.boat &&
      !leaving.definition.plane &&
      !leaving.definition.passive &&
      !leaving.twoWheeled?.fallen &&
      leaving.body.velocity.length() < 1.5
    )
      engagePark(leaving.drivetrain)
    this.playerBody.position.copy(candidate)
    this.playerBody.previousPosition.copy(candidate)
    this.playerBody.velocity.setZero()
    this.playerBody.angularVelocity.setZero()
    this.playerBody.aabbNeedsUpdate = true
    this.world.addBody(this.playerBody)
    this.playerBody.wakeUp()
    this.vehicleId = null
  }
  private overlapsBody(bounds: AABB): boolean {
    const center = bounds.lowerBound.vadd(bounds.upperBound).scale(0.5)
    const half = bounds.upperBound.vsub(bounds.lowerBound).scale(0.5)
    return this.world.intersectsCuboid(center, half, this.playerBody)
  }

  vehicleInfo(
    id: string,
    interpolated = false,
  ): {
    steer: number
    up: Vec3Tuple
    driver: Vec3Tuple
    cameraDistance: number
    turnRate: number
    isCarrier: boolean
    dockedTo: string | null
    rampClosed: boolean
    rampAngle: number
    rampExtension: number
    rampMoving: boolean
    speedKmh: number
    braking: boolean
    reversing: boolean
    altitude: number
    cruiseSpeed: number
    flightMode: boolean
    flightSpeedMode: 'slow' | 'fast'
    flightControls: { pitch: number; roll: number; yaw: number }
    helm: Vehicle['helm']
    canFly: boolean
    targetAltitude: number | null
    engine: number
    rpm: number
    gear: number
    manualTransmission: boolean
    /** Engine mode (`powertrain.modes`): `beast` shows S on the selector. */
    engineMode: EngineMode
    /** True when the vehicle has the Normal / Bestia engine modes. */
    engineModes: boolean
    engineLoad: number
    tireSlip: number
    /** Counts every gear change, automatic included, and D/R engagements. */
    gearShifts: number
    /** Counts audible changes (D/R engagement, manual shifts); play one clack per increase. */
    gearClacks: number
    /** True in P (gear is then 0): the brakes hold the vehicle until W or S. */
    parked: boolean
    /** True while torque is cut for a gear change or D/R waits for standstill. */
    shifting: boolean
    /** Per-vehicle clack sound; null selects the audio layer's car default. */
    gearClack: GearClackProfile | null
    /** Start-up phase after entering: `cranking`, `sweep` (needle self-test), `running`. */
    ignition: 'cranking' | 'sweep' | 'running'
    /** Increments on every start-up; play one starter sound per increase. */
    ignitionCount: number
    /** Needle self-test 0..1 while `ignition` is `sweep`; dials show this share of full scale. */
    gaugeSweep: number
    towVehicleId: string | null
    /** True while a free trailer is resting on its landing legs. */
    landingGear: boolean
    /** True for a single-track vehicle (motorcycle). */
    twoWheeled: boolean
    /** Two-wheeler lean from the local vertical, radians, positive to the left; 0 otherwise. */
    lean: number
    /**
     * Roll a camera or flip detector must treat as intended riding lean, radians: the fall
     * threshold for two-wheelers, 0 for everything else.
     */
    leanAllowance: number
    /** Two-wheeler pitch against the ground, radians: wheelie > 0, stoppie < 0; 0 otherwise. */
    pitch: number
  } {
    const v = this.vehicles.get(id)
    if (!v) throw new Error('Unknown vehicle: ' + id)
    const ground = wheeledTelemetry(
      v,
      this.wheeledInput(),
      this.vehicleId === id,
      !v.definition.boat,
    )
    const up = this.radialUp(v.body)
    return {
      steer: v.steer,
      up: [up.x, up.y, up.z],
      driver: new Vector3(...v.definition.driver)
        .applyQuaternion(new RenderQuaternion(...this.entityTransform(id, interpolated).rotation))
        .add(new Vector3(...this.entityTransform(id, interpolated).position))
        .toArray(),
      cameraDistance: v.definition.cameraDistance,
      turnRate: v.body.angularVelocity.y,
      isCarrier: Boolean(v.definition.garage),
      dockedTo: this.docks.get(id)?.carrierId ?? null,
      rampClosed: v.rampClosed,
      rampAngle: v.rampAngle,
      rampExtension: v.rampExtension,
      rampMoving: Math.abs(v.rampTarget - v.rampAngle) > 0.001,
      speedKmh: ground.speedMps * 3.6,
      braking: ground.braking,
      reversing: ground.reversing,
      altitude: this.height(v.body),
      cruiseSpeed: v.cruiseSpeed,
      flightMode: Boolean(v.flight),
      flightSpeedMode: v.flight?.speedMode ?? 'slow',
      flightControls:
        id === this.vehicleId && v.flight && v.helm !== 'off'
          ? { pitch: this.input.forward, roll: this.input.right, yaw: this.input.turn ?? 0 }
          : { pitch: 0, roll: 0, yaw: 0 },
      helm: v.helm,
      canFly: Boolean(v.definition.flight),
      targetAltitude: v.flight?.altitude ?? null,
      engine: v.definition.plane ? v.prop : 0,
      rpm: ground.rpm,
      gear: ground.gear,
      manualTransmission: ground.manualTransmission,
      engineMode: ground.engineMode,
      engineModes: ground.engineModes,
      engineLoad: ground.engineLoad,
      tireSlip: ground.tireSlip,
      gearShifts: ground.shiftCount,
      gearClacks: ground.clackCount,
      parked: ground.parked,
      shifting: ground.shifting,
      gearClack: ground.clack ?? null,
      ignition: ground.ignition,
      ignitionCount: ground.ignitionCount,
      gaugeSweep: ground.gaugeSweep,
      towVehicleId: v.definition.tow?.vehicleId ?? null,
      landingGear: v.landingGear.length > 0,
      twoWheeled: Boolean(v.twoWheeled),
      lean: v.twoWheeled?.lean ?? 0,
      leanAllowance: v.twoWheeled?.tuning.fallLean ?? 0,
      pitch: v.twoWheeled?.pitch ?? 0,
    }
  }
  /** Steering, suspension and wheel spin of a two-wheeler for its presentation rig; else null. */
  twoWheeledPose(id: string): TwoWheeledPose | null {
    const v = this.vehicles.get(id)
    return v?.twoWheeled ? twoWheeledPose(v as TwoWheeledVehicle) : null
  }

  shiftVehicle(direction: -1 | 1): string {
    const v = this.vehicleId ? this.vehicles.get(this.vehicleId) : null
    if (!v) return 'Este vehículo no tiene cambio secuencial'
    const result = shiftWheeledVehicle(v, direction)
    if (result === 'unavailable') return 'Este vehículo no tiene cambio secuencial'
    return result === 'shifted'
      ? `Manual · ${gearLabel(v.drivetrain.gear, true)}`
      : 'Cambio protegido · marcha no disponible'
  }
  /**
   * The selector key (B). From a manual gear it returns to automatic in the current mode. Already
   * in automatic, a car with engine modes moves the selector between D (Normal) and S (Bestia).
   */
  automaticTransmission(): string {
    const v = this.vehicleId ? this.vehicles.get(this.vehicleId) : null
    if (!v?.definition.powertrain) return 'Este vehículo no tiene cambio secuencial'
    const wasManual = v.drivetrain.manual
    automaticWheeledTransmission(v)
    if (!wasManual && hasEngineModes(v.definition.powertrain))
      return this.setEngineMode(this.vehicleId!, v.drivetrain.mode === 'beast' ? 'normal' : 'beast')
    return `Cambio automático · ${v.drivetrain.mode === 'beast' && hasEngineModes(v.definition.powertrain) ? 'S' : 'D'}`
  }

  /**
   * Select a car's engine mode (J menu «Motor», or the selector D/S). Power, torque, redline,
   * shift points and the engine voice follow. Returns the HUD message.
   */
  setEngineMode(id: string, mode: EngineMode): string {
    const v = this.vehicles.get(id)
    if (!v || !setWheeledEngineMode(v, mode)) return 'Este vehículo tiene un solo modo de motor'
    return mode === 'beast' ? 'Motor: Bestia · cambio en S' : 'Motor: Normal · cambio en D'
  }

  /** Current engine mode of a vehicle; `normal` for vehicles without modes or unknown ids. */
  engineMode(id: string): EngineMode {
    return this.vehicles.get(id)?.drivetrain.mode ?? 'normal'
  }

  dockingCandidate(id = this.vehicleId): string | null {
    return this.garage.candidate(id)
  }

  toggleDock(): string {
    return this.garage.toggle(this.vehicleId)
  }

  setCruiseSpeed(id: string, speed: number): void {
    const vehicle = this.vehicles.get(id)
    if (!vehicle?.definition.flight || !Number.isFinite(speed) || speed < 0 || speed > 1000)
      throw new Error('Velocidad: 0–1000 km/h')
    vehicle.cruiseSpeed = speed
  }

  /** Enable/disable road assist (gentle snap to road centerline). */
  setRoadAssist(enabled: boolean, strength = 0.3): void {
    this.roadGuidance.configure(enabled, strength)
  }

  get roadAssist(): { enabled: boolean; strength: number } {
    return this.roadGuidance.settings
  }

  /** Operate the attached trailer from the tractor menu, only while stationary. */
  setTrailerPlatform(tractorId: string, flat: boolean): string {
    const tractor = this.vehicles.get(tractorId)
    const trailer =
      tractor?.definition.passive && tractor.definition.garage?.ramp?.loadAngle !== undefined
        ? tractor
        : [...this.vehicles.values()].find(
            (v) =>
              v.definition.tow?.vehicleId === tractorId &&
              v.definition.garage?.ramp?.loadAngle !== undefined,
          )
    if (!tractor || !trailer) return 'Engancha un remolque plataforma o portacoches'
    if (tractor.body.velocity.length() > 0.8)
      return 'Detén el vehículo antes de mover la plataforma'
    if (!flat)
      for (const [id, dock] of [...this.docks])
        if (dock.carrierId === trailer.entity.id) this.garage.toggle(id)
    this.setRamp(trailer, flat)
    return flat
      ? 'Bajando plataforma · la carga se sujetará al quedar horizontal'
      : 'Rampa de salto · carga libre'
  }
  cargoTrailer(tractorId: string): string | null {
    return (
      [...this.vehicles.values()].find(
        (v) =>
          v.definition.tow?.vehicleId === tractorId &&
          v.entity.visual?.body.url.endsWith('trailer.transporter.glb'),
      )?.entity.id ?? null
    )
  }
  adjustTrailerRamp(tractorId: string, action: string): string {
    const tractor = this.vehicles.get(tractorId)
    const trailer = tractor?.definition.passive
      ? tractor
      : [...this.vehicles.values()].find(
          (v) => v.definition.tow?.vehicleId === tractorId && v.definition.garage?.ramp?.telescope,
        )
    const telescope = trailer?.definition.garage?.ramp?.telescope
    if (!tractor || !trailer || !telescope) return 'Engancha el portacoches telescópico'
    if (tractor.body.velocity.length() > 0.8 || trailer.body.velocity.length() > 0.8)
      return 'Detén el camión antes de ajustar la rampa'
    for (const [id, dock] of [...this.docks])
      if (dock.carrierId === trailer.entity.id) this.garage.toggle(id)
    if (action === 'extend' || action === 'retract') {
      trailer.rampExtensionTarget = action === 'extend' ? telescope.travel : 0
    } else if (action === 'angle-up' || action === 'angle-down') {
      trailer.rampTarget = clamp(
        trailer.rampTarget + (action === 'angle-up' ? -1 : 1) * telescope.angleStep,
        telescope.minAngle,
        telescope.maxAngle,
      )
    }
    trailer.rampClosed = false
    return `Rampa: ${Math.round((-trailer.rampTarget * 180) / Math.PI)}° · extensión ${trailer.rampExtensionTarget.toFixed(1)} m`
  }
  cargoCount(carrierId: string): number {
    return [...this.docks.values()].filter((dock) => dock.carrierId === carrierId).length
  }
  mountCargo(id: string, carrierId: string, local: Vec3Tuple): void {
    const car = this.vehicles.get(id)!,
      carrier = this.vehicles.get(carrierId)!
    car.body.position.copy(carrier.body.pointToWorldFrame(new Vec3(...local)))
    car.body.quaternion.copy(carrier.body.quaternion)
    car.body.previousPosition.copy(car.body.position)
    car.body.interpolatedPosition.copy(car.body.position)
    car.body.previousQuaternion.copy(car.body.quaternion)
    this.garage.attach(id, carrierId)
  }

  setGarageDoor(id: string, closed: boolean): string {
    const carrier = this.vehicles.get(id)
    if (!carrier?.definition.garage) throw new Error('Nave desconocida')
    for (const body of this.world.bodies) {
      if (!body.mass || body === carrier.body || (body === this.playerBody && this.vehicleId))
        continue
      const actor = [...this.vehicles.values()].find((v) => v.body === body)
      const points = portalEnvelope(body, actor).map((point) =>
        carrier.body.pointToLocalFrame(new Vec3(...point)),
      )
      const overlaps = (axis: 'x' | 'y' | 'z', low: number, high: number) =>
        Math.min(...points.map((p) => p[axis])) < high &&
        Math.max(...points.map((p) => p[axis])) > low
      // The bay ends at z=4.95 and the hinge is at 5.1. A body still inside that
      // mouth is leaving, not standing on the ramp the door sweeps.
      const rampZ = (carrier.definition.garage.ramp?.hinge[2] ?? 5.1) + 0.3
      if (
        points.length &&
        overlaps('x', -2.7, 2.7) &&
        overlaps('z', rampZ, 8.3) &&
        overlaps('y', -1.6, 2.5)
      )
        throw new Error('Despeja la puerta del garaje antes de moverla')
    }
    if (!closed) {
      for (const mouth of this.portalEntities.filter(
        (e) => e.parentId === id && e.portal!.clearsRamp && e.portal!.mode !== 'closed',
      ))
        this.configurePortal(mouth.id, mouth.portal!.pairId, 'closed')
    }
    this.setRamp(carrier, closed)
    return closed ? 'Cerrando puerta del garaje' : 'Abriendo puerta del garaje'
  }

  private setRamp(carrier: Vehicle, closed: boolean): void {
    const ramp = carrier.definition.garage?.ramp
    if (!ramp) return
    // Automatic landing/unlatching must also disconnect the gate before opening the door.
    if (!closed) {
      for (const mouth of this.portalEntities.filter(
        (e) =>
          e.parentId === carrier.entity.id && e.portal!.clearsRamp && e.portal!.mode !== 'closed',
      ))
        this.configurePortal(mouth.id, mouth.portal!.pairId, 'closed')
    }
    carrier.rampTarget = closed ? ramp.closeAngle : (ramp.loadAngle ?? 0)
    if (closed) carrier.rampExtensionTarget = 0
    carrier.rampClosed = closed && Math.abs(carrier.rampAngle - ramp.closeAngle) < 0.001
  }

  private updateRamp(carrier: Vehicle, dt: number): void {
    const ramp = carrier.definition.garage?.ramp
    if (!ramp) return
    const previous = carrier.rampAngle
    const previousExtension = carrier.rampExtension
    const telescope = ramp.telescope
    if (telescope)
      carrier.rampExtension += clamp(
        carrier.rampExtensionTarget - carrier.rampExtension,
        -dt * telescope.speed,
        dt * telescope.speed,
      )
    carrier.rampAngle += clamp(carrier.rampTarget - carrier.rampAngle, -dt * 0.9, dt * 0.9)
    carrier.rampClosed =
      carrier.rampTarget === ramp.closeAngle &&
      carrier.rampExtension < 0.001 &&
      carrier.rampExtensionTarget === 0 &&
      Math.abs(carrier.rampAngle - ramp.closeAngle) < 0.001
    const portalActive = this.portalEntities.some(
      (e) =>
        e.parentId === carrier.entity.id && e.portal!.clearsRamp && e.portal!.mode !== 'closed',
    )
    if (
      dt > 0 &&
      previous === carrier.rampAngle &&
      previousExtension === carrier.rampExtension &&
      portalActive === carrier.rampPortalActive
    )
      return
    carrier.rampPortalActive = portalActive
    const collider = carrier.definition.colliders[ramp.colliderIndex]
    const hinge = new Vec3(...ramp.hinge)
    // Connected mouths need floor support until the actor centre crosses the seam.
    // The closed visual door becomes a portal; its collider becomes a level floor apron.
    const collisionAngle = portalActive
      ? -2 * Math.atan2(collider.transform.rotation[0], collider.transform.rotation[3])
      : carrier.rampAngle
    const rotation = new Quaternion().setFromAxisAngle(new Vec3(1, 0, 0), collisionAngle)
    const offset = rotation.vmult(new Vec3(...collider.transform.position).vsub(hinge)).vadd(hinge)
    carrier.body.shapeOffsets[ramp.colliderIndex].copy(offset)
    carrier.body.shapeOrientations[ramp.colliderIndex].copy(
      rotation.mult(new Quaternion(...collider.transform.rotation)),
    )
    if (telescope) {
      const section = carrier.definition.colliders[telescope.colliderIndex]
      const local = new Vec3(...section.transform.position)
      local.z += carrier.rampExtension
      carrier.body.shapeOffsets[telescope.colliderIndex].copy(
        rotation.vmult(local.vsub(hinge)).vadd(hinge),
      )
      carrier.body.shapeOrientations[telescope.colliderIndex].copy(
        rotation.mult(new Quaternion(...section.transform.rotation)),
      )
      carrier.body.updateShapeTransform(telescope.colliderIndex)
    }
    carrier.body.updateBoundingRadius()
    carrier.body.updateShapeTransform(ramp.colliderIndex)
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
    this.takeSeat(target)
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
    const trailers = new Set(
      [...this.vehicles.values()]
        .filter((v) => this.vehicleId !== null && v.definition.tow?.vehicleId === this.vehicleId)
        .map((v) => v.body),
    )
    this.world.raycastAll(from, to, { skipBackfaces: true }, (hit) => {
      if (hit.body !== this.playerBody && hit.body !== active && !trailers.has(hit.body!))
        distance = Math.min(distance, Math.max(0.15, hit.distance - 0.2))
    })
    return vec(from.vadd(delta.scale(distance / total)))
  }
  dispose(): void {
    if (this.disposed) return
    this.fallbackFloor.dropCatchFloor()
    this.garage.dispose()
    for (const joint of this.trailerJoints) this.world.removeConstraint(joint)
    this.trailerJoints.length = 0
    this.planetCollisions.dispose()
    this.previousWheels.clear()
    for (const v of this.vehicles.values()) v.raycast.removeFromWorld(this.world)
    for (const b of [...this.world.bodies]) this.world.removeBody(b)
    this.vehicles.clear()
    this.bodies.clear()
    this.mapCollision.clear()
    this.portalTraversal.clear()
    this.externalSurfaces.clear()
    this.world.raw.free()
    this.disposed = true
  }
}
