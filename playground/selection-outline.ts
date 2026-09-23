import type { SolidGeometry } from '../src/solid.js'
import * as THREE from 'three'

/** Bounds measured in the selected object's axes, then moved with that object. */
export class SelectionOutline extends THREE.Group {
  readonly box = new THREE.Box3()
  private readonly helper = new THREE.Box3Helper(this.box, new THREE.Color('#f2ce8a'))

  private geometry?: SolidGeometry
  private edges?: THREE.LineSegments

  constructor() {
    super()
    this.matrixAutoUpdate = false
    this.add(this.helper)
  }

  update(object?: THREE.Object3D, geometry?: SolidGeometry): void {
    this.box.makeEmpty()
    if (!object) {
      this.visible = false
      return
    }
    object.updateWorldMatrix(true, true)
    // The outline is a direct child of the render scene, independent of the asset.
    this.matrix.copy(object.matrixWorld)
    this.matrixWorldNeedsUpdate = true
    if (geometry !== this.geometry) {
      if (this.edges) {
        this.edges.geometry.dispose()
        ;(this.edges.material as THREE.Material).dispose()
        this.remove(this.edges)
        this.edges = undefined
      }
      this.geometry = geometry
      if (geometry) {
        const positions: number[] = [],
          seen = new Set<string>()
        for (const face of geometry.faces)
          for (let i = 0; i < face.length; i++) {
            const a = face[i],
              b = face[(i + 1) % face.length]
            const key = a < b ? a + ':' + b : b + ':' + a
            if (seen.has(key)) continue
            seen.add(key)
            positions.push(...geometry.vertices[a], ...geometry.vertices[b])
          }
        const buffer = new THREE.BufferGeometry()
        buffer.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        this.edges = new THREE.LineSegments(
          buffer,
          new THREE.LineBasicMaterial({
            color: '#f2ce8a',
            depthTest: false,
            depthWrite: false,
          }),
        )
        this.edges.renderOrder = 1000
        this.add(this.edges)
      }
    }
    this.helper.visible = !geometry
    if (geometry) {
      this.visible = true
      return
    }
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
