import * as THREE from 'three'

/** Authored chamber geometry, not the zero-origin cartridge group. */
export function ejectionPort(root: THREE.Object3D) {
  const chamber = root.getObjectByName('ChamberExterior') as THREE.Mesh | undefined
  if (!chamber?.geometry) return null
  chamber.updateWorldMatrix(true, false)
  chamber.geometry.computeBoundingBox()
  const bounds = chamber.geometry.boundingBox!
  const position = bounds.getCenter(new THREE.Vector3())
  position.x = bounds.max.x
  return {
    position: chamber.localToWorld(position),
    right: new THREE.Vector3(1, 0, 0).transformDirection(chamber.matrixWorld),
    up: new THREE.Vector3(0, 1, 0).transformDirection(chamber.matrixWorld),
  }
}

/** Keep authored geometry, but tumble around its own centre. */
export function centeredCartridge(source: THREE.Object3D): THREE.Group {
  const clone = source.clone(true)
  clone.position.set(0, 0, 0)
  clone.quaternion.identity()
  clone.visible = true
  const centre = new THREE.Box3().setFromObject(clone).getCenter(new THREE.Vector3())
  clone.position.sub(centre)
  const pivot = new THREE.Group()
  pivot.add(clone)
  return pivot
}
