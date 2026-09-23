import * as THREE from 'three'
import { navigationPlaces } from './navigation-places.js'
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
    origin: THREE.Vector3,
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
    // Intersect eye-to-city rays with the actual glass plane. Labels therefore
    // track head movement, clip to the window and never follow the exterior camera.
    const occupied: [number, number][] = []
    for (const place of navigationPlaces()) {
      const point = place.position.clone().sub(origin).applyMatrix4(inverse)
      const t = -eye.z / (point.z - eye.z)
      if (t <= 0 || t > 1) continue
      const x = 512 + ((eye.x + (point.x - eye.x) * t) / 4.65) * 1024
      const y = 300 - ((eye.y + (point.y - eye.y) * t) / 2.85) * 600
      if (
        x < 90 ||
        x > 934 ||
        y < 65 ||
        y > 510 ||
        occupied.some(([px, py]) => Math.abs(px - x) < 190 && Math.abs(py - y) < 32)
      )
        continue
      occupied.push([x, y])
      ctx.strokeText(place.text, x, y, 220)
      ctx.fillText(place.text, x, y, 220)
    }
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
