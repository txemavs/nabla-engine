import * as THREE from 'three'
import type { Vec3Tuple } from '../../entity/schema.js'

const LIFE_MS = 160
const MAX_BURSTS = 12
const PER_BURST = 10

type Burst = {
  birth: number
  origin: THREE.Vector3
  velocities: THREE.Vector3[]
}

/** Brief pin-spark bursts at bullet impact points. */
export class ShotSparks {
  readonly root = new THREE.Group()
  private readonly geometry = new THREE.BufferGeometry()
  private readonly material = new THREE.PointsMaterial({
    color: '#ffe7ac',
    size: 0.045,
    sizeAttenuation: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    toneMapped: false,
  })
  private readonly points: THREE.Points
  private readonly positions = new Float32Array(MAX_BURSTS * PER_BURST * 3)
  private readonly bursts: Burst[] = []
  private disposed = false

  constructor() {
    this.root.name = 'Shot sparks'
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setDrawRange(0, 0)
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    this.root.add(this.points)
    this.root.raycast = () => undefined
  }

  add(origin: Vec3Tuple, now: number, normal?: Vec3Tuple): void {
    if (this.disposed || !Number.isFinite(now)) return
    if (this.bursts.length === MAX_BURSTS) this.bursts.shift()
    const n = normal
      ? new THREE.Vector3(...normal).normalize()
      : new THREE.Vector3(0, 1, 0)
    const tangent = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const bitangent = new THREE.Vector3().crossVectors(n, tangent).normalize()
    tangent.crossVectors(bitangent, n).normalize()
    const velocities: THREE.Vector3[] = []
    for (let i = 0; i < PER_BURST; i++) {
      const u = Math.random() * 2 - 1
      const v = Math.random() * 2 - 1
      const speed = 1.2 + Math.random() * 2.4
      velocities.push(
        n
          .clone()
          .multiplyScalar(0.55 + Math.random() * 0.9)
          .addScaledVector(tangent, u)
          .addScaledVector(bitangent, v)
          .normalize()
          .multiplyScalar(speed),
      )
    }
    this.bursts.push({ birth: now, origin: new THREE.Vector3(...origin), velocities })
  }

  update(now: number): void {
    if (this.disposed) return
    const live = this.bursts.filter((b) => now - b.birth <= LIFE_MS)
    this.bursts.length = 0
    this.bursts.push(...live)
    let write = 0
    let newest = -Infinity
    for (const burst of this.bursts) {
      const age = (now - burst.birth) / 1000
      newest = Math.max(newest, burst.birth)
      for (const velocity of burst.velocities) {
        const o = write * 3
        this.positions[o] = burst.origin.x + velocity.x * age
        this.positions[o + 1] = burst.origin.y + velocity.y * age - 4.5 * age * age
        this.positions[o + 2] = burst.origin.z + velocity.z * age
        write++
      }
    }
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.setDrawRange(0, write)
    if (write) this.geometry.computeBoundingSphere()
    this.material.opacity = this.bursts.length
      ? Math.max(0, 1 - (now - newest) / LIFE_MS)
      : 0
  }

  clear(): void {
    this.bursts.length = 0
    this.geometry.setDrawRange(0, 0)
    this.material.opacity = 1
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clear()
    this.root.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }
}
