import { assets, disposeObject } from '../render/entity/assets.js'
export {
  bowModels,
  buildBowModel,
  recurveBow,
  type BowModel,
  type BowModelDescription,
} from './bow-model.js'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat/rapier.es.js'
import type { RigidBody, Collider } from '@dimforge/rapier3d-compat'
import type { World } from '../simulation/physics.js'
import { BowDraw } from '../simulation/weapons/bow.js'
import { buildBowModel, type BowModelDescription } from './bow-model.js'
import { XRObjectGrab } from './xr-object-grab.js'
import type { GrabHand } from './xr-grab.js'
import type { XRDisposalTest } from './xr-disposal-portal.js'

type Arrow = {
  root: THREE.Group
  body: RigidBody
  collider: Collider
  age: number
  stuck: boolean
  previous: THREE.Vector3
}
const squeeze = (hand: GrabHand) =>
  !!hand.source?.gamepad?.buttons[1]?.pressed ||
  (hand.source?.gamepad?.buttons[1]?.value ?? 0) > 0.6
const forward = new THREE.Vector3(0, 0, -1)

/** Opt-in physical two-hand bow. World, collisions, session and timing belong to the host.
 * Grip near the handle to carry it; the other grip pulls/releases the string.
 * Tracking loss cancels the shot. Arrows share Rapier gravity, CCD and room contacts.
 */
export class XRBow {
  root: THREE.Group | null = null
  readonly draw = new BowDraw()
  disposalTest?: XRDisposalTest
  onHit?: (point: THREE.Vector3, direction: THREE.Vector3) => void
  private modelBow: THREE.Mesh | null = null
  private modelArrow: THREE.Mesh | null = null
  private disposed = false
  async loadModel(url: string, options: BowModelDescription): Promise<void> {
    const asset = await assets.instantiate(url)
    try {
      if (this.disposed) return
      const { bow, arrow } = buildBowModel(asset, options)
      this.modelBow = bow
      this.modelArrow = arrow
    } finally {
      disposeObject(asset)
    }
  }

