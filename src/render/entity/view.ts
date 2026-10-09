import type {
  VehiclePresentationResolver,
  BeaconEquipment,
} from '../vehicle-presentation/adapter.js'

import { ShipHud } from './ship-hud.js'
import { entityMapArtifact } from '../planet/map-artifact.js'
import { isMapEnvironment } from '../../scene/map-content.js'
import {
  castShadowFromBackFaces,
  matteGroundMaterial,
  groundDepthBias,
  transportLayer,
  footBuried,
} from '../planet/ground-material.js'
import { BuildingBatches } from '../planet/building-batches.js'
import { isMapBuilding } from '../../entity/schema.js'
import { SURFACE_LAYERS } from '../../planet/land/surface.js'
import { withinMapDistance } from '../planet/visibility.js'
import { CarrierThrusters } from './carrier-thrusters.js'
import { ShipLights, type ShipSwitch } from './ship-lights.js'
import { takeMapGeometry } from '../planet/geometry.js'
import { Streetlights } from './streetlights.js'
import type { CarLights } from './car-lights.js'
import { AuthoredVehicleLights } from '../vehicle-presentation/authored-lights.js'
import type { VehicleLightMode } from '../vehicle-presentation/light-controller.js'
import { StartLights } from '../vehicle-presentation/start-lights.js'
import {
  mountLandingGear,
  landingGearMeshBounds,
  type LandingGearVisual,
} from '../vehicle-presentation/landing-gear.js'
import { hasLandingGear, trailerWheelContactY } from '../../simulation/landing-gear.js'
import { VehicleLightRig } from '../vehicle-presentation/light-rig.js'
import {
  bindMotorcycleRig,
  hasMotorcycleRig,
  motorcycleRigFromModel,
  type MotorcycleRigBinding,
} from '../vehicle-presentation/motorcycle-rig.js'
import { MotorcycleInstruments } from '../vehicle-presentation/motorcycle-instruments.js'
import { motorcycleMirrorLenses } from '../vehicle-presentation/motorcycle-mirrors.js'
import {
  applyVehicleEnvironment,
  type ReflectionEnvironment,
} from '../vehicle-presentation/reflection-environment.js'
import { localMinutes, skyTime } from '../../planet/sky.js'
import { simulationDefaults, twoWheeledDefaults } from '../../config/simulation.js'
import { gameCameraDefaults, rideSmoothingDefaults } from '../../config/camera.js'
import { vehicleAppearanceDefaults } from '../../config/vehicle-appearance.js'
import { easeRiderHead, type RiderHeadEase } from './rider-head.js'
import { RideSmoothing, rideSmoothingSettings } from './ride-smoothing.js'
import { AvatarFollow, EjectionTumble } from './avatar-motion.js'
import {
  clampMirrorAdjustment,
  mirrorModelKey,
  CarMirrors,
  type MirrorAdjustment,
  type MirrorAngle,
  type MirrorPolicy,
} from './car-mirrors.js'
import {
  clampSteeringWheelOffset,
  poseSteeringWheel,
  steeringAxis,
  steeringPivot,
  steeringWheelCentred,
  steeringWheelOffsetPosition,
  type SteeringWheelOffset,
} from './steering-wheel.js'
import type { CarInstruments } from './car-instruments.js'
import type { CarInstrumentDefinition } from './car-instrument-definition.js'
import { mountPropeller } from './propeller.js'
import { RoadBatches } from '../planet/road-batches.js'
import { LandcoverBatches } from '../planet/landcover-batches.js'
import { carrierInterior } from './carrier-interior.js'
import { ImpactMarks } from './impact-marks.js'
import { ShotTracers } from './shot-tracers.js'
import { ShotSparks } from './shot-sparks.js'
import { ShotLaser } from './shot-laser.js'
import { roadGeometry } from '../../planet/land/roads/draped-road.js'
import { terrainVertices, terrainIndices } from '../../planet/land/terrain.js'
import { triangles, trianglesWithRoofInfo } from '../../math/solid/mesh.js'
import { UprightBillboard, softenFoliage } from './billboard.js'
import { driverHeadPose } from './driving-camera.js'
import {
  createMonitorAvatar,
  MonitorMotion,
  updateMonitorAvatar,
  setMonitorSunglasses,
  disposeMonitorAvatar,
} from './avatar.js'
import { createPortalSurface, type PortalSurface } from '../portal/portals.js'
import { assertHostedMouths, assertPlaceable, PORTAL_BAR } from '../../entity/portal/portal.js'
import { assets, disposeObject } from './assets.js'
import { vehicleDefinition } from '../../entity/vehicle/vehicle.js'
import type { VisualDefinition, Entity, Transform } from '../../entity/schema.js'
import { SceneGraph } from '../../scene/graph.js'
import { parseScene, type SceneDocument } from '../../scene/document.js'
import type { Simulation } from '../../simulation/simulation.js'
import * as THREE from 'three'

function standardMaterial(
  parameters: THREE.MeshStandardMaterialParameters,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial(parameters)
}

function mesh(geometry: THREE.BufferGeometry, color: string, roughness = 0.72): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({ color, roughness })
  const m = new THREE.Mesh(geometry, material)
  m.castShadow = true
  m.receiveShadow = true
  return m
}
function box(size: number[], color: string): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(...(size as [number, number, number])), color)
}
export function applyPose(object: THREE.Object3D, pose: Transform): void {
  object.position.fromArray(pose.position)
  object.quaternion.fromArray(pose.rotation)
}
export interface SceneViewOptions {
  vehiclePresentation?: VehiclePresentationResolver
  /** Stock A3 mount recipe. Null/omitted disables instruments in the bare renderer. */
  carInstruments?: CarInstrumentDefinition | null
  /** Capture size/interval for vehicle mirrors; high/ultra boosts the authored left lens. */
  mirrorPolicy?: MirrorPolicy
  /**
   * Starting driver adjustment of a steering model (its GLB URL), asked once, when the first
   * vehicle with that steering mesh loads and no `setSteeringWheelOffset` came before.
   */
  steeringWheelOffset?: (model: string) => Partial<SteeringWheelOffset> | undefined
  /**
   * Starting glass adjustment of a mirror model (`mirrorModelKey`), asked once, when the first
   * vehicle of that model loads and no `setMirrorAdjustment` came before.
   */
  mirrorAdjustment?: (model: string) => Readonly<Record<string, Partial<MirrorAngle>>> | undefined
  /**
   * Light switch position once the occupied vehicle's engine runs (after the start-up, or at once
   * with `ignition: false`): `position` (default), `low` (dipped, e.g. a night scene) or `off`.
   */
  startLights?: VehicleLightMode
}

