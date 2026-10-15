import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat/rapier.es.js'
import { initPhysics } from '../simulation/physics.js'

export type XRDisposalTest = (from: THREE.Vector3, to: THREE.Vector3, radius: number) => boolean

/** Directional disposal trigger. Rapier performs the swept-volume intersection. */
export class XRDisposalPortal {
  private ready = false
  readonly initialized: Promise<void>
  constructor(
    private readonly panel: THREE.Object3D,
    private readonly width: number,
    private readonly height: number,
  ) {
    this.initialized = initPhysics().then(() => {
      this.ready = true
    })
  }
  readonly accepts: XRDisposalTest = (from, to, radius) => {
    if (!this.ready || !this.panel.visible || !this.panel.parent?.visible) return false
    const a = this.panel.worldToLocal(from.clone()),
      b = this.panel.worldToLocal(to.clone())
    // +Z faces the user. Only an object travelling into the back may be consumed.
    if (a.z >= 0 || b.z <= a.z + 1e-6) return false
    const scale = this.panel.getWorldScale(new THREE.Vector3())
    const r = radius / Math.min(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z))
    const hit = new RAPIER.Cuboid(this.width / 2, this.height / 2, 0.015).castShape(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: 0, y: 0, z: 0 },
      new RAPIER.Ball(Math.max(0.001, r)),
      a,
      { x: 0, y: 0, z: 0, w: 1 },
      b.sub(a),
      0,
      1,
      true,
    )
    return !!hit
  }
}
