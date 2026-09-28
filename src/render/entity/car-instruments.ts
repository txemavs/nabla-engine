import { carMenuDefinition, carMenuItems } from '../../catalog/monitors/car.js'
import { LayeredMonitor } from '../monitors/layered-monitor.js'
import { MonitorMenu } from '../monitors/menu.js'
import { s3ClusterDefinition } from '../../catalog/monitors/s3-cluster.js'
import * as THREE from 'three'
import type { SceneDocument, Transform } from '../../stage/scene.js'
import { HelmMap } from './helm-map.js'

/** Displays measured in the original A3 Interior node's local coordinates. */
export class CarInstruments {
  private readonly speedMonitor = new LayeredMonitor(s3ClusterDefinition)
  private gpsSecondary = false
  private frameMs = 16.7
  private lastUpdate?: number
  private readonly mapCanvas = document.createElement('canvas')
  private readonly chart = new HelmMap(this.mapCanvas, true, 4)
  private readonly mapTexture = new THREE.CanvasTexture(this.mapCanvas)
  readonly menu = new MonitorMenu(carMenuItems)
  private menuDisplay?: LayeredMonitor
  toggleMenu(): boolean {
    this.menu.open = !this.menu.open
    if (this.menu.open) {
      if (!this.gpsOpen) this.toggleGps()
      if (!this.menuDisplay) {
        this.menuDisplay = new LayeredMonitor(carMenuDefinition)
        const a = new THREE.Vector3(0.845568, 0.805089, -0.509282)
        const b = new THREE.Vector3(0.665396, 0.804139, -0.531724)
        const c = new THREE.Vector3(0.846191, 0.68512, -0.509205)
        const x = b.clone().sub(a).divideScalar(600)
        const y = a.clone().sub(c).divideScalar(400)
        const z = x.clone().cross(y).normalize().multiplyScalar(0.00002)
        const centre = b.clone().add(c).multiplyScalar(0.5)
        this.menuDisplay.root.matrix.makeBasis(x, y, z).setPosition(centre)
        this.menuDisplay.root.matrixAutoUpdate = false
        this.gpsMount.add(this.menuDisplay.root)
      }
    }
    return this.menu.open
  }
  private powered = false
  private readonly gpsMount = new THREE.Group()
  private navigator!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  private gpsOpen = true
  private gpsProgress = 1
  private gpsFrom = 1
  private gpsStarted = 0
  private gpsAnimating = false
  get gpsState() {
    return { open: this.gpsOpen, progress: this.gpsProgress, mapVersion: this.mapTexture.version }
  }
  toggleGps(now = performance.now()): boolean {
    this.gpsFrom = this.gpsProgress
    this.gpsStarted = now
    this.gpsOpen = !this.gpsOpen
    if (!this.gpsOpen) this.menu.open = false
    this.gpsAnimating = true
    this.lastMapPose = ''
    this.nextMap = 0
    this.navigator.material.color.set(this.gpsOpen ? 0xffffff : 0x000000)
    return this.gpsOpen
  }
  private animateGps(now: number): void {
    if (this.gpsAnimating) {
      const t = Math.max(0, Math.min(1, (now - this.gpsStarted) / 1800))
      this.gpsProgress = THREE.MathUtils.lerp(
        this.gpsFrom,
        this.gpsOpen ? 1 : 0,
        t * t * (3 - 2 * t),
      )
      this.gpsAnimating = t < 1
    }
    this.gpsMount.position.y = -0.145 * (1 - this.gpsProgress)
    this.gpsMount.visible = this.gpsProgress > 0
  }
  private readonly displays: THREE.Mesh[] = []
  private nextMap = 0
  private lastMapPose = ''
  setSecondary(secondary: boolean): void {
    this.gpsSecondary = secondary
    this.speedMonitor.setSecondary(secondary)
    this.menuDisplay?.setSecondary(secondary)
  }
  constructor(interior: THREE.Object3D) {
    this.gpsMount.name = 'A3 retractable GPS'
    // The original GLB combines the screen/bezel with dashboard primitives.
    // Split just its triangles so the physical casing retracts with the display.
    const parts: THREE.Mesh[] = []
    interior.traverse((node) => {
      if (node instanceof THREE.Mesh) parts.push(node)
    })
    for (const part of parts) {
      const geometry = part.geometry
      const position = geometry.getAttribute('position')
      const index = geometry.getIndex()
      if (!position || !index) continue
      const moving: number[] = [],
        fixed: number[] = []
      for (let i = 0; i < index.count; i += 3) {
        const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
        const screen = triangle.every(
          (v) =>
            position.getX(v) > 0.64 &&
            position.getX(v) < 0.87 &&
            position.getY(v) > 0.675 &&
            position.getY(v) < 0.82 &&
            position.getZ(v) > -0.54 &&
            position.getZ(v) < -0.48,
        )
        ;(screen ? moving : fixed).push(...triangle)
      }
      if (!moving.length) continue
      const casingGeometry = geometry.clone()
      casingGeometry.setIndex(moving)
      const casing = new THREE.Mesh(casingGeometry, part.material)
      casing.name = 'A3 GPS casing'
      casing.position.copy(part.position)
      casing.quaternion.copy(part.quaternion)
      casing.scale.copy(part.scale)
      this.gpsMount.add(casing)
      const fixedGeometry = geometry.clone()
      fixedGeometry.setIndex(fixed)
      part.geometry = fixedGeometry
      part.userData.sharedAssetGeometry = false
      // The original geometry belongs to the shared model cache; do not dispose it here.
    }
    interior.add(this.gpsMount)
    for (const texture of [this.mapTexture]) {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.minFilter = THREE.LinearFilter
      texture.generateMipmaps = false
    }
    const digits = this.speedMonitor.root
    digits.name = 'A3 speed readout'
    digits.scale.setScalar(0.00045)
    digits.rotation.y = Math.PI
    digits.position.set(1.135, 0.67, -0.535)
    digits.visible = false
    interior.add(digits)
    this.speedMonitor.ready.catch((error) => console.warn('Could not load S3 dials', error))
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
    this.navigator = navigator
    this.gpsMount.add(navigator)
  }
  setPowered(powered: boolean): void {
    this.powered = powered
    this.speedMonitor.root.visible = powered
    for (const display of this.displays) display.visible = powered
    if (this.menuDisplay) this.menuDisplay.root.visible = powered && this.menu.open
    if (!powered) this.menu.open = false
  }
  update(
    doc: SceneDocument,
    pose: Transform,
    speedKmh: number,
    now: number,
    rpm = 900,
    gear = 1,
    load = 0,
  ): void {
    if (!this.powered) return
    if (this.lastUpdate !== undefined)
      this.frameMs += (Math.min(100, Math.max(0, now - this.lastUpdate)) - this.frameMs) * 0.04
    this.lastUpdate = now
    this.animateGps(now)
    this.navigator.visible = !this.menu.open
    if (this.menuDisplay) {
      this.menuDisplay.root.visible = this.menu.open
      this.menuDisplay.update(
        {
          values: {
            ...this.menu.lines,
            title: 'NABLA / CARROCERIA',
            help: 'ARRIBA/ABAJO  ENTER  J: SALIR',
          },
          bars: {},
        },
        now,
      )
    }
    const speed = Math.round(Math.abs(speedKmh))
    this.speedMonitor.update(
      {
        values: {
          speed: Math.abs(speedKmh),
          speedDisplay: String(speed),
          rpm,
          gear: gear < 0 ? 'R' : `D${gear}`,
          throttle: `${Math.round(load * 100)} %`,
        },
        bars: { speed: speed / 320, rpm: rpm / 7000, throttle: load },
      },
      now,
    )
    if (this.gpsOpen && !this.menu.open && now >= this.nextMap) {
      this.nextMap =
        now + (this.gpsSecondary ? 1200 : 300) * Math.min(4, Math.max(1, this.frameMs / 22))
      const mapPose = [
        ...pose.position.map((v) => Math.round(v * 2)),
        ...pose.rotation.map((v) => Math.round(v * 200)),
      ].join(',')
      if (mapPose === this.lastMapPose) return
      this.lastMapPose = mapPose
      this.chart.update(doc, pose, now)
      this.mapTexture.needsUpdate = true
    }
  }
  dispose(): void {
    this.menuDisplay?.dispose()
    this.speedMonitor.dispose()
    this.mapTexture.dispose()
  }
}
