import type { CarInstrumentDefinition } from './car-instrument-definition.js'
import { LayeredMonitor } from '../monitors/layered-monitor.js'
import { MonitorMenu } from '../monitors/menu.js'
import * as THREE from 'three'
import type { SceneDocument } from '../../scene/document.js'
import type { Transform } from '../../entity/schema.js'
import { localToGeo } from '../../math/geo/sphere.js'
import { HelmMap } from './helm-map.js'
import { RetractableMount } from '../vehicle-presentation/retractable.js'
import {
  quadGeometry,
  surfaceMatrix,
  type InstrumentMounts,
} from '../vehicle-presentation/mounts.js'

/** Telemetry/menu/GPS controller mounted by an explicit asset adapter. */
export class CarInstruments {
  private readonly speedMonitor: LayeredMonitor
  mirrorTilt = -2
  mapFollow = true
  private gpsSecondary = false
  private frameMs = 16.7
  private lastUpdate?: number
  private readonly mapCanvas = document.createElement('canvas')
  private readonly chart = new HelmMap(this.mapCanvas, true, 4, true)
  private readonly mapTexture = new THREE.CanvasTexture(this.mapCanvas)
  readonly menu: MonitorMenu
  private menuDisplay?: LayeredMonitor
  toggleMenu(): boolean {
    if (this.disposed) return false
    this.menu.open = !this.menu.open
    if (this.menu.open) {
      if (!this.gpsOpen) this.toggleGps()
      if (!this.menuDisplay) {
        this.menuDisplay = new LayeredMonitor(this.definition.menu)
        this.menuDisplay.setSecondary(this.gpsSecondary)
        this.menuDisplay.ready.catch((error) => console.warn('Could not load car menu', error))
        this.menuDisplay.root.matrix.copy(
          surfaceMatrix(this.mounts.menu, this.definition.menu.width, this.definition.menu.height),
        )
        this.menuDisplay.root.matrixAutoUpdate = false
        this.mounts.support.add(this.menuDisplay.root)
      }
    }
    return this.menu.open
  }
  private powered = false
  private readonly retraction: RetractableMount
  private navigator!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  private get gpsOpen() {
    return this.retraction.open
  }
  get gpsState() {
    return {
      open: this.gpsOpen,
      progress: this.retraction.progress,
      mapVersion: this.mapTexture.version,
    }
  }
  toggleGps(now = performance.now()): boolean {
    if (this.disposed) return false
    const open = this.retraction.toggle(now)
    if (!open) this.menu.open = false
    this.lastMapPose = ''
    this.nextMap = 0
    this.navigator.material.color.set(open ? 0xffffff : 0x000000)
    return open
  }
  private readonly displays: THREE.Mesh[] = []
  private nextMap = 0
  private lastMapPose = ''
  setMapFollow(follow: boolean): void {
    this.mapFollow = follow
    this.chart.headingUp = follow
    this.lastMapPose = ''
    this.nextMap = 0
  }
  setSecondary(secondary: boolean): void {
    this.gpsSecondary = secondary
    this.speedMonitor.setSecondary(secondary)
    this.menuDisplay?.setSecondary(secondary)
  }
  constructor(
    private readonly mounts: InstrumentMounts,
    private readonly definition: CarInstrumentDefinition,
  ) {
    this.speedMonitor = new LayeredMonitor(definition.cluster)
    this.menu = new MonitorMenu(definition.menuItems, definition.menuTitle)
    this.retraction = new RetractableMount(
      mounts.support,
      mounts.retract.offset,
      mounts.retract.durationMs,
    )
    for (const texture of [this.mapTexture]) {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.minFilter = THREE.LinearFilter
      texture.generateMipmaps = false
    }
    const digits = this.speedMonitor.root
    digits.name = mounts.cluster.name
    digits.scale.setScalar(mounts.cluster.scale)
    digits.quaternion.fromArray(mounts.cluster.rotation)
    digits.position.fromArray(mounts.cluster.position)
    digits.visible = false
    mounts.parent.add(digits)
    this.speedMonitor.ready.catch((error) => console.warn('Could not load car instruments', error))
    const geometry = quadGeometry(mounts.navigator)
    const navigator = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        map: this.mapTexture,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    )
    navigator.name = mounts.navigatorName
    navigator.visible = false
    this.displays.push(navigator)
    this.navigator = navigator
    this.mounts.support.add(navigator)
    this.retraction.update(0)
  }
  setPowered(powered: boolean): void {
    if (this.disposed) return
    if (powered && !this.powered) {
      this.retraction.reset()
      this.navigator.material.color.set(0x000000)
      this.retraction.update(0)
    }
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
    manual = false,
    parked = false,
    altitude = 0,
  ): void {
    if (this.disposed || !this.powered) return
    if (this.lastUpdate !== undefined)
      this.frameMs += (Math.min(100, Math.max(0, now - this.lastUpdate)) - this.frameMs) * 0.04
    this.lastUpdate = now
    this.retraction.update(now)
    this.navigator.visible = !this.menu.open && (!this.mounts.sharedSurface || this.gpsOpen)
    if (this.mounts.sharedSurface) this.speedMonitor.root.visible = !this.menu.open && !this.gpsOpen
    if (this.menuDisplay) {
      this.menuDisplay.root.visible = this.menu.open
      this.menuDisplay.update(
        this.definition.menuData(this.menu, {
          ...this,
          heading: vehicleRumbo(pose.rotation),
          ...gpsFix(doc, pose.position),
          altitude,
        }),
        now,
      )
    }
    this.speedMonitor.update(
      this.definition.clusterData({ speedKmh, rpm, gear, load, manual, parked }),
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
  private disposed = false
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.menuDisplay?.dispose()
    this.speedMonitor.dispose()
    this.mapTexture.dispose()
    this.navigator.removeFromParent()
    this.navigator.geometry.dispose()
    this.navigator.material.dispose()
    this.mounts.dispose()
  }
}

/** Compass heading 0–359 from the entity quaternion.
 * Same `(-yaw·180/π) mod 360` rule as helm `sys-rumbo`, but YXZ so 180° does not fold to 0.
 */
export function vehicleRumbo(rotation: readonly [number, number, number, number]): number {
  const yaw = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...rotation), 'YXZ').y
  return (Math.round(((-yaw * 180) / Math.PI) % 360) + 360) % 360
}

function gpsFix(doc: SceneDocument, position: readonly [number, number, number]) {
  if (!doc.geography) return { geography: false as const }
  const gps = localToGeo(doc.geography, [...position])
  if (!Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude))
    return { geography: false as const }
  return { geography: true as const, longitude: gps.longitude, latitude: gps.latitude }
}