  private holder: GrabHand | null = null
  private stringHand: GrabHand | null = null
  private readonly grab = new XRObjectGrab()
  private bowBody: RigidBody | null = null
  private bowWorld: World | null = null
  private string: THREE.Line | null = null
  private preview: THREE.Group | null = null
  private arrows: Arrow[] = []
  private pressed = new Set<THREE.Group>()
  private readonly nock = new THREE.Vector3()
  private readonly direction = new THREE.Vector3(0, 0, -1)
  private readonly previous = new THREE.Vector3()
  private readonly arrowGeometry = new THREE.CylinderGeometry(0.003, 0.003, 0.58, 6).rotateX(
    Math.PI / 2,
  )
  private readonly tipGeometry = new THREE.ConeGeometry(0.009, 0.04, 6).rotateX(-Math.PI / 2)
  private readonly shaftMaterial = new THREE.MeshStandardMaterial({
    color: 0xd0b27c,
    roughness: 0.75,
  })
  private readonly tipMaterial = new THREE.MeshStandardMaterial({
    color: 0x555d66,
    metalness: 0.65,
    roughness: 0.35,
  })
  constructor(
    private readonly scene: THREE.Scene,
    private readonly getWorld: () => World | null,
  ) {}
  get arrowCount(): number {
    return this.arrows.length
  }
  owns(grip: THREE.Group): boolean {
    return this.holder?.grip === grip || this.stringHand?.grip === grip
  }
  private arrowModel(): THREE.Group {
    const root = new THREE.Group()
    if (this.modelArrow) {
      root.add(this.modelArrow.clone())
      return root
    }
    root.add(new THREE.Mesh(this.arrowGeometry, this.shaftMaterial))
    const tip = new THREE.Mesh(this.tipGeometry, this.tipMaterial)
    tip.position.z = -0.31
    root.add(tip)
    return root
  }
  spawn(camera: THREE.Camera): boolean {
    const world = this.getWorld()
    if (!world) return false
    this.clear()
    this.bowWorld = world
    this.root = new THREE.Group()
    this.root.name = 'Engine two-hand bow'
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.5, 0.14),
      new THREE.Vector3(0, -0.33, -0.06),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.33, -0.06),
      new THREE.Vector3(0, 0.5, 0.14),
    ])
    if (this.modelBow) this.root.add(this.modelBow.clone())
    else
      this.root.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(curve, 28, 0.014, 6, false),
          new THREE.MeshStandardMaterial({ color: 0x845e38, roughness: 0.75 }),
        ),
      )
    this.string = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
      new THREE.LineBasicMaterial({ color: 0xe8dfce }),
    )
    this.root.add(this.string)
    this.preview = this.arrowModel()
    this.preview.visible = false
    this.root.add(this.preview)
    const yaw = new THREE.Euler().setFromQuaternion(
      camera.getWorldQuaternion(new THREE.Quaternion()),
      'YXZ',
    ).y
    this.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    this.root.position
      .copy(camera.getWorldPosition(new THREE.Vector3()))
      .add(new THREE.Vector3(0, -0.2, -0.45).applyQuaternion(this.root.quaternion))
    this.scene.add(this.root)
    this.bowBody = world.raw.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(this.root.position.x, this.root.position.y, this.root.position.z)
        .setRotation(this.root.quaternion)
        .setCcdEnabled(true),
    )
    world.raw.createCollider(
      RAPIER.ColliderDesc.capsule(0.45, 0.015).setMass(0.6).setFriction(0.7),
      this.bowBody,
    )
    this.previous.copy(this.root.position)
    this.updateString()
    return true
  }
  private updateString(): void {
    if (!this.root || !this.string || !this.preview) return
    const local = this.draw.drawing
      ? this.root.worldToLocal(this.nock.clone())
      : new THREE.Vector3(0, 0, 0.155)
    const attr = this.string.geometry.getAttribute('position') as THREE.BufferAttribute
    attr.setXYZ(0, 0, -0.481, 0.155)
    attr.setXYZ(1, local.x, local.y, local.z)
    attr.setXYZ(2, 0, 0.481, 0.155)
    attr.needsUpdate = true
    this.string.geometry.computeBoundingSphere()
    this.preview.visible = this.draw.drawing
    this.preview.position
      .copy(local)
      .addScaledVector(
        this.direction
          .clone()
          .applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()).invert()),
        0.29,
      )
    this.preview.quaternion
      .copy(this.root.getWorldQuaternion(new THREE.Quaternion()).invert())
      .multiply(new THREE.Quaternion().setFromUnitVectors(forward, this.direction))
  }
  interact(hands: readonly GrabHand[], dt: number): void {
    if (!this.root || !this.bowBody || !this.bowWorld) return
    if (this.holder && !hands.some((h) => h.grip === this.holder!.grip)) {
      this.cancel()
      this.holder = null
    }
    const wasHeld = !!this.grab.hands.length
    if (!this.holder) {
      const handle = this.root.getWorldPosition(new THREE.Vector3())
      this.holder =
        hands.find(
          (h) =>
            squeeze(h) &&
            !this.pressed.has(h.grip) &&
            h.grip.getWorldPosition(new THREE.Vector3()).distanceTo(handle) < 0.16,
        ) ?? null
    } else if (!squeeze(this.holder)) {
      this.cancel()
      this.holder = null
    }
    this.grab.update(this.root, this.holder ? [this.holder.grip] : [], dt)
    if (this.holder) {
      this.bowBody.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true)
      this.bowBody.setNextKinematicTranslation(this.grab.position)
      this.bowBody.setNextKinematicRotation(this.grab.quaternion)
    } else if (wasHeld) {
      this.bowBody.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
      this.bowBody.setTranslation(this.grab.position, true)
      this.bowBody.setRotation(this.grab.quaternion, true)
      this.bowBody.setLinvel(this.grab.velocity, true)
      this.bowBody.setAngvel(this.grab.angularVelocity, true)
    }
    if (this.stringHand) {
      const hand = hands.find((h) => h.grip === this.stringHand!.grip)
      if (!hand || !this.holder) this.cancel()
      else if (!squeeze(hand)) {
        const speed = this.draw.release()
        if (speed > 0) this.fire(speed)
        this.stringHand = null
      } else {
        this.nock.copy(hand.grip.getWorldPosition(new THREE.Vector3()))
        const handle = this.root.getWorldPosition(new THREE.Vector3())
        const local = this.root.worldToLocal(this.nock.clone())
        if (local.z < 0.08 || Math.hypot(local.x, local.y) > 0.35) this.cancel()
        else {
          this.direction.copy(handle).sub(this.nock).normalize()
          this.draw.pull(local.z - 0.155)
          if (local.z > 0.155 + this.draw.spec.maxDraw) {
            local.z = 0.155 + this.draw.spec.maxDraw
            this.nock.copy(this.root.localToWorld(local))
            this.direction.copy(handle).sub(this.nock).normalize()
          }
        }
      }
    } else if (this.holder) {
      const rest = this.root.localToWorld(new THREE.Vector3(0, 0, 0.155))
      this.stringHand =
        hands.find(
          (h) =>
            h.grip !== this.holder!.grip &&
            squeeze(h) &&
            !this.pressed.has(h.grip) &&
            h.grip.getWorldPosition(new THREE.Vector3()).distanceTo(rest) < 0.13,
        ) ?? null
      if (this.stringHand) {
        this.draw.start()
        this.nock.copy(rest)
        this.direction
          .copy(forward)
          .applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()))
      }
    }
    this.pressed = new Set(hands.filter(squeeze).map((h) => h.grip))
    this.updateString()
  }
  cancel(): void {
    this.draw.cancel()
    this.stringHand = null
    this.updateString()
  }
  private fire(speed: number): void {
    const world = this.bowWorld
    if (!world) return
    while (this.arrows.length >= 16) this.removeArrow(this.arrows[0])
    const root = this.arrowModel()
    root.position
      .copy(this.root!.getWorldPosition(new THREE.Vector3()))
      .addScaledVector(this.direction, 0.35)
    root.quaternion.setFromUnitVectors(forward, this.direction)
    const body = world.raw.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(root.position.x, root.position.y, root.position.z)
        .setRotation(root.quaternion)
        .setLinvel(this.direction.x * speed, this.direction.y * speed, this.direction.z * speed)
        .setCcdEnabled(true)
        .setLinearDamping(0.015),
    )
    const collider = world.raw.createCollider(
      RAPIER.ColliderDesc.cuboid(0.005, 0.005, 0.31)
        .setMass(this.draw.spec.arrowMass)
        .setRestitution(0)
        .setFriction(0.8),
      body,
    )
    this.scene.add(root)
    this.arrows.push({
      root,
      body,
      collider,
      age: 0,
      stuck: false,
      previous: root.position.clone(),
    })
  }
  sync(dt: number): void {
    if (!this.root || !this.bowBody || !this.bowWorld) return
    if (!this.holder) {
      this.root.position.copy(this.bowBody.translation())
      this.root.quaternion.copy(this.bowBody.rotation())
      this.root.updateWorldMatrix(true, true)
    }
    if (this.disposalTest?.(this.previous, this.root.position, 0.05) || this.root.position.y < -5) {
      this.clear()
      return
    }
    this.previous.copy(this.root.position)
    for (const arrow of [...this.arrows]) {
      arrow.age += dt
      arrow.root.position.copy(arrow.body.translation())
      arrow.root.quaternion.copy(arrow.body.rotation())
      let contact: THREE.Vector3 | null = null
      if (!arrow.stuck)
        this.bowWorld.raw.contactPairsWith(arrow.collider, (other) => {
          const body = other.parent()
          if (body && !body.isFixed()) return
          this.bowWorld!.raw.contactPair(arrow.collider, other, (manifold) => {
            if (manifold.numSolverContacts() > 0)
              contact = new THREE.Vector3().copy(manifold.solverContactPoint(0))
          })
        })
      if (contact) {
        arrow.stuck = true
        arrow.body.setBodyType(RAPIER.RigidBodyType.Fixed, true)
        this.onHit?.(contact, forward.clone().applyQuaternion(arrow.root.quaternion))
      }
      if (
        arrow.age > 45 ||
        arrow.root.position.y < -5 ||
        this.disposalTest?.(arrow.previous, arrow.root.position, 0.01)
      )
        this.removeArrow(arrow)
      else arrow.previous.copy(arrow.root.position)
    }
  }
  private removeArrow(arrow: Arrow): void {
    this.bowWorld?.raw.removeRigidBody(arrow.body)
    arrow.root.removeFromParent()
    this.arrows.splice(this.arrows.indexOf(arrow), 1)
  }
  clear(): void {
    this.cancel()
    this.holder = null
    this.grab.reset()
    this.pressed.clear()
    for (const arrow of [...this.arrows]) this.removeArrow(arrow)
    if (this.bowBody) this.bowWorld?.raw.removeRigidBody(this.bowBody)
    this.bowBody = null
    this.bowWorld = null
    this.root?.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        !object.userData.bowModelPart &&
        object.geometry !== this.arrowGeometry &&
        object.geometry !== this.tipGeometry
      ) {
        object.geometry.dispose()
        for (const material of [object.material].flat()) material.dispose()
      }
    })
    this.string?.geometry.dispose()
    ;(this.string?.material as THREE.Material | undefined)?.dispose()
    this.root?.removeFromParent()
    this.root = null
    this.string = null
    this.preview = null
  }
  dispose(): void {
    this.disposed = true
    this.clear()
    if (this.modelBow) disposeObject(this.modelBow)
    if (this.modelArrow) disposeObject(this.modelArrow)
    this.modelBow = this.modelArrow = null
    this.arrowGeometry.dispose()
    this.tipGeometry.dispose()
    this.shaftMaterial.dispose()
    this.tipMaterial.dispose()
  }
}
