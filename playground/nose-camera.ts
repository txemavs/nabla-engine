import * as THREE from 'three'
import type { SceneView } from './view.js'

/** A bounded, non-recursive external camera feed shared with the helm's wide display. */
export class NoseCamera {
  private entries = new Map<string, { target: THREE.WebGLRenderTarget; screen: THREE.Mesh }>()
  private frames = 0
  private next = 0
  bind(view: SceneView): void {
    for (const entry of this.entries.values()) entry.target.dispose()
    this.entries.clear()
    for (const [id, screen] of view.noseScreens) {
      const target = new THREE.WebGLRenderTarget(960, 256)
      ;(screen.material as THREE.MeshBasicMaterial).map = target.texture
      ;(screen.material as THREE.MeshBasicMaterial).color.set('white')
      ;(screen.material as THREE.MeshBasicMaterial).toneMapped = false
      ;(screen.material as THREE.MeshBasicMaterial).needsUpdate = true
      this.entries.set(id, { target, screen })
    }
    this.next = 0
  }
  render(
    now: number,
    view: SceneView,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    eye: THREE.PerspectiveCamera,
    background: (camera: THREE.PerspectiveCamera) => void,
  ): void {
    if (now < this.next) return
    this.next = now + 100
    const oldTarget = renderer.getRenderTarget(),
      oldAuto = renderer.autoClear,
      oldShadow = renderer.shadowMap.autoUpdate
    const visibility = [...this.entries.values()].map(
      (entry) => [entry.screen, entry.screen.visible] as const,
    )
    const live = [...view.portals.values()].map(
      (entry) => [entry.mesh.material, entry.mesh.material.uniforms.live.value] as const,
    )
    try {
      renderer.shadowMap.autoUpdate = false
      for (const [screen] of visibility) screen.visible = false
      for (const [material] of live) material.uniforms.live.value = 0
      for (const [id, entry] of this.entries) {
        const carrier = view.objects.get(id)!
        carrier.updateWorldMatrix(true, true)
        const origin = carrier.getWorldPosition(new THREE.Vector3())
        if (origin.distanceTo(eye.position) > 20) continue
        const camera = new THREE.PerspectiveCamera(65, 960 / 256, 0.1, eye.far)
        camera.position.copy(carrier.localToWorld(new THREE.Vector3(0, 0.9, -5.45)))
        const target = carrier.localToWorld(new THREE.Vector3(0, -5, -20))
        camera.up.set(0, 1, 0).transformDirection(carrier.matrixWorld)
        camera.lookAt(target)
        renderer.setRenderTarget(entry.target)
        renderer.autoClear = true
        background(camera)
        renderer.render(scene, camera)
        renderer.domElement.dataset.noseCameraFrames = String(++this.frames)
      }
    } finally {
      for (const [screen, visible] of visibility) screen.visible = visible
      for (const [material, value] of live) material.uniforms.live.value = value
      renderer.setRenderTarget(oldTarget)
      renderer.autoClear = oldAuto
      renderer.shadowMap.autoUpdate = oldShadow
    }
  }
}
