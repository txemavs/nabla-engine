import * as THREE from 'three'

/** Rear-hit easter egg. Balloons live in the scene frame, independently of the car. */
export class TrunkBalloons {
  readonly root = new THREE.Group()
  private readonly geometry = new THREE.SphereGeometry(0.16, 12, 10)
  private readonly materials = ['#ff3355', '#ffc829', '#32baff', '#8c51ff', '#34db83'].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.26, metalness: 0.05 }),
  )
  private readonly stringGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -0.19, 0),
    new THREE.Vector3(0.025, -0.48, 0),
    new THREE.Vector3(-0.015, -0.7, 0),
  ])
  private readonly stringMaterial = new THREE.LineBasicMaterial({ color: '#ddddcc' })
  private readonly trunks = new Map<
    THREE.Object3D,
    {
      pivot: THREE.Group
      outlet: THREE.Vector3
      sign: number
      remaining: number
      angle: number
      clock: number
      saved: { node: THREE.Object3D; parent: THREE.Object3D; matrix: THREE.Matrix4 }[]
    }
  >()
  private readonly balloons: {
    mesh: THREE.Group
    velocity: THREE.Vector3
    age: number
    phase: number
  }[] = []
  constructor(private readonly space: THREE.Group) {
    this.root.name = 'Trunk balloons'
    space.add(this.root)
  }
  hit(object: THREE.Object3D, point: THREE.Vector3, direction: THREE.Vector3): boolean {
    let trunk = this.trunks.get(object)
    const lid = object.getObjectByName('Maletero') ?? object.getObjectByName('Trunk')
    if (!lid || !lid.visible || (trunk && !trunk.pivot.visible)) return false
    object.updateWorldMatrix(true, true)
    if (!trunk) {
      const bounds = new THREE.Box3()
      const inverse = object.matrixWorld.clone().invert()
      lid.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return
        node.geometry.computeBoundingBox()
        bounds.union(
          node.geometry
            .boundingBox!.clone()
            .applyMatrix4(inverse.clone().multiply(node.matrixWorld)),
        )
      })
      if (bounds.isEmpty()) return false
      const center = bounds.getCenter(new THREE.Vector3())
      const sign = Math.sign(center.z) || 1
      const pivot = new THREE.Group()
      pivot.name = 'Trunk balloon hinge'
      pivot.position.set(center.x, bounds.max.y, sign > 0 ? bounds.min.z : bounds.max.z)
      object.add(pivot)
      const nodes = [lid, object.getObjectByName('Luces Maletero')].filter(
        (n): n is THREE.Object3D => !!n,
      )
      const saved = nodes.map((node) => ({
        node,
        parent: node.parent!,
        matrix: node.matrix.clone(),
      }))
      for (const node of nodes) pivot.attach(node)
      trunk = { pivot, outlet: center, sign, remaining: 0, angle: 0, clock: 0, saved }
      this.trunks.set(object, trunk)
    }
    const localPoint = object.worldToLocal(this.space.localToWorld(point.clone()))
    const localDirection = direction.clone().transformDirection(object.matrixWorld.clone().invert())
    if (
      localPoint.z * trunk.sign < Math.abs(trunk.outlet.z) * 0.55 ||
      localDirection.z * trunk.sign > -0.4
    )
      return false
    trunk.remaining = 30
    return true
  }
  update(dt: number): void {
    for (const [object, trunk] of this.trunks) {
      if (!trunk.saved[0].node.visible || !trunk.pivot.visible) trunk.remaining = 0
      const emitting = trunk.remaining > 0
      trunk.remaining = Math.max(0, trunk.remaining - dt)
      const target = emitting ? 1.15 : 0
      trunk.angle = THREE.MathUtils.damp(trunk.angle, target, 5, dt)
      trunk.pivot.rotation.x = -trunk.sign * trunk.angle
      trunk.clock += dt
      if (emitting && trunk.angle > 0.65 && trunk.clock >= 0.18) {
        trunk.clock = 0
        if (this.balloons.length >= 240) continue
        const mesh = new THREE.Group()
        const body = new THREE.Mesh(
          this.geometry,
          this.materials[Math.floor(Math.random() * this.materials.length)],
        )
        body.scale.y = 1.25
        mesh.add(body, new THREE.Line(this.stringGeometry, this.stringMaterial))
        mesh.position.copy(trunk.outlet)
        mesh.position.x += (Math.random() - 0.5) * 0.65
        object.localToWorld(mesh.position)
        this.space.worldToLocal(mesh.position)
        mesh.position.y += 0.1
        this.root.add(mesh)
        this.balloons.push({
          mesh,
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 0.45,
            0.9 + Math.random() * 0.6,
            (Math.random() - 0.5) * 0.45,
          ),
          age: 0,
          phase: Math.random() * 6.28,
        })
      }
    }
    for (let i = this.balloons.length - 1; i >= 0; i--) {
      const b = this.balloons[i]
      b.age += dt
      b.mesh.position.addScaledVector(b.velocity, dt)
      b.mesh.position.x += Math.sin(b.age * 1.7 + b.phase) * dt * 0.12
      b.mesh.rotation.z = Math.sin(b.age * 2 + b.phase) * 0.12
      b.mesh.scale.setScalar(Math.min(1, (12 - b.age) / 2))
      if (b.age >= 12) {
        b.mesh.removeFromParent()
        this.balloons.splice(i, 1)
      }
    }
  }
  /** Include the balloon materials in the existing loading-time shader compilation. */
  warmMeshes(): THREE.Group {
    const group = new THREE.Group()
    for (const material of this.materials) group.add(new THREE.Mesh(this.geometry, material))
    group.add(new THREE.Line(this.stringGeometry, this.stringMaterial))
    return group
  }
  clear(): void {
    for (const trunk of this.trunks.values()) {
      for (const { node, parent, matrix } of trunk.saved) {
        parent.add(node)
        matrix.decompose(node.position, node.quaternion, node.scale)
      }
      trunk.pivot.removeFromParent()
    }
    this.trunks.clear()
    this.root.clear()
    this.balloons.length = 0
  }
  dispose(): void {
    this.clear()
    this.root.removeFromParent()
    this.geometry.dispose()
    this.stringGeometry.dispose()
    this.stringMaterial.dispose()
    this.materials.forEach((material) => material.dispose())
  }
}
