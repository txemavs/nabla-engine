import * as THREE from 'three'

/** Bounds measured in the selected object's axes, then moved with that object. */
export class SelectionOutline extends THREE.Group {
  readonly box = new THREE.Box3()
  private readonly helper = new THREE.Box3Helper(this.box, new THREE.Color('#f2ce8a'))

  constructor() {
    super()
    this.matrixAutoUpdate = false
    this.add(this.helper)
  }

  update(object?: THREE.Object3D): void {
    this.box.makeEmpty()
    if (!object) {
      this.visible = false
      return
    }
    object.updateWorldMatrix(true, true)
    // The outline is a direct child of the render scene, independent of the asset.
    this.matrix.copy(object.matrixWorld)
    this.matrixWorldNeedsUpdate = true
    const visit = (node: THREE.Object3D, relative: THREE.Matrix4): void => {
      if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
        const geometry = node.geometry
        if (!geometry.boundingBox) geometry.computeBoundingBox()
        if (geometry.boundingBox)
          this.box.union(geometry.boundingBox.clone().applyMatrix4(relative))
      }
      for (const child of node.children)
        visit(child, new THREE.Matrix4().multiplyMatrices(relative, child.matrix))
    }
    visit(object, new THREE.Matrix4())
    this.visible = !this.box.isEmpty()
  }
}
