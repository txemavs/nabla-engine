import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
/** Side mirrors render only in the occupied cockpit, at most 8 Hz. */
export class CarMirrors {
  private entries: {
    original: THREE.Mesh
    mirror: Reflector
    render: Reflector['onBeforeRender']
  }[] = []
  private next = 0
  private frames = 0
  constructor(model: THREE.Object3D) {
    const candidates: THREE.Mesh[] = []
    model.traverse((o) => {
      if (
        o instanceof THREE.Mesh &&
        o.material instanceof THREE.MeshStandardMaterial &&
        o.material.name === 'Llanta 2'
      )
        candidates.push(o)
    })
    for (const original of candidates) {
      const geometry = original.geometry.clone()
      geometry.computeBoundingBox()
      const centre = geometry.boundingBox!.getCenter(new THREE.Vector3())
      const normals = geometry.getAttribute('normal'),
        normal = new THREE.Vector3()
      for (let i = 0; i < normals.count; i++)
        normal.add(new THREE.Vector3().fromBufferAttribute(normals, i))
      normal.normalize()
      const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
      const basis = new THREE.Matrix4().compose(centre, rotation, new THREE.Vector3(1, 1, 1))
      geometry.applyMatrix4(basis.clone().invert())
      // The authored lens is slightly curved. Place a planar reflection at its
      // frontmost surface so the oblique clip plane excludes its own housing.
      geometry.computeBoundingBox()
      centre.addScaledVector(normal, geometry.boundingBox!.max.z + 0.003)
      const positions = geometry.getAttribute('position')
      for (let i = 0; i < positions.count; i++) positions.setZ(i, 0)
      positions.needsUpdate = true
      geometry.computeBoundingBox()
      geometry.computeBoundingSphere()
      const mirror = new Reflector(geometry, {
        textureWidth: 384,
        textureHeight: 256,
        color: 0xaaaaaa,
        multisample: 0,
        clipBias: 0.003,
      })
      mirror.position.copy(centre)
      mirror.quaternion.copy(rotation)
      mirror.visible = false
      original.parent!.add(mirror)
      const render = mirror.onBeforeRender
      mirror.onBeforeRender = () => {}
      this.entries.push({ original, mirror, render })
    }
  }
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    enabled: boolean,
    now: number,
  ): void {
    for (const e of this.entries) {
      e.mirror.visible = enabled
      e.original.visible = !enabled
    }
    renderer.domElement.dataset.mirrorActive = String(enabled && this.entries.length > 0)
    renderer.domElement.dataset.mirrorFrames = String(this.frames)
    if (!enabled || now < this.next) return
    this.next = now + 125
    scene.updateMatrixWorld(true)
    camera.updateMatrixWorld(true)
    const projection = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    )
    const frustum = new THREE.Frustum().setFromProjectionMatrix(projection)
    const background = scene.background,
      autoClear = renderer.autoClear
    const visible = this.entries.map((e) => e.mirror.visible)
    try {
      // No recursive mirror captures; keep an inexpensive atmospheric background.
      for (const e of this.entries) {
        e.mirror.visible = false
        e.original.visible = true
      }
      if (!scene.background) scene.background = scene.fog?.color ?? new THREE.Color('#50677d')
      renderer.autoClear = true
      for (const e of this.entries) {
        if (!frustum.intersectsObject(e.mirror)) continue
        const eye = camera.position.clone().sub(e.mirror.getWorldPosition(new THREE.Vector3()))
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(e.mirror.matrixWorld)
        if (eye.dot(normal) <= 0) continue
        // Crop the viewer's projection to the small mirror instead of wasting its target on the entire windshield view.
        e.mirror.geometry.computeBoundingBox()
        const box = e.mirror.geometry.boundingBox!,
          corners: THREE.Vector3[] = []
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z])
              corners.push(
                new THREE.Vector3(x, y, z).applyMatrix4(e.mirror.matrixWorld).project(camera),
              )
        const left = Math.max(-1, Math.min(...corners.map((p) => p.x))),
          right = Math.min(1, Math.max(...corners.map((p) => p.x)))
        const bottom = Math.max(-1, Math.min(...corners.map((p) => p.y))),
          top = Math.min(1, Math.max(...corners.map((p) => p.y)))
        if (right <= left || top <= bottom) continue
        const cropped = camera.clone()
        cropped.setViewOffset(
          1000 * camera.aspect,
          1000,
          (left + 1) * 500 * camera.aspect,
          (1 - top) * 500,
          (right - left) * 500 * camera.aspect,
          (top - bottom) * 500,
        )
        e.original.visible = false
        e.render.call(
          e.mirror,
          renderer,
          scene,
          cropped,
          e.mirror.geometry,
          e.mirror.material as THREE.Material,
          null!,
        )
        e.mirror.visible = false
        e.original.visible = true
        this.frames++
      }
    } finally {
      scene.background = background
      renderer.autoClear = autoClear
      this.entries.forEach((e, i) => {
        e.mirror.visible = visible[i]
        e.original.visible = !enabled
      })
      renderer.domElement.dataset.mirrorFrames = String(this.frames)
    }
  }
  dispose(): void {
    for (const e of this.entries) e.mirror.dispose()
  }
}
