import { XRObjectGrab } from './xr-object-grab.js'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat/rapier.es.js'
import { initPhysics, World } from '../simulation/physics.js'
import type { RigidBody, Collider } from '@dimforge/rapier3d-compat'

interface BallHand {
  grip: THREE.Group
  source: XRInputSource | null
}
interface Ball {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
  body: RigidBody
  holder: THREE.Group | null
  grab: XRObjectGrab
}
/** Small bounded physics playground using the scanned room as static collision geometry. */
export class ARBalls {
  readonly ready: Promise<void>
  private engineWorld: World | null = null
  private get world() {
    return this.engineWorld?.raw ?? null
  }
  private disposed = false
  private accumulator = 0
  private geometry = new THREE.SphereGeometry(0.11, 20, 12)
  private material = new THREE.MeshStandardMaterial({ color: 0xf39c32, roughness: 0.8 })
  private balls: Ball[] = []
  private squeezed = new Set<THREE.Group>()
  private room = new Map<
    THREE.Mesh,
    { geometry: THREE.BufferGeometry; collider: Collider; matrix: THREE.Matrix4 }
  >()
  private floor: Collider | null = null
  constructor(private scene: THREE.Scene) {
    this.ready = initPhysics().then(() => {
      if (this.disposed) return
      this.engineWorld = new World()
      this.floor = this.world!.createCollider(
        RAPIER.ColliderDesc.cuboid(20, 0.05, 20).setTranslation(0, -0.05, 0),
      )
    })
  }
  get physicsWorld() {
    return this.engineWorld
  }
  get targets(): THREE.Mesh[] {
    return this.balls.map((b) => b.mesh)
  }
  spawn(camera: THREE.Camera): void {
    if (!this.world) return
    if (this.balls.length >= 12) {
      const oldest = this.balls.find((b) => !b.holder)
      if (!oldest) return
      this.remove(oldest)
    }
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(
      camera.getWorldQuaternion(new THREE.Quaternion()),
    )
    const position = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(direction, 0.6)
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setCcdEnabled(true)
        .setLinearDamping(0.12)
        .setAngularDamping(0.2),
    )
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(0.11).setMass(0.45).setRestitution(0.8).setFriction(0.6),
      body,
    )
    const material = this.material.clone()
    material.color.setHSL(Math.random(), 0.75, 0.52)
    const mesh = new THREE.Mesh(this.geometry, material)
    mesh.position.copy(position)
    this.scene.add(mesh)
    this.balls.push({
      mesh,
      body,
      holder: null,
      grab: new XRObjectGrab(),
    })
  }
  owns(grip: THREE.Group): boolean {
    return this.balls.some((b) => b.grab.hands.includes(grip))
  }
  grab(hands: readonly BallHand[], dt: number): void {
    const pressed = (h: BallHand) =>
      !!h.source?.gamepad?.buttons[1]?.pressed || (h.source?.gamepad?.buttons[1]?.value ?? 0) > 0.6
    const next = new Map(
      this.balls.map((ball) => [
        ball,
        ball.grab.hands.filter((grip) => hands.some((h) => h.grip === grip && pressed(h))),
      ]),
    )
    for (const hand of hands) {
      if (!pressed(hand) || this.squeezed.has(hand.grip) || this.owns(hand.grip)) continue
      const position = hand.grip.getWorldPosition(new THREE.Vector3())
      const ball = this.balls
        .filter((b) => next.get(b)!.length < 2 && b.mesh.position.distanceTo(position) < 0.19)
        .sort(
          (a, b) =>
            a.mesh.position.distanceToSquared(position) -
            b.mesh.position.distanceToSquared(position),
        )[0]
      if (ball) next.get(ball)!.push(hand.grip)
    }
    for (const ball of this.balls) {
      const grips = next.get(ball)!
      if (!grips.length && !ball.grab.hands.length) continue
      const tracked = ball.grab.hands.every((grip) => hands.some((h) => h.grip === grip))
      const released = ball.grab.update(ball.mesh, grips, tracked ? dt : 0.2)
      ball.holder = (ball.grab.hands[0] as THREE.Group | undefined) ?? null
      if (released) {
        ball.body.setTranslation(ball.grab.position, true)
        ball.body.setRotation(ball.grab.quaternion, true)
        ball.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
        ball.body.setLinvel(ball.grab.velocity, true)
        ball.body.setAngvel(ball.grab.angularVelocity, true)
      } else {
        ball.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true)
        ball.body.setNextKinematicTranslation(ball.grab.position)
        ball.body.setNextKinematicRotation(ball.grab.quaternion)
      }
    }
    this.squeezed = new Set(hands.filter(pressed).map((h) => h.grip))
  }
  hit(object: THREE.Object3D, point: THREE.Vector3, direction: THREE.Vector3): void {
    const ball = this.balls.find((b) => b.mesh === object)
    ball?.body.applyImpulseAtPoint(direction.clone().multiplyScalar(1.8), point, true)
  }
  update(dt: number, surfaces: THREE.Mesh[]): void {
    const world = this.world
    if (!world) return
    // A reference-space floor is only a fallback before any room surface is available.
    this.floor?.setEnabled(surfaces.length === 0)
    const live = new Set(surfaces)
    for (const [mesh, entry] of this.room)
      if (!live.has(mesh)) {
        world.removeCollider(entry.collider, true)
        this.room.delete(mesh)
      }
    for (const mesh of surfaces) {
      mesh.updateWorldMatrix(true, false)
      const previous = this.room.get(mesh)
      if (previous?.geometry === mesh.geometry) {
        if (!previous.matrix.equals(mesh.matrixWorld)) {
          previous.collider.setTranslation(mesh.getWorldPosition(new THREE.Vector3()))
          previous.collider.setRotation(mesh.getWorldQuaternion(new THREE.Quaternion()))
          previous.matrix.copy(mesh.matrixWorld)
        }
        continue
      }
      if (previous) world.removeCollider(previous.collider, true)
      const positions = mesh.geometry.getAttribute('position')
      const vertices = new Float32Array(positions.count * 3)
      const p = new THREE.Vector3()
      for (let i = 0; i < positions.count; i++) {
        p.fromBufferAttribute(positions, i)
        p.toArray(vertices, i * 3)
      }
      const indices = mesh.geometry.index
        ? new Uint32Array(mesh.geometry.index.array)
        : Uint32Array.from({ length: positions.count }, (_, i) => i)
      if (!indices.length) continue
      const collider = world.createCollider(
        RAPIER.ColliderDesc.trimesh(vertices, indices).setRestitution(0.65).setFriction(0.6),
      )
      collider.setTranslation(mesh.getWorldPosition(new THREE.Vector3()))
      collider.setRotation(mesh.getWorldQuaternion(new THREE.Quaternion()))
      this.room.set(mesh, { geometry: mesh.geometry, collider, matrix: mesh.matrixWorld.clone() })
    }
    this.accumulator += Math.min(Math.max(dt, 0), 0.05)
    world.timestep = 1 / 90
    while (this.accumulator >= 1 / 90) {
      this.engineWorld!.step(1 / 90)
      this.accumulator -= 1 / 90
    }
    for (const ball of [...this.balls]) {
      ball.mesh.position.copy(ball.body.translation())
      ball.mesh.quaternion.copy(ball.body.rotation())
      if (ball.mesh.position.y < -5) this.remove(ball)
    }
  }
  private remove(ball: Ball): void {
    this.world!.removeRigidBody(ball.body)
    ball.mesh.removeFromParent()
    ball.mesh.material.dispose()
    this.balls.splice(this.balls.indexOf(ball), 1)
  }
  reset(): void {
    for (const ball of [...this.balls]) this.remove(ball)
    this.accumulator = 0
    this.squeezed.clear()
  }
  dispose(): void {
    this.disposed = true
    this.reset()
    this.world?.free()
    this.engineWorld = null
    this.geometry.dispose()
    this.material.dispose()
  }
}
