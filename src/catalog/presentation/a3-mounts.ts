import * as THREE from 'three'
import type { InstrumentMounts } from '../../render/vehicle-presentation/mounts.js'

/** Legacy asset coordinates stay here. New assets should provide named mount nodes. */
export function createA3Mounts(model: THREE.Object3D): InstrumentMounts | undefined {
  const interior = model.getObjectByName('Interior')
  if (!interior) {
    console.warn('S3 instruments omitted: missing Interior mount')
    return undefined
  }
  const support = new THREE.Group()
  support.name = 'A3 retractable GPS'
  const releases: (() => void)[] = []
  // The original GLB combines the screen/bezel with dashboard primitives.
  // Split just its triangles so the physical casing retracts with the display.
  const parts: THREE.Mesh[] = []
  interior.traverse((node) => {
    if (node instanceof THREE.Mesh) parts.push(node)
  })
  for (const part of parts) {
    const geometry = part.geometry
    const shared = part.userData.sharedAssetGeometry
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()
    if (!position || !index) continue
    const moving: number[] = [],
      fixed: number[] = []
    for (let i = 0; i < index.count; i += 3) {
      const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
      const screen = triangle.every(
        (v) =>
          position.getX(v) > 0.64 &&
          position.getX(v) < 0.87 &&
          position.getY(v) > 0.675 &&
          position.getY(v) < 0.82 &&
          position.getZ(v) > -0.54 &&
          position.getZ(v) < -0.48,
      )
      ;(screen ? moving : fixed).push(...triangle)
    }
    if (!moving.length) continue
    const casingGeometry = geometry.clone()
    casingGeometry.setIndex(moving)
    const casing = new THREE.Mesh(casingGeometry, part.material)
    casing.name = 'A3 GPS casing'
    casing.position.copy(part.position)
    casing.quaternion.copy(part.quaternion)
    casing.scale.copy(part.scale)
    support.add(casing)
    const fixedGeometry = geometry.clone()
    fixedGeometry.setIndex(fixed)
    releases.push(() => {
      part.geometry = geometry
      part.userData.sharedAssetGeometry = shared
      fixedGeometry.dispose()
      casing.removeFromParent()
      casingGeometry.dispose()
    })
    part.geometry = fixedGeometry
    part.userData.sharedAssetGeometry = false
    // The original geometry belongs to the shared model cache; do not dispose it here.
  }

  interior.add(support)
  let disposed = false
  return {
    parent: interior,
    support,
    cluster: {
      position: [1.135, 0.67, -0.535],
      rotation: [0, 1, 0, 0],
      scale: 0.00045,
      name: 'A3 speed readout',
    },
    menu: [
      [0.845568, 0.805089, -0.509282],
      [0.665396, 0.804139, -0.531724],
      [0.846191, 0.68512, -0.509205],
      [0.666019, 0.68417, -0.531646],
    ],
    navigator: [
      [0.845568, 0.805089, -0.508282],
      [0.665396, 0.804139, -0.530724],
      [0.846191, 0.68512, -0.508205],
      [0.666019, 0.68417, -0.530646],
    ],
    navigatorName: 'A3 navigator',
    retract: { offset: [0, -0.145, 0], durationMs: 1800 },
    dispose() {
      if (disposed) return
      disposed = true
      releases.forEach((release) => release())
      support.removeFromParent()
    },
  }
}
