import * as THREE from 'three'
import type { Vec3Tuple } from '../../entity/schema.js'

/** World-space laser sight: thin beam from muzzle to aim point plus a surface pin. */
export class ShotLaser {
  readonly root = new THREE.Group()
  private readonly beamGeom = new THREE.BufferGeometry()
  private readonly beamMat = new THREE.LineBasicMaterial({
    color: '#ff2a2a',
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    toneMapped: false,
  })
  private readonly beam: THREE.Line
  private readonly positions = new Float32Array(6)
  private readonly pin: THREE.Mesh
  private disposed = false
  private on = false

  constructor() {
    this.root.name = 'Shot laser'
    this.beamGeom.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.beam = new THREE.Line(this.beamGeom, this.beamMat)
    this.beam.frustumCulled = false
    this.beam.renderOrder = 6
    this.pin = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 8, 6),
      new THREE.MeshBasicMaterial({
        color: '#ff4444',
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    this.pin.renderOrder = 7
    this.root.add(this.beam, this.pin)
    this.root.visible = false
    this.root.raycast = () => undefined
  }

  set enabled(value: boolean) {
    this.on = value
    this.root.visible = value
  }

  get enabled(): boolean {
    return this.on
  }

  /** Update beam from muzzle to end; pin sits on the end when `hit` is true. */
  set(origin: Vec3Tuple, end: Vec3Tuple, hit: boolean): void {
    if (this.disposed || !this.on) return
    this.positions[0] = origin[0]
    this.positions[1] = origin[1]
    this.positions[2] = origin[2]
    this.positions[3] = end[0]
    this.positions[4] = end[1]
    this.positions[5] = end[2]
    this.beamGeom.attributes.position.needsUpdate = true
    this.beamGeom.computeBoundingSphere()
    this.pin.position.set(end[0], end[1], end[2])
    this.pin.visible = hit
  }

  clear(): void {
    this.pin.visible = false
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.root.removeFromParent()
    this.beamGeom.dispose()
    this.beamMat.dispose()
    this.pin.geometry.dispose()
    ;(this.pin.material as THREE.Material).dispose()
  }
}
