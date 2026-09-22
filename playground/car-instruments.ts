import * as THREE from 'three'
import type { SceneDocument, Transform } from '../src/scene.js'
import { HelmMap } from './helm-map.js'

/** Displays measured in the original A3 Interior node's local coordinates. */
export class CarInstruments {
  private readonly speedCanvas = document.createElement('canvas')
  private readonly mapCanvas = document.createElement('canvas')
  private readonly chart = new HelmMap(this.mapCanvas, true, 4)
  private readonly speedTexture = new THREE.CanvasTexture(this.speedCanvas)
  private readonly mapTexture = new THREE.CanvasTexture(this.mapCanvas)
  private powered = false
  private readonly displays: THREE.Mesh[] = []
  private lastSpeed = -1
  private nextMap = 0
  constructor(interior: THREE.Object3D) {
    this.speedCanvas.width = 256
    this.speedCanvas.height = 128
    for (const texture of [this.speedTexture, this.mapTexture]) {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.minFilter = THREE.LinearFilter
      texture.generateMipmaps = false
    }
    const digits = new THREE.Mesh(
      new THREE.PlaneGeometry(0.1, 0.05),
      new THREE.MeshBasicMaterial({
        map: this.speedTexture,
        transparent: true,
        toneMapped: false,
        depthWrite: false,
      }),
    )
    digits.name = 'A3 speed readout'
    digits.rotation.y = Math.PI
    digits.position.set(1.135, 0.685, -0.533)
    digits.visible = false
    this.displays.push(digits)
    interior.add(digits)
    // Exact inset quadrilateral: the original display is slightly turned toward the driver.
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          0.845568, 0.805089, -0.508282, 0.665396, 0.804139, -0.530724, 0.846191, 0.68512,
          -0.508205, 0.666019, 0.68417, -0.530646,
        ],
        3,
      ),
    )
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2))
    geometry.setIndex([0, 2, 1, 2, 3, 1])
    const navigator = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        map: this.mapTexture,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    )
    navigator.name = 'A3 navigator'
    navigator.visible = false
    this.displays.push(navigator)
    interior.add(navigator)
  }
  setPowered(powered: boolean): void {
    this.powered = powered
    for (const display of this.displays) display.visible = powered
  }
  update(doc: SceneDocument, pose: Transform, speedKmh: number, now: number): void {
    if (!this.powered) return
    const speed = Math.round(Math.abs(speedKmh))
    if (speed !== this.lastSpeed) {
      this.lastSpeed = speed
      const ctx = this.speedCanvas.getContext('2d')!
      ctx.clearRect(0, 0, 256, 128)
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '600 50px sans-serif'
      ctx.fillText(String(speed), 128, 67)
      this.speedTexture.needsUpdate = true
    }
    if (now >= this.nextMap) {
      this.nextMap = now + 250
      this.chart.update(doc, pose, now)
      this.mapTexture.needsUpdate = true
    }
  }
  dispose(): void {
    this.speedTexture.dispose()
    this.mapTexture.dispose()
  }
}
