import * as THREE from 'three'
import type { Vec3Tuple } from '../../entity/schema.js'

const LIFE_MS = 90
const MAX = 24

/** Short-lived muzzle-to-impact streaks for sidearm shots (Agency ship / gallery feedback). */
export class ShotTracers {
  readonly root = new THREE.Group()
  private readonly geometry = new THREE.BufferGeometry()
  private readonly material = new THREE.LineBasicMaterial({
    color: '#ffe7ac',
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    toneMapped: false,
  })
  private readonly line: THREE.LineSegments
  private readonly positions = new Float32Array(MAX * 6)
  private readonly births = new Float64Array(MAX)
  private count = 0
  private disposed = false

  constructor() {
    this.root.name = 'Shot tracers'
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setDrawRange(0, 0)
    this.line = new THREE.LineSegments(this.geometry, this.material)
    this.line.frustumCulled = false
    this.line.renderOrder = 4
    this.root.add(this.line)
    this.root.raycast = () => undefined
  }

  add(origin: Vec3Tuple, end: Vec3Tuple, now: number): void {
    if (this.disposed || !Number.isFinite(now)) return
    if (this.count === MAX) {
      this.positions.copyWithin(0, 6)
      this.births.copyWithin(0, 1)
      this.count = MAX - 1
    }
    const o = this.count * 6
    this.positions[o] = origin[0]
    this.positions[o + 1] = origin[1]
    this.positions[o + 2] = origin[2]
    this.positions[o + 3] = end[0]
    this.positions[o + 4] = end[1]
    this.positions[o + 5] = end[2]
    this.births[this.count] = now
    this.count++
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.setDrawRange(0, this.count * 2)
    this.geometry.computeBoundingSphere()
  }

  update(now: number): void {
    if (this.disposed || this.count === 0) return
    let write = 0
    let newest = -Infinity
    for (let i = 0; i < this.count; i++) {
      if (now - this.births[i] > LIFE_MS) continue
      if (write !== i) {
        this.positions.copyWithin(write * 6, i * 6, i * 6 + 6)
        this.births[write] = this.births[i]
      }
      newest = Math.max(newest, this.births[write]!)
      write++
    }
    if (write !== this.count) {
      this.count = write
      this.geometry.attributes.position.needsUpdate = true
      this.geometry.setDrawRange(0, this.count * 2)
    }
    this.material.opacity = this.count ? Math.max(0, 1 - (now - newest) / LIFE_MS) * 0.95 : 0.95
  }

  clear(): void {
    this.count = 0
    this.geometry.setDrawRange(0, 0)
    this.material.opacity = 0.95
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
