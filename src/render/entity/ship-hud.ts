import * as THREE from 'three'
import { LayeredMonitor } from '../monitors/layered-monitor.js'
/** Layered navigation readings with an optional canvas artificial horizon. */
export class ShipHud {
  readonly mesh: THREE.Mesh
  private canvas = document.createElement('canvas')
  private texture: THREE.CanvasTexture
  private readonly readings: LayeredMonitor
  private disposed = false
  private next = 0
  constructor(private readonly navigationOnly = false) {
    this.readings = new LayeredMonitor({
      width: 1024,
      height: 600,
      layers: [
        {
          id: 'speed',
          kind: 'text',
          binding: 'speed',
          x: 30,
          y: navigationOnly ? 100 : 530,
          width: navigationOnly ? 900 : 280,
          height: navigationOnly ? 150 : 30,
          columns: 12,
          color: '#79ff9c',
          align: 'center',
        },
        {
          id: 'altitude',
          kind: 'text',
          binding: 'altitude',
          x: navigationOnly ? 30 : 700,
          y: navigationOnly ? 350 : 530,
          width: navigationOnly ? 900 : 300,
          height: navigationOnly ? 130 : 30,
          columns: 16,
          color: '#79ff9c',
          align: 'center',
        },
      ],
    })
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
    this.readings.root.scale.set(4.65 / 1024, 2.85 / 600, 1)
    this.readings.root.position.z = 0.002
    this.mesh.add(this.readings.root)
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
    if (this.disposed) return
    this.mesh.visible = !!telemetry
    if (!telemetry || now < this.next) return
    this.next = now + 100
    this.mesh.updateWorldMatrix(true, false)
    const inverse = this.mesh.matrixWorld.clone().invert()
    const eye = camera.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse)
    this.readings.update(
      {
        values: {
          speed: `${Math.round(telemetry.speedKmh)} km/h`,
          altitude: `ALT ${Math.round(telemetry.altitude)} m`,
        },
        bars: {},
      },
      now,
    )
    if (this.navigationOnly) return
    const ctx = this.canvas.getContext('2d')!
    ctx.clearRect(0, 0, 1024, 600)
    this.readings.root.visible = eye.z > 0
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
    this.texture.needsUpdate = true
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.mesh.removeFromParent()
    this.readings.dispose()
    this.texture.dispose()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
