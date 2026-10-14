import { XRObjectGrab } from '../xr-object-grab.js'
import { VehicleEffects } from '../vehicle-effects.js'
import type { AssetQuality } from '../../render/entity/asset-quality.js'
import type { Entity } from '../../entity/schema.js'
import type { Simulation } from '../../simulation/simulation.js'
import { disposeObject } from '../../render/entity/assets.js'
import { XRScaledVehicles } from '../xr-scaled-vehicles.js'
import { ARRCControls } from '../xr-rc-controls.js'
import { presetVehicle } from '../../catalog/vehicles/library.js'
import { SceneView } from '../../presentation/scene-view.js'
import type { XRCalibration } from '../xr-calibration.js'
import * as THREE from 'three'
import { TireMarks } from '../../render/entity/tire-marks.js'

type Hand = { grip: THREE.Group; source: XRInputSource | null }
type Car = {
  root: THREE.Group
  id: string
  holder: THREE.Group | null
  marks: TireMarks
}
export class ARRC {
  readonly controls: ARRCControls
  private readonly effects: VehicleEffects
  private camera?: THREE.Camera
  private readonly objectGrab = new XRObjectGrab()
  private grabbedId: string | null = null
  unlockAudio(): void {
    this.effects.audio.unlock()
  }
  setAudioActive(active: boolean): void {
    this.effects.audio.setSuspended(!active)
  }
  kind = ''
  get simulation() {
    return this.physics?.simulation
  }
  get presentation() {
    return this.view
  }
  private cars: Car[] = []
  private scale = 0.01
  private view?: SceneView
  private physics?: XRScaledVehicles
  private surfaces: THREE.Mesh[] = []
  private controlSources = new Map<THREE.Group, XRInputSource | null>()
  private held = new Set<THREE.Group>()
  private generation = 0
  private ray = new THREE.Raycaster()
  constructor(
    private scene: THREE.Scene,
    calibration?: Pick<XRCalibration, 'get' | 'apply' | 'motorcycleStatus'>,
    private readonly options: {
      simulation?: ConstructorParameters<typeof Simulation>[1]
      assetQuality?: AssetQuality
    } = {},
  ) {
    this.controls = new ARRCControls(scene, calibration)
    this.effects = new VehicleEffects(scene)
    this.effects.smoke.root.visible = false
    this.effects.marks.root.visible = false
  }
  owns(grip: THREE.Group): boolean {
    return (
      this.controls.owns(grip, this.controlSources.get(grip)) ||
      this.objectGrab.hands.includes(grip)
    )
  }
  async load(
    kind: 's3' | 'vfr' | 'truck',
    denominator: number,
    camera: THREE.Camera,
    authoredEntities?: readonly Entity[],
  ): Promise<void> {
    if (!Number.isFinite(denominator) || denominator <= 0) throw new Error('Invalid model scale')
    if (authoredEntities && !authoredEntities.length)
      throw new Error('At least one vehicle is required')
    this.clear()
    const generation = this.generation
    try {
      this.camera = camera
      this.kind = kind
      this.scale = 1 / denominator
      const yaw = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').y
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      const position = camera
        .getWorldPosition(new THREE.Vector3())
        .add(new THREE.Vector3(0, 0, -Math.max(0.5, 4 * this.scale)).applyQuaternion(rotation))
      const support = this.ground(position, 10, this.surfaces)
      position.y = support?.point.y ?? 0
      const entities = authoredEntities
        ? structuredClone([...authoredEntities])
        : [presetVehicle(kind === 'vfr' ? 'vfr800' : kind === 's3' ? 'car' : 'white-truck', 'rc-0')]
      const vehicle = entities[0]
      const initial = structuredClone(vehicle.transform)
      vehicle.transform.position = position
        .clone()
        .divideScalar(this.scale)
        .add(new THREE.Vector3(0, vehicle.transform.position[1], 0))
        .toArray()
      vehicle.transform.rotation = rotation.toArray()
      if (kind === 'truck' && !authoredEntities) {
        const trailer = presetVehicle('white-trailer', 'rc-1')
        const hitch = vehicle.vehicle!.hitch!,
          anchor = trailer.vehicle!.towAnchor!
        trailer.vehicle!.tow = { vehicleId: vehicle.id, hitch, anchor }
        trailer.transform.rotation = rotation.toArray()
        trailer.transform.position = new THREE.Vector3(...hitch)
          .sub(new THREE.Vector3(...anchor))
          .applyQuaternion(rotation)
          .add(new THREE.Vector3(...vehicle.transform.position))
          .toArray()
        entities.push(trailer)
      }
      if (authoredEntities) {
        const delta = rotation.clone().multiply(new THREE.Quaternion(...initial.rotation).invert())
        for (const entity of entities.slice(1)) {
          entity.transform.position = new THREE.Vector3(...entity.transform.position)
            .sub(new THREE.Vector3(...initial.position))
            .applyQuaternion(delta)
            .add(new THREE.Vector3(...vehicle.transform.position))
            .toArray()
          entity.transform.rotation = delta
            .clone()
            .multiply(new THREE.Quaternion(...entity.transform.rotation))
            .toArray()
        }
      }
      const physics = await XRScaledVehicles.create(entities, this.scale, this.options.simulation)
      if (generation !== this.generation) {
        physics.dispose()
        return
      }
      this.physics = physics
      physics.updateSurfaces(this.surfaces)
      // Use the same presenter as desktop/VR. Physics and all rig transforms remain
      // in metres; only their common parent converts them to room/model scale.
      const view = new SceneView({ version: 1, name: 'AR vehicles', entities }, false, true, {
        assetQuality: this.options.assetQuality ?? 'low',
        carInstruments: null,
      })
      this.view = view
      await view.ready
      if (generation !== this.generation) {
        view.dispose()
        return
      }
      view.smokeEnabled = false
      view.root.scale.setScalar(this.scale)
      this.scene.add(view.root)
      for (const entity of entities) {
        const root = view.objects.get(entity.id)!
        const marks = new TireMarks(512, 40)
        marks.root.scale.setScalar(this.scale)
        this.scene.add(marks.root)
        this.cars.push({
          root,
          id: entity.id,
          holder: null,
          marks,
        })
      }
      const steering = view.steeringGrab(vehicle.id)
      const bike = view.motorcycleGrab(vehicle.id)
      const original = bike?.bar ?? steering?.spin
      if (original) {
        const copy = original.clone(true)
        copy.getObjectByName('Fork_Slider')?.removeFromParent()
        copy.position.set(0, 0, 0)
        if (steering)
          copy.quaternion.setFromUnitVectors(
            steering.axis.clone().normalize(),
            new THREE.Vector3(0, 0, 1),
          )
        copy.traverse((node) => {
          const mesh = node as THREE.Mesh
          if (!mesh.isMesh) return
          mesh.userData.sharedAssetGeometry = true
          mesh.material = Array.isArray(mesh.material)
            ? mesh.material.map((m) => m.clone())
            : mesh.material.clone()
        })
        this.controls.spin.add(copy)
      }
      this.controls.kind = kind
      this.controls.place(camera)
      this.sync()
    } catch (error) {
      this.clear()
      throw error
    }
  }
  private ground(point: THREE.Vector3, distance: number, surfaces: THREE.Mesh[]) {
    point = point.clone().add(new THREE.Vector3(0, 0.003, 0))
    distance += 0.003
    this.ray.set(point, new THREE.Vector3(0, -1, 0))
    this.ray.far = distance
    const hit = this.ray.intersectObjects(surfaces, false)[0]
    if (hit)
      return {
        point: hit.point,
        normal: hit
          .face!.normal.clone()
          .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)),
      }
    if (!surfaces.length && point.y >= 0 && point.y <= distance)
      return { point: new THREE.Vector3(point.x, 0, point.z), normal: new THREE.Vector3(0, 1, 0) }
    return null
  }
  update(dt: number, hands: readonly Hand[], surfaces: THREE.Mesh[]): void {
    this.surfaces = surfaces
    this.physics?.updateSurfaces(surfaces)
    this.controlSources = new Map(hands.map((h) => [h.grip, h.source]))
    const real = this.controls.update(
      hands.filter((h) => !this.objectGrab.hands.includes(h.grip)),
      dt,
    )
    hands = hands.filter((h) => !this.controls.owns(h.grip, h.source))
    const pressed = (h: Hand) => !!h.source?.gamepad?.buttons[1]?.pressed
    const grips = this.objectGrab.hands.filter((grip) =>
      hands.some((h) => h.grip === grip && pressed(h)),
    )
    for (const hand of hands) {
      if (
        !pressed(hand) ||
        this.held.has(hand.grip) ||
        grips.includes(hand.grip) ||
        grips.length >= 2
      )
        continue
      const p = hand.grip.getWorldPosition(new THREE.Vector3())
      const car = this.cars.find(
        (c) => new THREE.Box3().setFromObject(c.root).distanceToPoint(p) < 0.06,
      )
      if (!car) continue
      if (!this.grabbedId) this.grabbedId = car.id
      grips.push(hand.grip)
    }
    const grabbed = this.cars.find((c) => c.id === this.grabbedId)
    if (grabbed) {
      const tracked = this.objectGrab.hands.every((grip) => hands.some((h) => h.grip === grip))
      const released = this.objectGrab.update(grabbed.root, grips, tracked ? dt : 0.2)
      this.physics?.moveAssembly(grabbed.id, this.objectGrab.position, this.objectGrab.quaternion)
      for (const car of this.cars) car.holder = null
      grabbed.holder = (this.objectGrab.hands[0] as THREE.Group | undefined) ?? null
      if (released) {
        this.physics?.releaseAssembly(
          grabbed.id,
          this.objectGrab.velocity,
          this.objectGrab.angularVelocity,
        )
        this.grabbedId = null
      }
    }
    this.held = new Set(hands.filter(pressed).map((h) => h.grip))
    const left = hands.find((h) => h.source?.handedness === 'left')?.source?.gamepad
    const right = hands.find((h) => h.source?.handedness === 'right')?.source?.gamepad
    const axis = (pad: Gamepad | undefined, index: number) => {
      const value = pad?.axes[index] ?? 0
      return Math.abs(value) > 0.15 ? value : 0
    }
    const throttle = this.controls.enabled ? real.throttle : -axis(left, 3),
      steer = this.controls.enabled ? real.steering : axis(left, 2) || axis(right, 2),
      brake = this.controls.enabled ? real.brake : Math.max(0, axis(right, 3))
    const holdingAssembly = this.cars.some((c) => c.holder)
    if (!holdingAssembly)
      this.physics?.step(dt, {
        throttle,
        steering: steer,
        brake,
        frontBrake: this.controls.enabled ? real.frontBrake : brake,
        rearBrake: this.controls.enabled ? real.rearBrake : brake,
      })
    for (const car of this.cars) {
      car.marks.update(
        dt,
        holdingAssembly ? null : car.id,
        holdingAssembly ? [] : (this.physics?.contacts(car.id) ?? []),
        new THREE.Vector3(),
      )
      car.marks.root.position.multiplyScalar(this.scale)
    }
    this.sync()
    if (this.physics && this.camera) {
      const eye = this.camera.getWorldPosition(new THREE.Vector3())
      const rotation = this.camera.getWorldQuaternion(new THREE.Quaternion())
      this.effects.audio.setListener(eye.toArray(), rotation.toArray())
      this.effects.updateAudio(
        this.physics.simulation,
        { version: 1, name: 'AR vehicles', entities: this.physics.entities },
        eye,
        this.scale,
      )
    }
  }
  sync(): void {
    if (!this.physics) return
    this.view?.sync(
      this.physics.simulation,
      1 / 60,
      false,
      0,
      0.05,
      !this.cars.some((car) => car.holder),
    )
    if (this.view) {
      this.view.avatar.visible = false
      this.view.root.updateWorldMatrix(true, true)
    }
  }

  private disposeRoot(root: THREE.Object3D): void {
    disposeObject(root)
    root.removeFromParent()
  }
  dispose(): void {
    this.clear()
    this.controls.dispose()
    this.effects.dispose()
    this.controlSources.clear()
  }
  clear(): void {
    this.generation++
    this.objectGrab.reset()
    this.grabbedId = null
    this.effects.updateAudio(null, { version: 1, name: 'AR', entities: [] }, new THREE.Vector3())
    this.controls.reset()
    this.controls.kind = ''
    this.controls.root.visible = false
    for (const child of [...this.controls.spin.children]) this.disposeRoot(child)
    for (const c of this.cars) {
      c.marks.dispose()
      c.marks.root.removeFromParent()
    }
    this.view?.dispose()
    this.view = undefined
    this.physics?.dispose()
    this.physics = undefined
    this.cars = []
    this.kind = ''
    this.held.clear()
  }
}
