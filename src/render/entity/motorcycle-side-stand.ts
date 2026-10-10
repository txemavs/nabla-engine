import * as THREE from 'three'

/** A slim left-side leg, hinged below the rider footpeg and folded back under it when riding. */
export class MotorcycleSideStand {
  readonly root = new THREE.Group()
  private readonly leg = new THREE.Group()
  private readonly folded: THREE.Quaternion
  private readonly deployed = new THREE.Quaternion()
  private progress = 0

  constructor(bottom: number) {
    this.root.name = 'Motorcycle side stand'
    this.root.position.set(-0.155, bottom + 0.265, 0.1)
    const black = new THREE.MeshStandardMaterial({
      color: '#17191a',
      metalness: 0.65,
      roughness: 0.5,
    })
    const spring = new THREE.MeshStandardMaterial({
      color: '#605a48',
      metalness: 0.8,
      roughness: 0.5,
    })
    const bar = (a: THREE.Vector3, b: THREE.Vector3, radius: number, material = black) => {
      const direction = b.clone().sub(a)
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.8, radius, direction.length(), 8),
        material,
      )
      mesh.position.copy(a).add(b).multiplyScalar(0.5)
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
      this.leg.add(mesh)
    }
    const foot = new THREE.Vector3(-0.17, -0.257, 0.055)
    bar(new THREE.Vector3(), foot, 0.011)
    // Small flat shoe and the discreet toe tang used to lower the leg.
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.038), black)
    shoe.position.copy(foot)
    this.leg.add(shoe)
    bar(foot.clone().multiplyScalar(0.75), new THREE.Vector3(-0.18, -0.19, 0.1), 0.004)
    bar(
      new THREE.Vector3(0.006, -0.02, 0.017),
      new THREE.Vector3(-0.065, -0.11, 0.037),
      0.006,
      spring,
    )
    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.038, 0.045), black)
    mount.position.set(0.004, 0.012, 0)
    this.root.add(mount, this.leg)
    this.folded = new THREE.Quaternion().setFromUnitVectors(
      foot.clone().normalize(),
      new THREE.Vector3(-0.01, -0.035, 0.3).normalize(),
    )
    this.leg.quaternion.copy(this.folded)
  }

  /** Move the actual hinge over about half a second; the folded leg remains part of the bike. */
  update(elapsed: number, parked: boolean): void {
    const target = parked ? 1 : 0
    const step = Math.max(0, elapsed) / 0.45
    this.progress += THREE.MathUtils.clamp(target - this.progress, -step, step)
    const t = this.progress * this.progress * (3 - 2 * this.progress)
    this.leg.quaternion.copy(this.folded).slerp(this.deployed, t)
  }
}
