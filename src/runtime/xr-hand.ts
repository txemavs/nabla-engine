import * as THREE from 'three'

/** Lightweight controller-driven glove: five articulated fingers, no hand-tracking permission. */
export class XRControllerHand {
  readonly root = new THREE.Group()
  private readonly material = new THREE.MeshStandardMaterial({ color: '#859ba8', roughness: 0.85 })
  private readonly cuffMaterial = new THREE.MeshStandardMaterial({
    color: '#233746',
    roughness: 0.95,
  })
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly fingers: THREE.Group[][] = []
  readonly indexTip = new THREE.Object3D()
  private readonly thumb = new THREE.Group()

  constructor() {
    this.root.name = 'Controller glove'
    const ellipsoid = (size: number[], at: number[], material = this.material) => {
      const geometry = new THREE.SphereGeometry(1, 10, 6)
      this.geometries.push(geometry)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.scale.set(size[0], size[1], size[2])
      mesh.position.fromArray(at)
      this.root.add(mesh)
    }
    ellipsoid([0.039, 0.017, 0.048], [0, 0, 0.008])
    ellipsoid([0.031, 0.021, 0.02], [0, 0, 0.058], this.cuffMaterial)
    for (let finger = 0; finger < 4; finger++) {
      const joints: THREE.Group[] = []
      let parent = this.root
      const lengths = [0.034, 0.024, 0.019].map((n) => n * [0.9, 1, 0.94, 0.74][finger])
      for (let part = 0; part < 3; part++) {
        const joint = new THREE.Group()
        joint.position.set(
          part === 0 ? -0.027 + finger * 0.018 : 0,
          0,
          part === 0 ? -0.027 : -lengths[part - 1],
        )
        parent.add(joint)
        const geometry = new THREE.CapsuleGeometry(
          0.0075 - finger * 0.0004,
          Math.max(0.003, lengths[part] - 0.015),
          3,
          6,
        )
        this.geometries.push(geometry)
        const mesh = new THREE.Mesh(geometry, this.material)
        mesh.rotation.x = Math.PI / 2
        mesh.position.z = -lengths[part] / 2
        joint.add(mesh)
        joints.push(joint)
        parent = joint
      }
      this.fingers.push(joints)
      if (finger === 0) {
        this.indexTip.position.z = -lengths[2]
        parent.add(this.indexTip)
      }
    }
    this.thumb.position.set(-0.031, -0.005, 0.015)
    this.thumb.rotation.y = 0.8
    this.root.add(this.thumb)
    for (let i = 0; i < 2; i++) {
      const geometry = new THREE.CapsuleGeometry(0.009, 0.018, 3, 6)
      this.geometries.push(geometry)
      const mesh = new THREE.Mesh(geometry, this.material)
      mesh.rotation.x = Math.PI / 2
      mesh.position.z = -0.014 - i * 0.024
      this.thumb.add(mesh)
    }
    this.root.visible = false
  }
  update(source: XRInputSource | null, tracked: boolean): void {
    this.root.visible = tracked && !!source && !source.hand && source.handedness !== 'none'
    if (!this.root.visible) return
    this.root.scale.x = source!.handedness === 'left' ? -1 : 1
    const amount = (i: number) => {
      const b = source!.gamepad?.buttons[i]
      return THREE.MathUtils.clamp(b?.value ?? (b?.pressed ? 1 : 0), 0, 1)
    }
    const grip = amount(1),
      trigger = amount(0)
    this.fingers.forEach((joints, i) =>
      joints.forEach((joint, j) => {
        joint.rotation.x = -(
          0.12 +
          (i === 0 ? Math.max(trigger, grip * 0.35) : grip) * [1.1, 1.25, 0.9][j]
        )
      }),
    )
    this.thumb.rotation.y = 0.8 - grip * 0.65
    this.thumb.rotation.z = -grip * 0.5
  }
  dispose(): void {
    this.root.removeFromParent()
    for (const geometry of this.geometries) geometry.dispose()
    this.material.dispose()
    this.cuffMaterial.dispose()
  }
}
