import * as THREE from 'three'
/** One transparent canvas on the inside of the bow glass; no world-space labels. */
export class ShipHud {
  readonly mesh: THREE.Mesh
  private canvas = document.createElement('canvas')
  private texture: THREE.CanvasTexture
  private next = 0
  constructor() {
    this.canvas.width = 1024
    this.canvas.height = 600
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.generateMipmaps = false
    this.texture.minFilter = THREE.LinearFilter
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4.65, 2.85),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    this.mesh.position.set(0, 0.55, -4.999)
    this.mesh.name = 'Ship navigation HUD'
    this.mesh.visible = false
    this.mesh.raycast = () => undefined
  }
  update(
    camera: THREE.Camera,
    _origin: THREE.Vector3,
    now: number,
    telemetry: { speedKmh: number; altitude: number } | null,
  ) {
    this.mesh.visible = !!telemetry
    if (!telemetry || now < this.next) return
    this.next = now + 100
    this.mesh.updateWorldMatrix(true, false)
    const inverse = this.mesh.matrixWorld.clone().invert()
    const eye = camera.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse)
    const ctx = this.canvas.getContext('2d')!
    ctx.clearRect(0, 0, 1024, 600)
    if (eye.z <= 0) {
      this.texture.needsUpdate = true
      return
    }
    ctx.font = '24px system-ui'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#79ff9c'
    ctx.strokeStyle = '#102a18'
    ctx.lineWidth = 4
    const up = new THREE.Vector3(0, 1, 0).transformDirection(inverse)
    ctx.save()
    ctx.translate(512, 300)
    ctx.rotate(Math.atan2(up.x, up.y))
    const pitch = THREE.MathUtils.clamp(
      Math.asin(THREE.MathUtils.clamp(up.z, -1, 1)) * 150,
      -100,
      100,
    )
    ctx.strokeStyle = '#79ff9c'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-115, pitch)
    ctx.lineTo(-25, pitch)
    ctx.moveTo(25, pitch)
    ctx.lineTo(115, pitch)
    ctx.stroke()
    ctx.restore()
    ctx.fillText(`${Math.round(telemetry.speedKmh)} km/h`, 160, 560)
    ctx.fillText(`ALT ${Math.round(telemetry.altitude)} m`, 850, 560)
    this.texture.needsUpdate = true
  }
  dispose() {
    this.texture.dispose()
  }
}
