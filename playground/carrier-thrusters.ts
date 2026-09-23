import * as THREE from 'three'

/** Eight unlit low-poly meshes; no extra lights, particles or render targets. */
export class CarrierThrusters {
  readonly root = new THREE.Group()
  private readonly jets: THREE.Group[] = []
  private power = 0
  constructor() {
    this.root.name = 'Carrier exhaust'
    this.root.visible = false
    for (const x of [-2.02, 2.02])
      for (const z of [-4.52, 4.52]) {
        const jet = new THREE.Group()
        jet.position.set(x, -1.085, z)
        for (const [radius, length, color, opacity] of [
          [0.25, 1.1, 0x328dff, 0.45],
          [0.12, 0.7, 0xd9f5ff, 0.85],
        ]) {
          const flame = new THREE.Mesh(
            new THREE.ConeGeometry(radius, length, 8),
            new THREE.MeshBasicMaterial({
              color,
              transparent: true,
              opacity,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
              side: THREE.DoubleSide,
            }),
          )
          flame.rotation.z = Math.PI
          flame.position.y = -length / 2
          jet.add(flame)
        }
        this.root.add(jet)
        this.jets.push(jet)
      }
  }
  update(active: boolean, speed: number, dt: number, time: number): void {
    const target = active ? 0.65 + Math.min(1, Math.abs(speed) / 1000) * 0.8 : 0
    this.power = THREE.MathUtils.damp(this.power, target, 8, Math.min(dt, 0.1))
    this.root.visible = this.power > 0.01
    for (const [i, jet] of this.jets.entries())
      jet.scale.y = this.power * (1 + 0.06 * Math.sin(time * 0.027 + i * 2))
  }
}
