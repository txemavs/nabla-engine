import * as THREE from 'three'

/** Four exhausts. Flames stay unlit. At night each engine throws a pool downward. */
export class CarrierThrusters {
  readonly root = new THREE.Group()
  private readonly jets: THREE.Group[] = []
  private readonly lamps: THREE.SpotLight[] = []
  private power = 0
  constructor() {
    this.root.name = 'Carrier exhaust'
    this.root.visible = false
    for (const x of [-2.02, 2.02])
      for (const z of [-4.52, 4.52]) {
        const jet = new THREE.Group()
        jet.position.set(x, -1.085, z)
        const lamp = new THREE.SpotLight('#d5e6ff', 0, 26, 0.62, 0.45, 2)
        lamp.position.set(x, -1.35, z)
        lamp.target.position.set(x, -18, z)
        lamp.castShadow = false
        this.root.add(lamp, lamp.target)
        this.lamps.push(lamp)
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
  update(active: boolean, speed: number, dt: number, time: number, night = false): void {
    const target = active ? 0.65 + Math.min(1, Math.abs(speed) / 1000) * 0.8 : 0
    this.power = THREE.MathUtils.damp(this.power, target, 8, Math.min(dt, 0.1))
    this.root.visible = night || this.power > 0.01
    for (const lamp of this.lamps) lamp.intensity = night ? 90 : 0
    for (const [i, jet] of this.jets.entries()) {
      jet.visible = this.power > 0.01
      jet.scale.y = this.power * (1 + 0.06 * Math.sin(time * 0.027 + i * 2))
    }
  }
}
