import * as THREE from 'three'
import type { InstrumentMounts } from '../../render/vehicle-presentation/mounts.js'

/** Mount instruments using authored GLB nodes and casing metadata. */
export function createA3Mounts(model: THREE.Object3D): InstrumentMounts | undefined {
  const interior = model.getObjectByName('Interior')
  if (!interior) {
    console.warn('S3 instruments omitted: missing Interior mount')
    return undefined
  }
  const metadata = interior.userData.nabla
  if (!metadata?.gpsCasingBounds || !metadata?.retract)
    throw new Error('A3 GLB is missing instrument mount metadata')
  const mount = (role: string) => {
    let node: THREE.Object3D | undefined
    interior.traverse((candidate) => {
      if (candidate.userData.nabla?.mount === role) node = candidate
    })
    if (!node) throw new Error('Missing instrument anchor: ' + role)
    interior.updateWorldMatrix(true, true)
    const matrix = new THREE.Matrix4()
      .copy(interior.matrixWorld)
      .invert()
      .multiply(node.matrixWorld)
    const position = new THREE.Vector3(),
      quaternion = new THREE.Quaternion(),
      scale = new THREE.Vector3()
    matrix.decompose(position, quaternion, scale)
    return { position, quaternion, scale }
  }
  const quad = (role: string) =>
    [0, 1, 2, 3].map((i) => mount(role + '.' + i).position.toArray()) as InstrumentMounts['menu']
  const cluster = mount('instrument.cluster')
  const bounds = metadata.gpsCasingBounds as { min: number[]; max: number[] }
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
          position.getX(v) > bounds.min[0] &&
          position.getX(v) < bounds.max[0] &&
          position.getY(v) > bounds.min[1] &&
          position.getY(v) < bounds.max[1] &&
          position.getZ(v) > bounds.min[2] &&
          position.getZ(v) < bounds.max[2],
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
      position: cluster.position.toArray(),
      rotation: cluster.quaternion.toArray(),
      scale: cluster.scale.x,
      name: 'A3 speed readout',
    },
    menu: quad('instrument.menu'),
    navigator: quad('instrument.navigator'),
    navigatorName: 'A3 navigator',
    retract: metadata.retract,
    dispose() {
      if (disposed) return
      disposed = true
      releases.forEach((release) => release())
      support.removeFromParent()
    },
  }
}