/** Bare renderer. The public package SceneView supplies stock presentation recipes. */
export class SceneView {
  private readonly thrusters = new Map<string, CarrierThrusters>()
  private readonly shipLights = new Map<string, ShipLights>()
  private readonly beacons = new Map<string, BeaconEquipment>()
  private readonly carLights = new Map<string, CarLights>()
  private readonly carMirrors = new Map<string, CarMirrors>()
  private readonly instruments = new Map<string, CarInstruments>()
  private readonly landingGear = new Map<string, LandingGearVisual>()
  /** Fork, swingarm, shock, chain and wheel articulation of two-wheeled GLB bodies. */
  private readonly motorcycleRigs = new Map<string, MotorcycleRigBinding>()
  private readonly motorcycleClusters = new Map<string, MotorcycleInstruments>()
  private readonly reflections = new Map<string, ReflectionEnvironment>()
  /** Distance covered while the cluster is shown, km: odometer since load, and the trip. */
  private readonly odometers = new Map<string, number>()
  private readonly propellers = new Map<string, THREE.Object3D>()
  readonly shipHuds = new Map<string, ShipHud>()
  readonly helmScreens = new Map<string, THREE.Mesh>()
  readonly touchScreens = new Map<string, THREE.Mesh>()
  readonly flightScreens = new Map<string, THREE.Mesh>()
  readonly portalTablets = new Map<string, THREE.Mesh[]>()
  readonly placeScreens = new Map<string, THREE.Mesh>()
  readonly systemScreens = new Map<string, THREE.Mesh>()
  readonly impacts = new ImpactMarks()
  readonly tracers = new ShotTracers()
  readonly sparks = new ShotSparks()
  readonly laser = new ShotLaser()
  readonly root = new THREE.Group()
  readonly streetlights = new Streetlights(this.root)
  night = false
  /** Atmospheric daylight factor (0 night .. 1 day; 1 without a sky), for the chrome reflections. */
  daylight = 1
  /** Multiplier on vehicle reflection levels (Ajustes → Luz «Reflejos»). */
  reflectionScale = 1
  private paintBrightness = 1
  private paintCheckAt = 0
  /**
   * Scale the vehicle paint colour (S3 `Pintura*`, truck and trailer `White paint`) by `k`.
   * The authored or painted colour is kept as the base; a colour changed elsewhere (a repaint)
   * becomes the new base. Rechecked every ~0.5 s for vehicles that appear later.
   */
  applyPaintBrightness(k: number): void {
    const now = performance.now()
    if (k === this.paintBrightness && now < this.paintCheckAt) return
    this.paintBrightness = k
    this.paintCheckAt = now + 500
    for (const object of this.objects.values())
      object.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        for (const material of [mesh.material].flat()) {
          const standard = material as THREE.MeshStandardMaterial
          if (!standard?.isMeshStandardMaterial || !/^pintura|paint/i.test(standard.name)) continue
          const data = standard.userData as {
            nablaPaint?: { base: THREE.Color; applied: THREE.Color }
          }
          if (!data.nablaPaint || !data.nablaPaint.applied.equals(standard.color))
            data.nablaPaint = { base: standard.color.clone(), applied: standard.color.clone() }
          standard.color.copy(data.nablaPaint.base).multiplyScalar(k)
          data.nablaPaint.applied.copy(standard.color)
        }
      })
  }
  private readonly headOffsets = new Map<string, readonly number[]>()
  /** Two-wheeler rider offset ([x, z] chassis metres) from the last pose; moves the head. */
  private readonly riderShifts = new Map<string, readonly [number, number]>()
  /** Two-wheeler tuck (0..1) from the last pose and the tucked eye offset of its preset. */
  private readonly riderTucks = new Map<string, number>()
  /** Eased rider head inputs per two-wheeler (presentation only; `gameCameraDefaults.riderHeadResponse`). */
  private readonly riderHeadEase = new Map<string, RiderHeadEase>()
  /**
   * Ride smoothing of the player's vehicle for the cameras and the seated avatar: the body keeps
   * every bump, the view and the avatar absorb part of the small, fast bounce.
   */
  readonly rideSmoothing = new RideSmoothing()
  vehicleHeadOffset(id: string): readonly number[] | undefined {
    const base = this.headOffsets.get(id)
    const shift = this.riderShifts.get(id)
    if (!base || !shift) return base
    const eye =
      this.document.entities.find((e) => e.id === id)?.vehicle?.twoWheeled?.rider?.tuck?.eye ??
      twoWheeledDefaults.rider.tuck.eye
    return riderHeadOffset(base, shift, this.riderTucks.get(id) ?? 0, eye)
  }
  pressShipSwitch(id: string, kind: ShipSwitch): void {
    this.shipLights.get(id)?.press(kind)
  }
  /** Cars can cast onto the ground without unstable self-shadowing on thin GLB panels. */
  vehicleMenu(id: string) {
    return this.instruments.get(id)?.menu
  }
  toggleVehicleMenu(id: string): boolean | null {
    return this.instruments.get(id)?.toggleMenu() ?? null
  }
  setVehiclePaint(id: string, color: string, finish: 'paint' | 'chrome' = 'paint'): void {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return
    const entity = this.document.entities.find((e) => e.id === id)
    if (entity) entity.color = color
    if (entity?.vehicle) entity.vehicle.paintFinish = finish
    const model = this.objects.get(id)
    if (entity && model) this.options.vehiclePresentation?.(entity)?.paint?.(model, color, finish)
  }
  /** Steering model (GLB URL) of a vehicle with a separate steering mesh, else undefined. */
  steeringWheelModel(id: string): string | undefined {
    return this.steeringAdjust.get(id)?.model
  }
  /** Current adjustment of a steering model; centred when none was set. */
  steeringWheelOffset(model: string): SteeringWheelOffset {
    return { ...(this.steeringOffsets.get(model) ?? steeringWheelCentred) }
  }
  /**
   * Move every steering wheel of `model`, now and when more vehicles of it load, by `offset`
   * (clamped to `steeringWheelOffsetRange`) on top of the GLB pose. The spin pivot moves with
   * the rim, so steering still turns it about its own column. Returns the applied offset.
   */
  setSteeringWheelOffset(model: string, offset: Partial<SteeringWheelOffset>): SteeringWheelOffset {
    const applied = clampSteeringWheelOffset(offset)
    this.steeringModels.add(model)
    if (applied.distance === 0 && applied.height === 0) this.steeringOffsets.delete(model)
    else this.steeringOffsets.set(model, applied)
    for (const [id, entry] of this.steeringAdjust)
      if (entry.model === model) this.applySteeringOffset(id)
    return { ...applied }
  }
  private applySteeringOffset(id: string): void {
    const entry = this.steeringAdjust.get(id)
    const axis = this.steeringAxes.get(id)
    if (!entry || !axis) return
    steeringWheelOffsetPosition(
      axis,
      entry.mount.quaternion,
      this.steeringOffsets.get(entry.model) ?? steeringWheelCentred,
      entry.adjust.position,
    )
  }
  /** Mirror model (`mirrorModelKey`) of a vehicle with cockpit mirrors, else undefined. */
  mirrorModel(id: string): string | undefined {
    return this.mirrorModels.get(id)
  }
  /** Sides of a vehicle's mirrors (`left`, `right`, …); empty without mirrors. */
  mirrorSides(id: string): string[] {
    return this.carMirrors.get(id)?.sides ?? []
  }
  /** Current glass adjustment of a mirror model; `{}` when it keeps the authored aim. */
  mirrorAdjustment(model: string): MirrorAdjustment {
    return structuredClone(this.mirrorAdjustments.get(model) ?? {})
  }
  /**
   * Turn the mirror glasses of every vehicle of `model`, now and when more load, by `adjustment`
   * (per side, clamped to `mirrorAngleRange`) on top of the authored aim. Returns the applied
   * adjustment.
   */
  setMirrorAdjustment(
    model: string,
    adjustment: Readonly<Record<string, Partial<MirrorAngle>>>,
  ): MirrorAdjustment {
    const applied = clampMirrorAdjustment(adjustment)
    this.mirrorModelsResolved.add(model)
    if (Object.keys(applied).length) this.mirrorAdjustments.set(model, applied)
    else this.mirrorAdjustments.delete(model)
    for (const [id, entry] of this.mirrorModels)
      if (entry === model) this.carMirrors.get(id)?.setAdjustment(applied)
    return structuredClone(applied)
  }
  setVehicleMirrorTilt(id: string, degrees: number): void {
    const entity = this.document.entities.find((e) => e.id === id)
    const tilt = THREE.MathUtils.clamp(degrees, -5, 12)
    if (entity?.vehicle) entity.vehicle.mirrorTilt = tilt
    this.carMirrors.get(id)?.setTilt(tilt)
    const instruments = this.instruments.get(id)
    if (instruments) instruments.mirrorTilt = tilt
  }
  setVehicleMapFollow(id: string, follow: boolean): void {
    this.instruments.get(id)?.setMapFollow(follow)
  }
  toggleVehicleGps(id: string): boolean | null {
    return this.instruments.get(id)?.toggleGps() ?? null
  }
  private readonly authoredLights = new Map<string, AuthoredVehicleLights>()
  readonly vehicleLights = new VehicleLightRig()
  /** Occupied-vehicle ids that already have cockpit mirrors allocated. */
  get mirroredVehicles(): string[] {
    return [...this.carMirrors.keys()]
  }
  toggleVehicleLights(id: string): boolean | null {
    const mode = this.cycleVehicleLights(id)
    return mode === null ? null : mode !== 'off'
  }
  /** H: step the vehicle's light switch off → position → low (dipped) → off; null without lights. */
  cycleVehicleLights(id: string): VehicleLightMode | null {
    return this.carLights.get(id)?.cycleLights() ?? this.authoredLights.get(id)?.cycle() ?? null
  }
  /** Current light switch position of a vehicle; null while its model loads or it has no lights. */
  vehicleLightMode(id: string): VehicleLightMode | null {
    return (
      this.carLights.get(id)?.controller.mode ??
      this.authoredLights.get(id)?.controller.mode ??
      null
    )
  }
  /** Lights after the start-up (`SceneViewOptions.startLights`); change `mode` to override. */
  readonly startLights = new StartLights()
  toggleVehicleHighBeam(id: string): boolean | null {
    return this.authoredLights.get(id)?.toggleHighBeam() ?? null
  }
  setVehicleShadowReceiving(enabled: boolean): void {
    for (const entity of this.document.entities) {
      if (!entity.vehicle || entity.vehicle.plane || entity.vehicle.boat || entity.vehicle.interior)
        continue
      this.objects.get(entity.id)?.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return
        if (node.userData.originalShadowReceiver === undefined)
          node.userData.originalShadowReceiver = node.receiveShadow
        node.receiveShadow = enabled && node.userData.originalShadowReceiver
      })
    }
  }
  private readonly roads = new RoadBatches()
  private readonly buildings = new BuildingBatches()
  batchBuildings = true
  get pendingBuildingBatches(): boolean {
    return this.batchBuildings && this.buildings.pending
  }
  private materialSetup?: (material: THREE.Material) => void
  private readonly landcover = new LandcoverBatches()
  private readonly mapBounds = new Map<string, THREE.Sphere>()
  readonly objects = new Map<string, THREE.Group>()
  readonly sprites = new Map<string, THREE.Sprite | UprightBillboard>()
  private readonly spritePixels = new Map<string, ImageData>()
  private readonly spriteImages = new Map<
    string,
    Promise<{ texture: THREE.Texture; pixels: ImageData }>
  >()
  readonly portals = new Map<string, PortalSurface>()
  readonly wheels = new Map<string, THREE.Group[]>()
  readonly steering = new Map<string, THREE.Group>()
  private readonly steeringAxes = new Map<string, THREE.Vector3>()
  /** Spin pivot declared by the steering GLB (`extras.nabla.spinPivot`), when it has one. */
  private readonly steeringPivots = new Map<string, THREE.Vector3>()
  /** Per vehicle: the group between the authored mount and the spin group, and its model. */
  private readonly steeringAdjust = new Map<
    string,
    { adjust: THREE.Group; mount: THREE.Group; model: string }
  >()
  /** Driver adjustments by steering model (its GLB URL); absent models stay where the GLB puts them. */
  private readonly steeringOffsets = new Map<string, SteeringWheelOffset>()
  /** Models whose starting adjustment was already resolved (from the option or a setter). */
  private readonly steeringModels = new Set<string>()
  /** Per vehicle with mirrors: its mirror model (`mirrorModelKey`). */
  private readonly mirrorModels = new Map<string, string>()
  /** Glass adjustments by mirror model; absent models keep the authored aim. */
  private readonly mirrorAdjustments = new Map<string, MirrorAdjustment>()
  /** Mirror models whose starting adjustment was already resolved. */
  private readonly mirrorModelsResolved = new Set<string>()
  readonly ramps = new Map<string, THREE.Group>()
  readonly ready: Promise<void>
  private readonly loading: Promise<void>[] = []
  private disposed = false
  private pendingMapMeshes: Entity[] = []
  private readonly mapInstallEye = new THREE.Vector3()
  readonly avatar = new THREE.Group()
  private readonly monitor = createMonitorAvatar()
  private readonly monitorMotion = new MonitorMotion()
  private readonly avatarFollow = new AvatarFollow()
  private readonly ejectionTumble = new EjectionTumble()
  private graph: SceneGraph
  constructor(
    readonly document: SceneDocument,
    experimentalLargeScene = false,
    validated = false,
    private readonly options: SceneViewOptions = {},
  ) {
    if (options.startLights) this.startLights.mode = options.startLights
    this.graph = SceneGraph.fromValidated(
      validated ? document : parseScene(document, experimentalLargeScene),
    )
    const immediate = document.entities.filter((e) => !isMapEnvironment(e) || e.mapEditable)
    this.pendingMapMeshes = document.entities.filter((e) => isMapEnvironment(e) && !e.mapEditable)
    const priority = (e: Entity) =>
      e.terrain ? 0 : e.road ? 1 : e.kind === 'group' && !e.sprite ? 2 : 3
    this.pendingMapMeshes.sort((a, b) => priority(a) - priority(b))
    this.addEntities(immediate)
    this.root.add(this.roads.root)
    this.root.add(this.buildings.root)
    this.root.add(this.landcover.root)
    this.avatar.add(this.monitor)
    this.avatar.visible = false
    this.root.add(this.avatar, this.vehicleLights.root)
    this.root.add(this.tracers.root, this.sparks.root, this.laser.root)
    this.ready = Promise.all(this.loading).then(() => undefined)
  }
  /** A known pose-only edit; preserve all unrelated entities and render batches. */
  updateEntityPose(entity: Entity): void {
    const affected = new Set([entity.id])
    const children = new Map<string, string[]>()
    for (const e of this.document.entities)
      if (e.parentId) {
        const list = children.get(e.parentId) ?? []
        list.push(e.id)
        children.set(e.parentId, list)
      }
    for (const id of affected) for (const child of children.get(id) ?? []) affected.add(child)
    this.document.entities = this.document.entities.map((e) =>
      e.id === entity.id ? entity : affected.has(e.id) ? { ...e } : e,
    )
    this.graph = SceneGraph.fromValidated(this.document)
    for (const id of affected) {
      const object = this.objects.get(id)
      if (object) applyPose(object, this.graph.worldTransform(id))
      this.mapBounds.delete(id)
    }
    const entities = new Map(this.document.entities.map((e) => [e.id, e]))
    this.pendingMapMeshes = this.pendingMapMeshes.map((e) =>
      affected.has(e.id) ? entities.get(e.id)! : e,
    )
  }
  private simulated = false
  /** Keep installed meshes and the streaming queue for pose-only editor changes. */
  updateEditorPoses(next: SceneDocument): boolean {
    // Simulation reparents wheels and mutates runtime equipment/portal state.
    // Hiding the avatar (cockpit or Stop) does not restore the authored scene.
    if (this.simulated) return false
    const { entities: previousEntities, ...previousSettings } = this.document
    const { entities: nextEntities, ...nextSettings } = next
    if (
      JSON.stringify(previousSettings) !== JSON.stringify(nextSettings) ||
      previousEntities.length !== nextEntities.length
    )
      return false
    const unchangedShape = (entity: Entity) => {
      const { transform, geoAnchor, name, ...shape } = entity
      return JSON.stringify(shape)
    }
    for (let i = 0; i < nextEntities.length; i++)
      if (unchangedShape(previousEntities[i]) !== unchangedShape(nextEntities[i])) return false
    const nextGraph = SceneGraph.fromValidated(next)
    const entities = nextEntities.map((entity, i) => {
      const previous = previousEntities[i]
      const pose = nextGraph.worldTransform(entity.id)
      const moved = JSON.stringify(this.graph.worldTransform(entity.id)) !== JSON.stringify(pose)
      const object = this.objects.get(entity.id)
      if (object) applyPose(object, pose)
      if (moved) this.mapBounds.delete(entity.id)
      // Stable identity keeps unrelated road/building batches installed.
      return !moved && JSON.stringify(previous) === JSON.stringify(entity) ? previous : entity
    })
    this.document.entities = entities
    this.graph = nextGraph
    const byId = new Map(entities.map((e) => [e.id, e]))
    this.pendingMapMeshes = this.pendingMapMeshes.map((e) => byId.get(e.id)!)
    return true
  }
  replaceMapEntities(remove: Set<string>, add: Entity[]): void {
    this.pendingMapMeshes = this.pendingMapMeshes.filter((e) => !remove.has(e.id))
    for (const id of remove) {
      const object = this.objects.get(id)
      if (object) {
        this.impacts.removeFor(object)
        object.removeFromParent()
        disposeObject(object)
      }
      this.objects.delete(id)
      this.mapBounds.delete(id)
      this.sprites.delete(id)
      this.spritePixels.delete(id)
    }
    this.document.entities = [
      ...this.document.entities.filter((e) => !remove.has(e.id)),
      ...structuredClone(add),
    ]
    this.graph = SceneGraph.fromValidated(this.document)
    // Even empty THREE.Groups are installed in the frame budget, not in one large burst.
    this.pendingMapMeshes.push(...add)
    const priority = (e: Entity) => (e.terrain ? 0 : e.road ? 1 : isMapBuilding(e) ? 2 : 3)
    const distances = new Map(
      this.pendingMapMeshes.map((e) => {
        const pose = this.graph.worldTransform(e.id).position,
          p = { x: pose[0], z: pose[2] },
          local = e.geometry?.vertices[0] ?? [0, 0, 0]
        return [
          e.id,
          Math.hypot(p.x + local[0] - this.mapInstallEye.x, p.z + local[2] - this.mapInstallEye.z),
        ]
      }),
    )
    this.pendingMapMeshes.sort(
      (a, b) => priority(a) - priority(b) || distances.get(a.id)! - distances.get(b.id)!,
    )
    // Resource promises are consumed per batch rather than retained for the whole journey.
    void Promise.all(this.loading.splice(0)).catch(() => undefined)
  }
  /** A soft CPU budget; one indivisible mesh may exceed it. Call once per main frame. */
  /** Map meshes (roads, cover) still waiting for `flushMapInstall`. */
  get pendingMapInstalls(): number {
    return this.pendingMapMeshes.length
  }
  flushMapInstall(budgetMs = 4, maxEntities = 24, eye?: THREE.Vector3): number {
    if (eye) this.mapInstallEye.copy(eye)
    const started = performance.now()
    let count = 0
    while (
      this.pendingMapMeshes.length &&
      count < maxEntities &&
      (count === 0 || performance.now() - started < budgetMs)
    ) {
      const e = this.pendingMapMeshes.shift()!
      this.addEntities([e])
      const group = this.objects.get(e.id)!
      if (
        this.avatar.visible &&
        e.kind === 'group' &&
        !e.portal &&
        !e.sprite &&
        !e.road &&
        !e.placeLabel
      )
        group.visible = false
      this.mapBounds.delete(e.id)
      if (this.materialSetup)
        group.traverse((object) => {
          if (object instanceof THREE.Mesh)
            for (const material of Array.isArray(object.material)
              ? object.material
              : [object.material])
              if (material instanceof THREE.MeshStandardMaterial) this.materialSetup!(material)
        })
      count++
    }
    if (count) this.document.entities = [...this.document.entities]
    void Promise.all(this.loading.splice(0)).catch(() => undefined)
    return count
  }
  /**
   * Install vehicles added while the scene is running (the game menu spawns cars and trucks).
   * The entities join the shared document; pair with `Simulation.addVehicles`.
   */
  addVehicles(added: Entity[]): void {
    const vehicles = added.filter((e) => !e.portal)
    // Hosted mouths (the carrier stern portal) follow their vehicle: the carrier maps its
    // portal monitor to them, so they join the document before the meshes are built.
    const mouths = added.filter((e) => e.portal)
    for (const e of vehicles) {
      if (e.kind !== 'vehicle' || !e.vehicle)
        throw new Error(`Entity ${e.id} is not a plain vehicle`)
      if (this.document.entities.some((o) => o.id === e.id))
        throw new Error(`Entity id already in use: ${e.id}`)
    }
    assertHostedMouths(mouths, vehicles, new Map(this.document.entities.map((e) => [e.id, e])))
    this.document.entities = [...this.document.entities, ...vehicles, ...mouths]
    this.graph = SceneGraph.fromValidated(this.document)
    this.addEntities([...vehicles, ...mouths])
    void Promise.all(this.loading.splice(0)).catch(() => undefined)
  }
  /**
   * Install scenery placed while running: standalone portals (Stargate frame), sprites, lamps and
   * static boxes. The entities join the shared document; pair with `Simulation.addPlaced`.
   */
  addPlaced(added: Entity[]): void {
    assertPlaceable(added, new Map(this.document.entities.map((e) => [e.id, e])))
    this.document.entities = [...this.document.entities, ...added]
    this.graph = SceneGraph.fromValidated(this.document)
    this.addEntities(added)
    if (this.materialSetup)
      for (const entity of added)
        this.registerMaterials(this.objects.get(entity.id)!, this.materialSetup)
    void Promise.all(this.loading.splice(0)).catch(() => undefined)
  }
  /** Remove entities installed by `addPlaced`, releasing meshes, portal targets and lamp lights. */
  removePlaced(ids: readonly string[]): void {
    const removing = new Set(ids)
    for (const id of ids) {
      this.portals.get(id)?.target.dispose()
      this.streetlights.remove(id)
      const object = this.objects.get(id)
      if (object) {
        this.impacts.removeFor(object)
        object.removeFromParent()
        disposeObject(object)
      }
      for (const map of [this.objects, this.portals, this.portalTablets, this.sprites] as Map<
        string,
        unknown
      >[])
        map.delete(id)
      this.spritePixels.delete(id)
    }
    this.document.entities = this.document.entities.filter((e) => !removing.has(e.id))
    this.graph = SceneGraph.fromValidated(this.document)
  }
  /** Remove a vehicle installed by `addVehicles`, releasing its meshes and per-vehicle equipment. */
  removeVehicle(id: string): void {
    const group = this.objects.get(id)
    for (const wheel of this.wheels.get(id) ?? []) {
      wheel.removeFromParent()
      disposeObject(wheel)
    }
    this.carMirrors.get(id)?.dispose()
    this.mirrorModels.delete(id)
    this.instruments.get(id)?.dispose()
    this.motorcycleClusters.get(id)?.dispose()
    this.shipHuds.get(id)?.dispose()
    this.authoredLights.get(id)?.dispose()
    if (group) {
      group.removeFromParent()
      disposeObject(group)
    }
    for (const map of [
      this.objects,
      this.wheels,
      this.steering,
      this.steeringAxes,
      this.steeringPivots,
      this.steeringAdjust,
      this.thrusters,
      this.shipLights,
      this.beacons,
      this.carLights,
      this.carMirrors,
      this.instruments,
      this.propellers,
      this.shipHuds,
      this.helmScreens,
      this.touchScreens,
      this.flightScreens,
      this.portalTablets,
      this.placeScreens,
      this.systemScreens,
      this.headOffsets,
      this.riderShifts,
      this.riderTucks,
      this.riderHeadEase,
      this.authoredLights,
      this.landingGear,
      this.motorcycleRigs,
      this.motorcycleClusters,
      this.reflections,
      this.odometers,
      this.ramps,
      this.mapBounds,
    ] as Map<string, unknown>[])
      map.delete(id)
    // Hosted mouths (the carrier stern portal) leave with their vehicle.
    const mouths = this.document.entities.filter((e) => e.parentId === id && e.portal)
    for (const mouth of mouths) {
      this.portals.get(mouth.id)?.target.dispose()
      const object = this.objects.get(mouth.id)
      if (object) {
        object.removeFromParent()
        disposeObject(object)
      }
      this.portals.delete(mouth.id)
      this.objects.delete(mouth.id)
      this.portalTablets.delete(mouth.id)
    }
    this.document.entities = this.document.entities.filter(
      (e) => e.id !== id && !mouths.includes(e),
    )
    this.graph = SceneGraph.fromValidated(this.document)
  }
  get pendingMapInstall(): number {
    return this.pendingMapMeshes.length
  }
  private addEntities(entities: Entity[]): void {
    for (const e of entities) {
      const group = this.objects.get(e.id) ?? new THREE.Group()
      group.userData.entityId = e.id
      group.userData.mapArtifact = entityMapArtifact(e)
      this.objects.set(e.id, group)
      this.root.add(group)
      applyPose(group, this.graph.worldTransform(e.id))
      if (e.portal) {
        const portal = createPortalSurface(e)
        this.portals.set(e.id, portal)
        group.add(portal.mesh)
        portal.mesh.visible = !e.parentId || e.portal.mode !== 'closed'
        const [w, h, d] = e.size
        if (!e.parentId)
          this.addAsset(
            group,
            {
              url: '/library/portals/portal.frame.glb',
              transform: { position: [0, -(h + 2 * PORTAL_BAR) / 2, 0], rotation: [0, 0, 0, 1] },
            },
            undefined,
            (model) => {
              model.scale.set((w + 2 * PORTAL_BAR) / 3.436068, (h + 2 * PORTAL_BAR) / 2.2, d / 0.08)
            },
          )
        const light = mesh(
          new THREE.BoxGeometry(w * 0.7, 0.035, 0.02),
          e.portal.mode === 'open' ? '#5bacff' : e.portal.mode === 'window' ? '#accbff' : '#354254',
        )
        light.position.set(0, h / 2 + PORTAL_BAR / 2, d / 2 + 0.015)
        light.name = 'Portal status'
        group.add(light)
        if (!e.parentId) {
          const back = new THREE.Mesh(
            new THREE.PlaneGeometry(w, h),
            new THREE.MeshBasicMaterial({ color: '#08090b' }),
          )
          back.position.z = -d / 2
          back.rotation.y = Math.PI
          group.add(back)
          const tablet = box([0.62, 0.44, 0.008], '#050608')
          tablet.position.set(0, -0.24, -d / 2 - 0.004)
          group.add(tablet)
          const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(0.58, 0.4),
            new THREE.MeshBasicMaterial({ color: '#030405' }),
          )
          screen.position.set(0, -0.24, -d / 2 - 0.0082)
          screen.rotation.y = Math.PI
          group.add(screen)
          this.portalTablets.set(e.id, [screen])
        }
      }
      if (e.sprite) {
        const options = {
          color: /^\/sprites\/tree(?:-\d+)?\.png$/.test(e.sprite.url) ? '#c5d2b9' : '#ffffff',
          alphaTest: 0.1,
          transparent: false,
          depthWrite: true,
        }
        const material = e.sprite.upright
          ? new THREE.MeshBasicMaterial({ ...options, side: THREE.DoubleSide })
          : new THREE.SpriteMaterial(options)
        if (material instanceof THREE.MeshBasicMaterial)
          softenFoliage(material, e.sprite.saturation ?? 1)
        const sprite =
          material instanceof THREE.MeshBasicMaterial
            ? new UprightBillboard(material)
            : new THREE.Sprite(material)
        if (sprite instanceof THREE.Sprite) sprite.center.set(0.5, 0)
        // Keep overhead-facing billboards above the ground image overlay.
        sprite.position.y = 0.02
        sprite.scale.set(e.size[0], e.size[1], 1)
        sprite.userData.entityId = e.id
        group.add(sprite)
        this.sprites.set(e.id, sprite)
        const url = e.sprite.url
        if (!this.spriteImages.has(url)) {
          this.spriteImages.set(
            url,
            new Promise((resolve, reject) => {
              new THREE.TextureLoader().load(
                url,
                (texture) => {
                  texture.colorSpace = THREE.SRGBColorSpace
                  const canvas = window.document.createElement('canvas')
                  canvas.width = texture.image.width
                  canvas.height = texture.image.height
                  const context = canvas.getContext('2d')!
                  context.drawImage(texture.image, 0, 0)
                  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
                  if (this.disposed) texture.dispose()
                  else this.surfaceTextures.push(texture)
                  resolve({ texture, pixels })
                },
                undefined,
                reject,
              )
            }),
          )
        }
        this.loading.push(
          this.spriteImages.get(url)!.then(({ texture, pixels }) => {
            if (this.disposed || this.objects.get(e.id) !== group) return
            material.map = texture
            material.needsUpdate = true
            this.spritePixels.set(e.id, pixels)
            if (e.sprite!.groundShadow) {
              const shadow = new THREE.Mesh(
                new THREE.PlaneGeometry(e.size[0], e.size[1] * 0.7).translate(
                  0,
                  e.size[1] * 0.35,
                  0,
                ),
                new THREE.MeshBasicMaterial({
                  map: texture,
                  color: '#000000',
                  transparent: true,
                  opacity: 0.22,
                  depthWrite: false,
                  alphaTest: 0.02,
                  polygonOffset: true,
                  polygonOffsetFactor: -1,
                  polygonOffsetUnits: -1,
                }),
              )
              shadow.rotation.set(-Math.PI / 2, 0, -0.65)
              shadow.position.y = 0.012
              shadow.userData.decorativeShadow = true
              shadow.raycast = () => undefined
              group.add(shadow)
            }
          }),
        )
      }
      if (e.road && !e.road.renderSuppressed) {
        let g = takeMapGeometry(e)
        if (!g) {
          const t = this.document.entities.find((n) => n.id === e.road!.terrainId)!.terrain!
          const data = roadGeometry(t, e.road.paths, e.road.width, {
            elevation: e.road.elevation,
            layer: e.road.layer,
            profiled: e.road.profiled,
            mode: e.road.mode,
          })
          g = new THREE.BufferGeometry()
          g.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices.flat(), 3))
          g.setIndex(data.faces.flat())
          g.computeVertexNormals()
        }
        const layer = transportLayer(e)
        const surface = new THREE.Mesh(
          g,
          matteGroundMaterial({ color: e.color, ...groundDepthBias(layer) }),
        )
        surface.receiveShadow = true
        surface.renderOrder = layer
        const roadMaterial = surface.material as THREE.MeshStandardMaterial
        roadMaterial.side = THREE.DoubleSide
        roadMaterial.depthWrite = !footBuried(layer)
        surface.castShadow = false
        group.add(surface)
      }
      if (e.terrain) {
        let g = takeMapGeometry(e)
        if (!g) {
          g = new THREE.BufferGeometry()
          g.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(terrainVertices(e.terrain).flat(), 3),
          )
          g.setIndex(terrainIndices(e.terrain))
          g.computeVertexNormals()
        }
        if (e.terrain.colors && !g.hasAttribute('color'))
          g.setAttribute(
            'color',
            new THREE.Float32BufferAttribute(
              e.terrain.colors.flatMap((c) => new THREE.Color(c).toArray()),
              3,
            ),
          )
        const surface = new THREE.Mesh(
          g,
          castShadowFromBackFaces(
            matteGroundMaterial({
              color: e.terrain.colors ? '#ffffff' : e.color,
            }),
          ),
        )
        surface.castShadow = true
        surface.receiveShadow = true
        ;(surface.material as THREE.MeshStandardMaterial).vertexColors = !!e.terrain.colors
        group.add(surface)
      }
      if (e.geometry) {
        let geometry = takeMapGeometry(e)
        const hasRoofColor = !!(e.roofColor && e.geometry.roofFaces?.length)
        // Geometry may be pre-prepared with vertex colors (from map worker) or need generation
        if (geometry && hasRoofColor && !geometry.hasAttribute('color')) {
          geometry.dispose()
          geometry = undefined
        }
        const hasVertexColors = !!geometry?.hasAttribute('color') || hasRoofColor
        if (!geometry) {
          geometry = new THREE.BufferGeometry()
          if (hasRoofColor) {
            // Use trianglesWithRoofInfo to get roof/wall separation
            const { indices, isRoof } = trianglesWithRoofInfo(e.geometry)
            const positions: number[] = []
            const colors: number[] = []
            const wallColor = new THREE.Color(e.color)
            const roofColor = new THREE.Color(e.roofColor!)
            for (let i = 0; i < indices.length; i++) {
              const tri = indices[i]
              const color = isRoof[i] ? roofColor : wallColor
              for (const idx of tri) {
                const v = e.geometry!.vertices[idx]
                positions.push(v[0], v[1], v[2])
                colors.push(color.r, color.g, color.b)
              }
            }
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
          } else {
            geometry.setAttribute(
              'position',
              new THREE.Float32BufferAttribute(
                triangles(e.geometry).flatMap((f) => f.flatMap((i) => e.geometry!.vertices[i])),
                3,
              ),
            )
          }
          geometry.computeVertexNormals()
        }
        const material = (e.landcover || e.railway ? matteGroundMaterial : standardMaterial)({
          color: hasVertexColors ? '#ffffff' : e.color,
          roughness: 0.72,
          vertexColors: hasVertexColors,
          side: e.source ? THREE.FrontSide : THREE.DoubleSide,
        })
        const surface = new THREE.Mesh(geometry, material)
        surface.castShadow = !e.landcover && !e.railway
        surface.receiveShadow = true
        if (e.landcover || e.railway) {
          const layer = e.landcover ? SURFACE_LAYERS[e.landcover.surface] : transportLayer(e)
          material.polygonOffset = true
          material.polygonOffsetFactor = -layer
          material.polygonOffsetUnits = -layer
          surface.renderOrder = layer
        }

        group.add(surface)
      }
      if (e.kind === 'box' && !e.light) group.add(box(e.size, e.color))
      if (e.light) this.streetlights.add(e, group)
      if (e.kind === 'vehicle') {
        if (e.vehicle?.headOffset) this.headOffsets.set(e.id, e.vehicle.headOffset)
        if (e.vehicle?.interior && e.visual?.body.url.includes('ship.container')) {
          const thrusters = new CarrierThrusters()
          group.add(thrusters.root)
          this.thrusters.set(e.id, thrusters)
          const interior = carrierInterior(e.vehicle.monitorMounts)
          group.add(interior.room)
          this.shipLights.set(e.id, new ShipLights(interior.room, group))
          const hud = new ShipHud()
          interior.room.add(hud.mesh)
          this.shipHuds.set(e.id, hud)
          this.systemScreens.set(e.id, interior.screens[0])
          this.flightScreens.set(e.id, interior.screens[1])
          this.helmScreens.set(e.id, interior.screens[2])
          this.touchScreens.set(e.id, interior.touch)
          this.placeScreens.set(e.id, interior.door[1])
          for (const mouth of this.document.entities.filter((m) => m.parentId === e.id && m.portal))
            this.portalTablets.set(mouth.id, [interior.door[0]])
        }
        if (e.vehicle?.boat) {
          const hud = new ShipHud(true)
          hud.mesh.scale.set(0.7 / 4.65, 0.28 / 2.85, 1)
          hud.mesh.position.set(0, 0.78, -0.465)
          group.add(hud.mesh)
          this.shipHuds.set(e.id, hud)
        }
        if (e.visual) this.assetVehicle(e, group)
        else if (e.vehicle?.boat) this.outboard(e, group)
        else this.car(e, group)
      }
      if (e.kind === 'spawn') {
        const ring = mesh(new THREE.TorusGeometry(0.55, 0.04, 8, 40), '#79b7ff')
        ring.rotation.x = -Math.PI / 2
        ring.position.y = 0.05
        const marker = mesh(new THREE.ConeGeometry(0.18, 0.5, 4), '#79b7ff')
        marker.position.y = 0.65
        group.add(ring, marker)
      }
    }
    for (const entity of entities) {
      if (!entity.surface) continue
      const material = matteGroundMaterial({ color: '#ffffff' })
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(entity.size[0], entity.size[2]),
        material,
      )
      plane.rotation.x = -Math.PI / 2
      plane.position.y = entity.size[1] / 2 + 0.006
      plane.receiveShadow = true
      this.objects.get(entity.id)!.add(plane)
      this.loading.push(
        new Promise<void>((resolve, reject) => {
          new THREE.TextureLoader().load(
            entity.surface!.url,
            (texture) => {
              if (this.disposed) {
                texture.dispose()
                resolve()
                return
              }
              texture.colorSpace = THREE.SRGBColorSpace
              material.map = texture
              material.needsUpdate = true
              this.surfaceTextures.push(texture)
              resolve()
            },
            undefined,
            reject,
          )
        }),
      )
    }
  }
  private addAsset(
    parent: THREE.Group,
    part: VisualDefinition['body'],
    fallback?: THREE.Object3D,
    prepare?: (model: THREE.Group) => void,
  ): void {
    this.loading.push(
      assets.instantiate(part.url).then((model) => {
        if (this.disposed) {
          disposeObject(model)
          return
        }
        applyPose(model, part.transform)
        parent.add(model)
        prepare?.(model)
        if (this.materialSetup) this.registerMaterials(model, this.materialSetup)
        if (fallback) {
          fallback.removeFromParent()
          disposeObject(fallback)
        }
      }),
    )
  }
  /**
   * Live rear-view mirrors for a motorcycle GLB (`mirror_L` / `mirror_R` glass), the same as the
   * cars': cockpit-only reflections, per-side «Espejos» adjustment and `vehicle.mirrorAim` /
   * `vehicle.mirrorTilt` (0° default: the glass as modelled).
   */
  private motorcycleMirrors(model: THREE.Object3D, e: Entity): CarMirrors | undefined {
    const lenses = motorcycleMirrorLenses(model)
    if (!lenses.length) return undefined
    model.updateWorldMatrix(true, true)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(
      model.getWorldQuaternion(new THREE.Quaternion()),
    )
    return new CarMirrors(
      lenses,
      up,
      e.vehicle?.mirrorTilt ?? 0,
      this.options.mirrorPolicy,
      model.parent ?? model,
      e.vehicle?.mirrorAim,
    )
  }
  private assetVehicle(e: Entity, group: THREE.Group): void {
    const visual = e.visual!,
      definition = vehicleDefinition(e)
    const adapter = this.options.vehiclePresentation?.(e)
    const environment = applyVehicleEnvironment(group)
    this.reflections.set(e.id, environment)
    const fallback = box(e.size, e.color)
    // Kept for the swap below but never drawn: a coloured block before the GLB arrives looked broken.
    fallback.visible = false
    group.add(fallback)
    this.addAsset(group, visual.body, fallback, (model) => {
      const equipment = adapter?.mount(
        model,
        e,
        this.options.carInstruments,
        this.options.mirrorPolicy,
      )
      this.authoredLights.set(e.id, new AuthoredVehicleLights(model, equipment?.lights?.controller))
      if (e.vehicle && hasLandingGear(e.vehicle)) {
        const bounds = landingGearMeshBounds(model)
        const visual = bounds
          ? mountLandingGear(model, trailerWheelContactY(e.vehicle) - bounds.min.y)
          : undefined
        if (visual) {
          visual.setDeployed(!e.vehicle.tow, 0)
          visual.update(0)
          this.landingGear.set(e.id, visual)
        }
      }
      adapter?.preparePart?.(model, 'body')
      environment.add(model)
      const twoWheeled = e.vehicle?.twoWheeled
      if (twoWheeled && hasMotorcycleRig(model))
        this.motorcycleRigs.set(
          e.id,
          bindMotorcycleRig(
            model,
            motorcycleRigFromModel(model, { steerLimit: twoWheeled.steerLimit }),
          ),
        )
      if (twoWheeled) {
        const cluster = MotorcycleInstruments.bind(model, {
          ...(e.vehicle?.powertrain?.maxRpm ? { redlineRpm: e.vehicle.powertrain.maxRpm } : {}),
          ...e.vehicle?.cluster,
        })
        if (cluster) this.motorcycleClusters.set(e.id, cluster)
      }
      if (equipment?.lights) this.carLights.set(e.id, equipment.lights)
      const mirrors =
        equipment?.mirrors ?? (twoWheeled ? this.motorcycleMirrors(model, e) : undefined)
      if (mirrors) {
        this.carMirrors.set(e.id, mirrors)
        const mirrorModel = mirrorModelKey(visual.body.url, visual.steering?.url)
        this.mirrorModels.set(e.id, mirrorModel)
        if (!this.mirrorModelsResolved.has(mirrorModel)) {
          const initial = this.options.mirrorAdjustment?.(mirrorModel)
          // The setter marks the model resolved and applies to this vehicle too.
          if (initial) this.setMirrorAdjustment(mirrorModel, initial)
          else this.mirrorModelsResolved.add(mirrorModel)
        }
        mirrors.setAdjustment(this.mirrorAdjustments.get(mirrorModel) ?? {})
      }
      if (equipment?.instruments) this.instruments.set(e.id, equipment.instruments)
      if (equipment?.beacons) {
        this.beacons.set(e.id, equipment.beacons)
        this.surfaceTextures.push(...equipment.beacons.textures)
      }
      if (e.vehicle?.plane) {
        const propeller = mountPropeller(model)
        if (propeller) this.propellers.set(e.id, propeller)
      }
      for (const name of ['Helm_Screen_1', 'Helm_Screen_2', 'Helm_Screen_3']) {
        const original = model.getObjectByName(name)
        if (original) original.visible = false
      }
      this.shipLights.get(e.id)?.mountHull(model)
      for (const part of visual.attachments ?? []) {
        this.addAsset(model, part, undefined, (attachment) => {
          adapter?.paint?.(attachment, e.color)
          adapter?.preparePart?.(attachment, 'body')
          environment.add(attachment)
          this.authoredLights.get(e.id)?.absorb(attachment)
        })
      }
      if (!visual.ramp) return
      const hinge = new THREE.Group()
      hinge.position.fromArray(visual.ramp.hinge)
      model.add(hinge)
      for (const name of visual.ramp.nodes) {
        const part = model.getObjectByName(name)
        if (!part) throw new Error('Missing ramp node: ' + name)
        hinge.attach(part)
      }
      this.ramps.set(e.id, hinge)
      this.shipLights.get(e.id)?.attachStern(hinge)
    })
    if (visual.wheel || visual.wheels) {
      const wheels = definition.hubs.map((hub, i) => {
        const wheel = new THREE.Group()
        wheel.position.fromArray(hub)
        group.add(wheel)
        const orientation = new THREE.Group()
        if (visual.wheelRotations) orientation.quaternion.fromArray(visual.wheelRotations[i])
        wheel.add(orientation)
        this.addAsset(orientation, visual.wheels?.[i] ?? visual.wheel!, undefined, (model) => {
          adapter?.preparePart?.(model, 'wheel')
          environment.add(model)
        })
        return wheel
      })
      this.wheels.set(e.id, wheels)
    }
    if (visual.steering) {
      // mount (authored anchor) → adjust (driver offset, translation only) → spin (steer angle).
      const mount = new THREE.Group(),
        adjust = new THREE.Group(),
        spin = new THREE.Group()
      adjust.name = 'steering-adjust'
      applyPose(mount, visual.steering.transform)
      adjust.add(spin)
      mount.add(adjust)
      group.add(mount)
      this.addAsset(
        spin,
        {
          url: visual.steering.url,
          transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
        },
        undefined,
        (model) => {
          adapter?.preparePart?.(model, 'steering')
          environment.add(model)
          const pivot = steeringPivot(model)
          if (pivot) this.steeringPivots.set(e.id, pivot)
        },
      )
      this.steering.set(e.id, spin)
      this.steeringAxes.set(e.id, steeringAxis(visual.steering.axis))
      const model = visual.steering.url
      this.steeringAdjust.set(e.id, { adjust, mount, model })
      if (!this.steeringModels.has(model)) {
        const initial = this.options.steeringWheelOffset?.(model)
        // The setter marks the model resolved and applies to this vehicle too.
        if (initial) this.setSteeringWheelOffset(model, initial)
        else this.steeringModels.add(model)
      }
      this.applySteeringOffset(e.id)
    }
  }
  private outboard(e: Entity, group: THREE.Group): void {
    const hull = box([2.05, 0.48, 5.35], e.color)
    hull.position.y = -0.16
    const bow = box([1.15, 0.36, 1.15], e.color)
    bow.position.set(0, -0.08, -2.55)
    const tube = (x: number) => {
      const side = box([0.28, 0.32, 5.7], '#f7f8f6')
      side.position.set(x, 0.02, 0)
      return side
    }
    const console = box([1.15, 0.62, 0.85], '#24343c')
    console.position.set(0, 0.42, -0.15)
    const screen = box([0.7, 0.28, 0.06], '#1a2830')
    screen.position.set(0, 0.78, -0.5)
    const motor = box([0.32, 0.72, 0.42], '#1c242b')
    motor.position.set(0, 0.05, 2.72)
    const leg = box([0.12, 0.55, 0.12], '#2a343c')
    leg.position.set(0, -0.35, 2.72)
    group.add(hull, bow, tube(-1.02), tube(1.02), console, screen, motor, leg)
  }
  private car(e: Entity, group: THREE.Group): void {
    const [w, h, l] = e.size
    const body = box(e.size, e.color)
    const cabin = box([w * 0.83, 0.63, l * 0.45], '#273d49')
    cabin.position.set(0, h / 2 + 0.25, l * 0.045)
    const roof = box([w * 0.84, 0.08, l * 0.46], e.color)
    roof.position.copy(cabin.position).y += 0.34
    group.add(body, cabin, roof)
    for (const x of [-w * 0.32, w * 0.32]) {
      const light = box([0.32, 0.12, 0.045], '#fff0cb')
      light.position.set(x, 0.06, -l / 2 - 0.025)
      const tail = box([0.32, 0.1, 0.045], '#db6a5f')
      tail.position.set(x, 0.06, l / 2 + 0.025)
      group.add(light, tail)
    }
    const wheels: THREE.Group[] = []
    for (const [x, z] of [
      [-w / 2, -l * 0.32],
      [w / 2, -l * 0.32],
      [-w / 2, l * 0.32],
      [w / 2, l * 0.32],
    ]) {
      const geometry = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 20)
      geometry.rotateZ(Math.PI / 2)
      const wheel = mesh(geometry, '#202b33')
      const hub = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.251, 12), '#afbbc0', 0.4)
      hub.rotation.z = Math.PI / 2
      wheel.add(hub)
      wheel.position.set(x, -h * 0.3 - 0.35, z)
      group.add(wheel)
      const wrapper = new THREE.Group()
      wrapper.position.copy(wheel.position)
      wheel.position.set(0, 0, 0)
      wrapper.add(wheel)
      group.add(wrapper)
      wheels.push(wrapper)
    }
    this.wheels.set(e.id, wheels)
  }
  private mapOmissions = new Set<string>()
  private omittedMeshes = new Map<THREE.Object3D, boolean>()
  private mapRenderSource?: Entity[]
  private mapRenderEntities?: Entity[]
  setMapRenderOmissions(ids: ReadonlySet<string>): void {
    if (ids.size === this.mapOmissions.size && [...ids].every((id) => this.mapOmissions.has(id)))
      return
    for (const [mesh, visible] of this.omittedMeshes) mesh.visible = visible
    this.omittedMeshes.clear()
    for (const id of this.mapOmissions) {
      const object = this.objects.get(id)
      if (object) object.visible = true
    }
    this.mapOmissions = new Set(ids)
    this.mapRenderSource = undefined
  }
  /** Distance culling is repeated for portal cameras, never shared from the main frustum. */
  buildingDistance = 3000
  limitDrawDistance(
    position: THREE.Vector3,
    distance: number,
    enabled: boolean,
    buildings = true,
    roadDistance = distance,
    now = performance.now(),
  ): void {
    if (this.mapRenderSource !== this.document.entities) {
      this.mapRenderSource = this.document.entities
      this.mapRenderEntities = this.mapOmissions.size
        ? this.document.entities.filter((e) => !this.mapOmissions.has(e.id))
        : this.document.entities
    }
    this.buildings.update(
      this.mapRenderEntities!,
      this.objects,
      buildings && this.batchBuildings,
      position,
      Math.min(distance, this.buildingDistance),
    )
    this.roads.update(this.mapRenderEntities!, this.objects, enabled, position, roadDistance)
    this.landcover.update(this.mapRenderEntities!, this.objects, enabled, position, distance, now)
    for (const e of this.document.entities) {
      if (this.mapOmissions.has(e.id)) {
        const object = this.objects.get(e.id)
        if (object) {
          object.visible = true
          object.traverse((child) => {
            if (
              child instanceof THREE.Mesh &&
              child.name !== 'shot-impact' &&
              child.parent?.name !== 'shot-impact'
            ) {
              if (!this.omittedMeshes.has(child)) this.omittedMeshes.set(child, child.visible)
              child.visible = false
            }
          })
        }
        continue
      }
      if (!e.source || e.motion === 'dynamic' || e.portal) continue
      const object = this.objects.get(e.id)
      if (!object) continue // A streamed frame may still be queued.
      if (isMapBuilding(e)) {
        // Keep the entity frame alive for picking and attached bullet marks.
        for (const child of object.children)
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial)
            child.visible = !this.buildings.covers(e.id)
      }
      if ((enabled && (e.road || e.railway || e.landcover)) || (isMapBuilding(e) && !buildings)) {
        object.visible = false
        continue
      }
      let bounds = this.mapBounds.get(e.id)
      if (!bounds) {
        object.updateWorldMatrix(true, true)
        bounds = new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere())
        // Store absolute coordinates even while the render origin is rebased.
        bounds.center.sub(this.root.position)
        this.mapBounds.set(e.id, bounds)
      }
      object.visible =
        !enabled ||
        withinMapDistance(
          bounds.center,
          position,
          bounds.radius,
          isMapBuilding(e) ? Math.min(distance, this.buildingDistance) : distance,
        )
    }
  }
  setPlaying(playing: boolean): void {
    if (playing) this.simulated = true
    this.avatar.visible = playing
    if (!playing) {
      this.impacts.clear()
      this.tracers.clear()
      this.sparks.clear()
      this.laser.clear()
    }
    if (!playing) for (const thrusters of this.thrusters.values()) thrusters.root.visible = false
    for (const e of this.document.entities)
      if (
        e.kind === 'spawn' ||
        (e.kind === 'group' && !e.portal && !e.sprite && !e.road && !e.placeLabel)
      ) {
        const object = this.objects.get(e.id)
        if (object) object.visible = !playing
      }
  }
  sync(sim: Simulation, elapsed = 1 / 60, cockpit = false, headYaw = 0, headPitch = 0.05): void {
    this.simulated = true
    for (const e of this.document.entities) {
      if (e.terrain || (e.source && e.motion !== 'dynamic' && !e.portal)) continue
      const object = this.objects.get(e.id)
      if (!object) continue
      applyPose(object, sim.entityTransform(e.id, true))
      if (e.portal) {
        e.portal = sim.portalState(e.id)
        const surface = this.portals.get(e.id)!
        // A closed carrier mouth is the ramp. The black quad only shows once the gate is linked.
        surface.mesh.visible = !e.parentId || e.portal.mode !== 'closed'
        const light = this.objects.get(e.id)!.getObjectByName('Portal status') as THREE.Mesh<
          THREE.BoxGeometry,
          THREE.MeshStandardMaterial
        >
        if (e.parentId) light.visible = surface.mesh.visible
        light.material.color.set(e.portal.mode === 'open' ? '#5bacff' : '#354254')
      }
    }
    for (const [id, wheels] of this.wheels) {
      const poses = sim.wheelTransforms(id, true)
      poses.forEach((p, i) => {
        // Wheel snapshots are in world space; render beneath an identity root.
        this.root.add(wheels[i])
        applyPose(wheels[i], p)
      })
    }
    for (const [id, rig] of this.motorcycleRigs) {
      const pose = sim.twoWheeledPose(id)
      if (pose) {
        rig.update(pose)
        // The head eases towards the rider's shift and tuck rather than snapping to them.
        const ease = easeRiderHead(
          this.riderHeadEase.get(id),
          [pose.riderShift[0], pose.riderShift[1], pose.tuck],
          gameCameraDefaults.riderHeadResponse,
          elapsed,
        )
        this.riderHeadEase.set(id, ease)
        this.riderShifts.set(id, [ease.value[0], ease.value[1]])
        this.riderTucks.set(id, ease.value[2])
      }
    }
    const nightLevel = vehicleAppearanceDefaults.environment.nightLevel
    const environmentLevel = nightLevel + (1 - nightLevel) * this.daylight
    for (const reflection of this.reflections.values())
      reflection.setLevel(environmentLevel * this.reflectionScale)
    if (this.motorcycleClusters.size) {
      const clockMinutes = localMinutes(skyTime(this.document.sky ?? { mode: 'live' }))
      const lampNow = performance.now()
      for (const [id, cluster] of this.motorcycleClusters) {
        const info = sim.vehicleInfo(id)
        const powered = sim.player.vehicleId === id
        const km =
          (this.odometers.get(id) ?? 0) + (Math.abs(info.speedKmh) * Math.min(elapsed, 0.25)) / 3600
        this.odometers.set(id, km)
        const controller = this.authoredLights.get(id)?.controller
        const lamp = { powered, braking: false, reversing: false }
        cluster.update({
          powered,
          ignition: info.ignition,
          gaugeSweep: info.gaugeSweep,
          speedKmh: info.speedKmh,
          rpm: info.rpm,
          gear: info.gear,
          parked: info.parked,
          highBeam: !!controller && controller.level('high', 0, lamp, lampNow) > 0,
          signalLeft: !!controller && controller.level('signal', -1, lamp, lampNow) > 0,
          signalRight: !!controller && controller.level('signal', 1, lamp, lampNow) > 0,
          clockMinutes,
          odometerKm: km,
          tripKm: km,
        })
      }
    }
    for (const [id, thrusters] of this.thrusters) {
      const info = sim.vehicleInfo(id)
      thrusters.update(!!info.flightMode, info.speedKmh, elapsed, performance.now(), this.night)
    }
    for (const lights of this.shipLights.values()) lights.update(performance.now())
    const lightNow = performance.now()
    const occupied = sim.player.vehicleId
    this.startLights.update(
      occupied,
      occupied ? sim.vehicleInfo(occupied) : null,
      occupied
        ? (this.carLights.get(occupied)?.controller ??
            this.authoredLights.get(occupied)?.controller)
        : undefined,
    )
    for (const [id, lights] of this.authoredLights) {
      const info = sim.vehicleInfo(id)
      const tractor = info.towVehicleId
      const source = tractor ? sim.vehicleInfo(tractor) : info
      const controller = tractor ? this.authoredLights.get(tractor)?.controller : lights.controller
      lights.apply(
        {
          powered: (tractor ?? id) === sim.player.vehicleId,
          braking: source.braking,
          reversing: source.reversing,
        },
        lightNow,
        controller,
      )
    }
    const now = performance.now()
    for (const [id, gear] of this.landingGear) {
      gear.setDeployed(sim.vehicleInfo(id).landingGear, now)
      gear.update(now)
    }
    for (const [id, ramp] of this.ramps) ramp.rotation.x = sim.vehicleInfo(id).rampAngle
    for (const [id, wheel] of this.steering)
      poseSteeringWheel(
        wheel,
        this.steeringAxes.get(id)!,
        sim.vehicleInfo(id).steer,
        this.steeringPivots.get(id),
      )
    for (const [id, propeller] of this.propellers)
      propeller.rotation.z += sim.vehicleInfo(id).engine * 78 * Math.min(elapsed, 0.05)
    for (const [id, equipment] of this.beacons)
      equipment.update(performance.now(), sim.player.vehicleId === id)
    for (const [id, lights] of this.carLights) {
      const info = sim.vehicleInfo(id)
      lights.update(
        { powered: sim.player.vehicleId === id, braking: info.braking, reversing: info.reversing },
        lightNow,
        this.night,
      )
    }
    for (const [id, instruments] of this.instruments) {
      instruments.setPowered(sim.player.vehicleId === id)
      instruments.setSecondary(!cockpit)
      if (sim.player.vehicleId === id) {
        const info = sim.vehicleInfo(id)
        instruments.update(
          this.document,
          sim.entityTransform(id, true),
          sim.vehicleInfo(id, true).speedKmh,
          performance.now(),
          info.rpm,
          info.gear,
          info.engineLoad,
          info.manualTransmission,
          info.parked,
          info.altitude,
          info.gaugeSweep,
          info.engineModes && info.engineMode === 'beast',
        )
      }
    }
    this.captureOccupiedLights(sim.player.vehicleId)
    const vehicleId = sim.player.vehicleId
    this.updateRideSmoothing(sim, vehicleId, elapsed)
    setMonitorSunglasses(this.monitor, !this.night)
    if (!cockpit) updateMonitorAvatar(this.monitor, elapsed, !!vehicleId)
    if (vehicleId) {
      const info = sim.vehicleInfo(vehicleId, true)
      const head = driverHeadPose(
        info.driver,
        sim.entityTransform(vehicleId, true).rotation,
        info.isCarrier,
        headYaw,
        headPitch,
        this.vehicleHeadOffset(vehicleId),
        this.document.entities.find((entity) => entity.id === vehicleId)?.vehicle?.headRotation,
      )
      // The seated avatar soaks up the bounce like a body on its own suspension.
      this.rideSmoothing.apply(vehicleId, head.position, head.quaternion)
      this.avatar.position.copy(head.position)
      this.avatar.quaternion.copy(head.quaternion)
      this.monitor.position.set(0, 0, 0)
      this.monitor.quaternion.identity()
      this.monitor.scale.setScalar(0.7)
      this.monitorMotion.reset()
      this.avatarFollow.reset()
      this.avatar.visible = !cockpit
    } else {
      // Smoothed like the cameras (no lag at steady speed); a thrown rider tumbles.
      this.avatarFollow.update(
        new THREE.Vector3().fromArray(sim.renderPlayerPosition),
        sim.player.yaw,
        elapsed,
      )
      this.avatar.position.copy(this.avatarFollow.position)
      const frame = new THREE.Quaternion().fromArray(sim.playerFrame?.rotation ?? [0, 0, 0, 1])
      this.avatar.quaternion
        .copy(frame)
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            this.avatarFollow.heading,
          ),
        )
      this.monitor.scale.setScalar(0.825)
      this.monitorMotion.update(
        this.monitor,
        sim.playerFrame
          ? this.avatar.position
              .clone()
              .sub(new THREE.Vector3(...sim.playerFrame.position))
              .applyQuaternion(new THREE.Quaternion(...sim.playerFrame.rotation).invert())
          : this.avatar.position,
        this.avatarFollow.heading,
        elapsed,
      )
      if (sim.options.playerMode === 'hover') this.monitor.position.y -= 0.35
      this.ejectionTumble.update(
        this.monitor,
        sim.playerEjection,
        this.avatarFollow.velocity.clone().applyQuaternion(this.avatar.quaternion.clone().invert()),
        elapsed,
        sim.options.playerMode === 'hover' ? 0 : simulationDefaults.playerHalfHeight - 0.2,
      )
      this.avatar.visible = !cockpit
    }
  }
  /**
   * Advance the ride smoothing with the player's vehicle. Crashes, a fallen bike, rollovers and
   * flight follow the real pose exactly (and restart the filter).
   */
  private updateRideSmoothing(sim: Simulation, vehicleId: string | null, elapsed: number): void {
    if (!vehicleId) {
      this.rideSmoothing.reset()
      return
    }
    const entity = this.document.entities.find((e) => e.id === vehicleId)
    const transform = sim.entityTransform(vehicleId, true)
    const pose = sim.twoWheeledPose(vehicleId)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(
      new THREE.Quaternion().fromArray(transform.rotation),
    )
    const bypass =
      sim.vehicleInfo(vehicleId).flightMode ||
      (pose ? pose.crashed || pose.fallen : up.y < Math.cos(THREE.MathUtils.degToRad(40)))
    this.rideSmoothing.update(
      vehicleId,
      transform.position,
      transform.rotation,
      elapsed,
      entity ? rideSmoothingSettings(entity) : rideSmoothingDefaults.off,
      bypass,
    )
  }
  hitSprite(ray: THREE.Raycaster): THREE.Intersection | undefined {
    const renderOffset = this.root.position.clone()
    this.root.position.set(0, 0, 0)
    this.root.updateMatrixWorld(true)
    const hit = ray.intersectObjects([...this.sprites.values()], false).find((hit) => {
      if (!hit.object.visible || !hit.uv) return false
      const pixels = this.spritePixels.get(hit.object.userData.entityId as string)
      if (!pixels) return false
      const x = Math.min(pixels.width - 1, Math.max(0, Math.floor(hit.uv.x * pixels.width)))
      const y = Math.min(pixels.height - 1, Math.max(0, Math.floor((1 - hit.uv.y) * pixels.height)))
      return pixels.data[(y * pixels.width + x) * 4 + 3] >= 26
    })
    this.root.position.copy(renderOffset)
    this.root.updateMatrixWorld(true)
    return hit
  }
  private readonly surfaceTextures: THREE.Texture[] = []
  signal(id: string, side: number): void {
    this.authoredLights.get(id)?.controller.toggleSignal(side)
  }
  /**
   * Footpeg scrape sparks: while a two-wheeler is down on its peg (`TwoWheeledPose.scrape`), the
   * bullet-impact sparks (`sparks`) stream from the touching point on the inside of the turn,
   * about 30 bursts a second. They carry part of the machine's velocity, so they trail behind it,
   * and grow with the scrape (speed). `now` is the same clock as `sparks.update`, ms.
   */
  scrapeSparks(sim: Simulation, now: number): void {
    for (const id of this.motorcycleRigs.keys()) {
      const pose = sim.twoWheeledPose(id)
      const group = this.objects.get(id)
      const last = this.scrapeEmitters.get(id)
      if (!pose || !group || !pose.scrapePoint || !(pose.scrape > 0)) {
        if (last) this.scrapeEmitters.delete(id)
        continue
      }
      group.updateWorldMatrix(true, false)
      const point = group.localToWorld(new THREE.Vector3(...pose.scrapePoint))
      if (last && now - last.time < 33) continue
      const velocity =
        last && now > last.time
          ? point
              .clone()
              .sub(last.point)
              .multiplyScalar(1000 / (now - last.time))
          : new THREE.Vector3()
      // Up and out of the turn, away from the bike.
      const outward = new THREE.Vector3(Math.sign(pose.scrapePoint[0]), 0, 0)
        .transformDirection(group.matrixWorld)
        .setY(0)
      const normal = outward
        .multiplyScalar(0.6)
        .add(new THREE.Vector3(0, 1, 0))
        .normalize()
      this.sparks.add(
        point.toArray() as [number, number, number],
        now,
        normal.toArray() as [number, number, number],
        {
          count: 4 + 6 * pose.scrape,
          drift: velocity.multiplyScalar(0.55).toArray() as [number, number, number],
          speed: 0.6 + 0.8 * pose.scrape,
        },
      )
      this.scrapeEmitters.set(id, { time: now, point })
    }
  }
  /** Last scrape burst per vehicle: time (ms) and world point, for the spark trail velocity. */
  private readonly scrapeEmitters = new Map<string, { time: number; point: THREE.Vector3 }>()
  renderMirrors(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    vehicleId: string | null,
    now: number,
    paintSky?: (camera: THREE.PerspectiveCamera) => void,
  ): void {
    if (!this.carMirrors.size) {
      renderer.domElement.dataset.mirrorActive = 'false'
      return
    }
    // Inactive cars are processed first so diagnostics describe the occupied car.
    for (const [id, mirrors] of [...this.carMirrors].sort(
      ([a], [b]) => Number(a === vehicleId) - Number(b === vehicleId),
    ))
      mirrors.render(renderer, scene, camera, id === vehicleId, now, paintSky)
  }
  /** Traverse all materials and call the callback for CSM setup. */
  setupMaterials(callback: (material: THREE.Material) => void): void {
    this.materialSetup = callback
    this.roads.onMaterial = callback
    this.buildings.onMaterial = callback
    this.landcover.onMaterial = callback
    this.registerMaterials(this.root, callback)
  }
  private registerMaterials(
    root: THREE.Object3D,
    callback: (material: THREE.Material) => void,
  ): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.SkinnedMesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials)
        if (material instanceof THREE.MeshStandardMaterial) callback(material)
    })
  }
  private captureOccupiedLights(vehicleId: string | null): void {
    const authored = vehicleId ? this.authoredLights.get(vehicleId)?.illuminators() : undefined
    const courtesy = vehicleId ? (this.carLights.get(vehicleId)?.courtesyLights ?? []) : []
    const group = vehicleId ? this.objects.get(vehicleId) : undefined
    group?.updateWorldMatrix(true, true)
    this.vehicleLights.capture(authored?.spots ?? [], [...(authored?.points ?? []), ...courtesy])
  }
  dispose(): void {
    if (this.disposed) return
    this.streetlights.dispose()
    for (const hud of this.shipHuds.values()) hud.dispose()
    for (const mirrors of this.carMirrors.values()) mirrors.dispose()
    this.carMirrors.clear()
    for (const instruments of this.instruments.values()) instruments.dispose()
    this.instruments.clear()
    for (const lights of this.authoredLights.values()) lights.dispose()
    this.authoredLights.clear()
    this.vehicleLights.dispose()
    this.roads.dispose()
    this.buildings.dispose()
    this.landcover.dispose()
    this.impacts.dispose()
    this.tracers.dispose()
    this.sparks.dispose()
    this.laser.dispose()
    for (const portal of this.portals.values()) portal.target.dispose()
    this.portals.clear()
    this.surfaceTextures.forEach((texture) => texture.dispose())
    disposeMonitorAvatar(this.monitor)
    this.disposed = true
    this.pendingMapMeshes = []
    this.root.removeFromParent()
    disposeObject(this.root)
  }
}

/**
 * Rider head (and cockpit eye) offset for a two-wheeler rider moved by `shift` ([x, z] chassis
 * metres, +z back): the head follows the body sideways and fore-aft and drops a little as the
 * rider leans forward over the tank. `tuck` (0..1) blends the height and fore-aft position to the
 * tucked eye `base + eye`, low and close behind the windscreen.
 */
export function riderHeadOffset(
  base: readonly number[],
  shift: readonly [number, number],
  tuck = 0,
  eye: readonly number[] = [0, 0, 0],
): number[] {
  const t = Math.min(1, Math.max(0, tuck))
  const y = base[1] - 0.5 * Math.max(0, -shift[1]),
    z = base[2] + shift[1]
  return [
    base[0] + shift[0] + eye[0] * t,
    y + (base[1] + eye[1] - y) * t,
    z + (base[2] + eye[2] - z) * t,
  ]
}
