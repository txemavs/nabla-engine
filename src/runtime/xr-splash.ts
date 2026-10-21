import * as THREE from 'three'

/**
 * WebXR has no API to replace the browser's loading environment (Quest Browser and Quest Link
 * show it until the page submits its first frame). This splash is that first frame: a black
 * room with the host logo two metres ahead, cheap enough to render at once while the game's
 * shaders compile for the headset views, then the game takes over.
 */
export class XRSplash {
  readonly scene = new THREE.Scene()
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private placed = false

  constructor(imageUrl?: string) {
    this.scene.background = new THREE.Color(0x000000)
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
    this.quad.visible = false
    this.scene.add(this.quad)
    if (!imageUrl) return
    new THREE.TextureLoader().load(imageUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace
      const image = texture.image as { width?: number; height?: number }
      const aspect = image.width && image.height ? image.width / image.height : 1
      this.quad.scale.set(0.8 * aspect, 0.8, 1)
      material.map = texture
      material.needsUpdate = true
      this.quad.visible = true
    })
  }

  /** Start again on the next session: the logo is placed ahead of the new head pose. */
  reset(): void {
    this.placed = false
  }

  /** Render the splash with the XR camera; `camera` holds the head pose of the last frame. */
  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera, posed: boolean): void {
    if (posed && !this.placed) {
      const head = camera.getWorldPosition(new THREE.Vector3())
      const ahead = camera.getWorldDirection(new THREE.Vector3()).setY(0)
      if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, -1)
      this.quad.position.copy(head).addScaledVector(ahead.normalize(), 2)
      this.quad.lookAt(head.x, this.quad.position.y, head.z)
      this.placed = true
    }
    renderer.render(this.scene, camera)
  }

  dispose(): void {
    this.quad.material.map?.dispose()
    this.quad.material.dispose()
    this.quad.geometry.dispose()
  }
}
