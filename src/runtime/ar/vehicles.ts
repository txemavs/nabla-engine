import { palletEntity } from '../../catalog/props/pallet.js'
import { XRScaledBodyContacts } from '../xr-scaled-body-contacts.js'
import type { World } from '../../simulation/physics.js'
import type { XRDisposalTest } from '../xr-disposal-portal.js'
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
  private readonly roomContacts: XRScaledBodyContacts
  beforeRoomStep(dt: number): void {
    this.roomContacts.beforeStep(dt)
  }
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
  disposalTest?: XRDisposalTest
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
  private speedButtonDown = false
  toggleFlightSpeed(): void {
    if (!this.physics || this.kind !== 'f14') return
    const id = this.physics.entities[0].id
    const mode = this.physics.simulation.vehicleInfo(id).flightSpeedMode
    this.physics.simulation.setFlightSpeedMode(id, mode === 'slow' ? 'fast' : 'slow')
  }
  private generation = 0
  private ray = new THREE.Raycaster()
  constructor(
    private scene: THREE.Scene,
    calibration?: Pick<XRCalibration, 'get' | 'apply' | 'motorcycleStatus'>,
    private readonly options: {
      simulation?: ConstructorParameters<typeof Simulation>[1]
      assetQuality?: AssetQuality
      roomWorld?: () => World | null
    } = {},
  ) {
    this.roomContacts = new XRScaledBodyContacts(options.roomWorld ?? (() => null))
    this.controls = new ARRCControls(scene, calibration)
    this.effects = new VehicleEffects(scene)
    this.effects.smoke.root.visible = false
    this.effects.marks.root.visible = false
  }
  get targets(): THREE.Mesh[] {
    const targets: THREE.Mesh[] = []
    for (const car of this.cars)
      car.root.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || object.name === 'shot-impact') return
        for (let node: THREE.Object3D | null = object; node; node = node.parent)
          if (!node.visible) return
        targets.push(object)
      })
    return targets
  }
  hit(
    object: THREE.Object3D,
    point: THREE.Vector3,
    direction: THREE.Vector3,
  ): { handled: boolean; glass: boolean; metal: boolean } | null {
    if (!this.view || !this.physics) return null
    let car: Car | undefined
    for (let node: THREE.Object3D | null = object; node && !car; node = node.parent)
      car = this.cars.find((c) => c.root === node)
    if (!car) return null
    const origin = point.clone().addScaledVector(direction, -Math.max(0.001, this.scale * 0.05))
    const glass = this.view.brokenGlass.hit(
      [car.root],
      origin,
      direction,
      Math.max(0.005, this.scale * 0.2),
    )
    if (glass) {
      this.view.destruction.glass(glass.clone().divideScalar(this.scale), direction)
      return { handled: true, glass: true, metal: false }
    }
    const vehicle = !!this.physics.entities.find((e) => e.id === car!.id)?.vehicle
    if (vehicle) this.physics.simulation.damageVehicle(car.id, 12)
    this.physics.simulation.shoot(
      origin.clone().divideScalar(this.scale).toArray(),
      direction.toArray(),
      Math.max(0.005, this.scale * 0.5) / this.scale,
      12,
    )
    return { handled: false, glass: false, metal: vehicle }
  }
  owns(grip: THREE.Group): boolean {
    return (
      this.controls.owns(grip, this.controlSources.get(grip)) ||
      this.objectGrab.hands.includes(grip)
    )
  }
  async load(
    kind: 's3' | 'vfr' | 'truck' | 'f14' | 'forklift',
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
        : [
            presetVehicle(
              kind === 'vfr'
                ? 'vfr800'
                : kind === 's3'
                  ? 'car'
                  : kind === 'f14'
                    ? 'f14'
                    : kind === 'forklift'
                      ? 'forklift-rc'
                      : 'white-truck',
              'rc-0',
            ),
          ]
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
      this.controls.enabled = kind !== 'f14'
      if (kind === 'forklift') {
        const source = view.objects.get(vehicle.id)!
        for (let i = 0; i < 3; i++) {
          const lever = source.getObjectByName('forklift-lever-' + i)
          if (!lever) continue
          const copy = lever.clone(true)
          copy.traverse((node) => {
            if (node instanceof THREE.Mesh) {
              node.userData.sharedAssetGeometry = true
              node.material = Array.isArray(node.material)
                ? node.material.map((m) => m.clone())
                : node.material.clone()
            }
          })
          copy.position.sub(new THREE.Vector3(-0.277, 1.39, -0.264))
          this.controls.equipment.add(copy)
        }
      }
      this.controls.kind = kind === 'f14' ? '' : kind
      this.controls.place(camera)
      this.sync()
    } catch (error) {
      this.clear()
      throw error
    }
  }
  private propSerial = 0
  addPallet(withBox = false): boolean {
    if (!this.physics || !this.view || !this.camera) return false
    const props = this.physics.entities.filter((e) => !e.vehicle)
    if (props.length >= 12) this.removeProp(props[0].id)
    const vehicle = this.physics.pose(this.physics.entities[0].id)
    const position = new THREE.Vector3(...vehicle.position).add(
      new THREE.Vector3(
        ((this.propSerial % 3) - 1) * 1.5 * this.scale,
        0,
        -4 * this.scale,
      ).applyQuaternion(new THREE.Quaternion(...vehicle.rotation)),
    )
    const ground = this.ground(position, 10, this.surfaces)
    position.y = (ground?.point.y ?? 0) + 0.01 * this.scale
    const entity = palletEntity(
      'ar-pallet-' + this.propSerial++,
      withBox,
      position.divideScalar(this.scale).toArray(),
    )
    entity.transform.rotation = vehicle.rotation
    this.physics.simulation.addPlaced([entity])
    this.physics.entities.push(entity)
    this.view.addPlaced([entity])
    const marks = new TireMarks(1, 1)
    this.cars.push({ id: entity.id, root: this.view.objects.get(entity.id)!, holder: null, marks })
    this.sync()
    return true
  }
  private removeProp(id: string): void {
    if (!this.physics || !this.view) return
    const car = this.cars.find((c) => c.id === id)
    car?.marks.dispose()
    this.cars = this.cars.filter((c) => c.id !== id)
    this.physics.simulation.removePlaced([id])
    this.view.removePlaced([id])
    this.physics.entities.splice(
      this.physics.entities.findIndex((e) => e.id === id),
      1,
    )
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
    const handbrake = hands.some(
      (h) => h.source?.handedness === 'right' && !!h.source.gamepad?.buttons[5]?.pressed,
    )
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
      const car = this.cars
        .map((c) => ({ car: c, bounds: new THREE.Box3().setFromObject(c.root) }))
        .filter((c) => c.bounds.distanceToPoint(p) < 0.06)
        .sort(
          (a, b) =>
            a.bounds.distanceToPoint(p) - b.bounds.distanceToPoint(p) ||
            a.bounds.getCenter(new THREE.Vector3()).distanceToSquared(p) -
              b.bounds.getCenter(new THREE.Vector3()).distanceToSquared(p),
        )[0]?.car
      if (!car) continue
      if (!this.grabbedId) {
        this.physics?.beginGrab(car.id)
        this.grabbedId = car.id
      }
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
    const flying = this.kind === 'f14'
    const speedButton = flying && !!right?.buttons[5]?.pressed
    if (speedButton && !this.speedButtonDown) this.toggleFlightSpeed()
    this.speedButtonDown = speedButton
    const throttle = flying
        ? -axis(right, 3)
        : this.controls.enabled
          ? real.throttle
          : -axis(left, 3),
      steer = flying
        ? axis(right, 2)
        : this.controls.enabled
          ? real.steering
          : axis(left, 2) || axis(right, 2),
      brake = this.controls.enabled ? real.brake : Math.max(0, axis(right, 3))
    const holdingAssembly = this.cars.some((c) => c.holder)
    if (!holdingAssembly && this.disposalTest && this.physics) {
      for (const car of this.cars) {
        const bounds = new THREE.Box3().setFromObject(car.root)
        const centre = bounds.getCenter(new THREE.Vector3())
        const velocity = this.physics.simulation.entityVelocity(car.id)
        if (!velocity) continue
        const to = centre
          .clone()
          .addScaledVector(new THREE.Vector3(...velocity), this.scale * Math.min(dt, 0.05))
        if (this.disposalTest(centre, to, bounds.getSize(new THREE.Vector3()).length() / 2)) {
          if (this.physics.entities.find((e) => e.id === car.id)?.vehicle) {
            this.clear()
            return
          }
          this.removeProp(car.id)
        }
      }
    }
    if (!holdingAssembly)
      this.physics?.step(dt, {
        throttle,
        forklift: real.forklift,
        lift: flying ? Math.max(0, -axis(left, 3)) : undefined,
        turn: flying ? axis(left, 2) : undefined,
        handbrake: !flying && handbrake,
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
    this.view?.destruction.update(dt, false)
    if (this.physics)
      this.roomContacts.sync(
        this.physics.entities.flatMap((entity) =>
          this.physics!.simulation.entityCollisionParts(entity.id).map((part) => ({
            ...part,
            key: `${entity.id}:${part.key}`,
          })),
        ),
        this.scale,
        dt,
      )
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
    this.roomContacts.clear()
    this.generation++
    this.objectGrab.reset()
    this.grabbedId = null
    this.speedButtonDown = false
    this.effects.updateAudio(null, { version: 1, name: 'AR', entities: [] }, new THREE.Vector3())
    this.controls.reset()
    this.controls.kind = ''
    this.controls.root.visible = false
    for (const child of [...this.controls.spin.children, ...this.controls.equipment.children])
      this.disposeRoot(child)
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
