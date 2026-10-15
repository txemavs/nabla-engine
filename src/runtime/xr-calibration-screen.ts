import type { XRQualityMenu } from './xr-quality.js'
import * as THREE from 'three'
import { HtmlMonitor } from '../render/monitors/html-monitor.js'
import { assets, disposeObject } from '../render/entity/assets.js'
import type { XRCalibration, XRCalibrationObject, XRPoseAdjustment } from './xr-calibration.js'

export interface CalibrationPointer {
  source: XRInputSource
  tip: THREE.Vector3
  armed: boolean
  aim: THREE.Object3D
}
const width = 2,
  height = 1.25
const keys = ['x', 'y', 'z', 'rx', 'ry', 'rz'] as const

/** A real HTML monitor texture in the stock portal frame, with explicit XR hit regions. */
export class XRCalibrationScreen {
  qualityMenu?: XRQualityMenu
  development = false
  readonly root = new THREE.Group()
  readonly monitor = new HtmlMonitor('/monitors/xr-calibration.html', 1024, 640, {
    intervalMs: 100,
  })
  readonly face = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: this.monitor.texture, toneMapped: false }),
  )
  readonly captured = new Set<XRInputSource>()
  private requested = true
  private placed = false
  private disposed = false
  private previousOrigin = new THREE.Vector3()
  private contacts = new Set<XRInputSource>()
  private triggers = new Set<XRInputSource>()
  private suppressed = new Set<XRInputSource>()
  private selected = 0
  private expanded = false
  private coarse = false
  private markers = new Map<XRInputSource, THREE.Mesh>()
  private rays = new Map<XRInputSource, THREE.Line>()
  private markerGeometry = new THREE.SphereGeometry(0.008, 8, 6)
  private markerMaterial = new THREE.MeshBasicMaterial({ color: '#6ee7ef', depthTest: false })
  private rayMaterial = new THREE.LineBasicMaterial({
    color: '#6ee7ef',
    transparent: true,
    opacity: 0.65,
    depthTest: false,
  })
  private ids: XRCalibrationObject[]
  private raycaster = new THREE.Raycaster()

  constructor(
    scene: THREE.Scene,
    readonly calibration: XRCalibration,
  ) {
    this.ids = Object.keys(calibration.objects) as XRCalibrationObject[]
    this.root.name = 'XR calibration touchscreen'
    this.root.add(this.face)
    this.root.visible = false
    scene.add(this.root)
    void assets
      .instantiate('/library/portals/portal.frame.glb')
      .then((frame) => {
        if (this.disposed) {
          disposeObject(frame)
          return
        }
        frame.scale.set((width + 0.16) / 3.436068, (height + 0.16) / 2.2, 1.5)
        frame.position.y = -(height + 0.16) / 2
        this.face.position.z = 0.075
        this.root.add(frame)
      })
      .catch((error) => console.warn('XR calibration frame', error))
  }
  get isOpen(): boolean {
    return this.requested
  }
  show(): void {
    this.requested = true
    this.placed = false
  }
  hide(): void {
    this.requested = false
    this.release()
  }
  private release(): void {
    this.root.visible = false
    this.contacts.clear()
    this.triggers.clear()
    for (const m of this.markers.values()) m.visible = false
    for (const r of this.rays.values()) r.visible = false
  }
  suspend(): void {
    this.captured.clear()
    this.suppressed.clear()
    this.release()
    this.placed = false
  }

  sync(camera: THREE.Camera, origin: THREE.Vector3, visible: boolean, now: number): void {
    if (!visible || !this.requested) {
      this.release()
      return
    }
    if (!this.placed) {
      const q = camera.getWorldQuaternion(new THREE.Quaternion())
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q)
      forward.y = 0
      forward.normalize()
      this.root.position
        .copy(camera.getWorldPosition(new THREE.Vector3()))
        .addScaledVector(forward, 0.85)
      this.root.position.y -= 0.12
      this.root.rotation.set(0, Math.atan2(-forward.x, -forward.z), 0)
      this.placed = true
    } else this.root.position.add(this.previousOrigin.clone().sub(origin))
    this.previousOrigin.copy(origin)
    this.root.visible = true
    this.root.updateWorldMatrix(true, true)
    if (this.qualityMenu && !this.development) {
      const values: Record<string, string | number> = {
        title: 'CALIDAD',
        object: 'Calidad para conducir',
        hint: 'X del mando: abrir/cerrar · Resolución nativa del casco',
        status: this.qualityMenu.status(),
        footerLeft: 'Perfil Carretera',
        step: 'Aplicar y salir de VR',
      }
      this.qualityMenu.rows().forEach((row, i) => {
        values['label-' + keys[i]] = row.label
        values[keys[i]] = row.value
      })
      this.monitor.update({ values, bars: { dropdown: 0 } }, now)
      return
    }
    const id = this.ids[this.selected],
      pose = this.calibration.get(id)
    const values: Record<string, string | number> = {
      title: '‹ CALIDAD',
      footerLeft: 'Restablecer objeto',
      object: this.expanded ? 'Selecciona un objeto' : this.calibration.objects[id],
      hint: this.expanded
        ? 'Toca un nombre para seleccionarlo'
        : 'Dedo o punta del arma · Mano libre: rayo + gatillo',
      step: this.coarse ? 'Paso: 5 cm / 5°' : 'Paso: 0,5 cm / 1°',
      status: 'Guardado automático · Cero = tu postura por defecto',
    }
    for (let i = 0; i < 16; i++) {
      values[`option${i}`] = this.expanded ? (this.calibration.objects[this.ids[i]] ?? '') : ''
    }
    const fields = this.calibration.fields(id)
    for (const key of keys) {
      values[key] = `${Number(pose[key].toFixed(2))} ${fields[key].unit}`
      values['label-' + key] = fields[key].label
    }
    if (id === 'bike-controls') {
      values.hint = 'Agarre: sujetar · Derecha: gas y freno delantero · Izquierda: trasero'
      values.status = this.calibration.motorcycleStatus
      values.step = this.coarse ? 'Paso grande' : 'Paso fino'
    }
    values.mode = this.expanded ? 'objects' : 'values'
    this.monitor.update({ values, bars: { dropdown: this.expanded ? 1 : 0 } }, now)
  }

  /** Pixel regions match the trusted HTML template; no arbitrary page scripts are executed. */
  activate(x: number, y: number): void {
    if (x >= 936 && y < 76) {
      this.hide()
      return
    }
    if (this.qualityMenu && y < 76) {
      this.development = x >= 400
      this.expanded = false
      return
    }
    if (this.qualityMenu && !this.development) {
      const row = Math.floor((y - 172) / 60)
      const direction = x >= 400 && x < 496 ? -1 : x >= 864 && x < 960 ? 1 : 0
      if (y >= 172 && row < 6 && direction) this.qualityMenu.change(row, direction)
      else if (y >= 550 && y < 608) {
        if (x < 310) this.qualityMenu.road()
        else if (x < 650) this.qualityMenu.apply()
        else this.show()
      }
      return
    }
    if (y >= 90 && y < 156) {
      if (x < 90) this.selected = (this.selected + this.ids.length - 1) % this.ids.length
      else if (x > 934) this.selected = (this.selected + 1) % this.ids.length
      else this.expanded = !this.expanded
      return
    }
    if (this.expanded) {
      if (y >= 172 && y < 532 && x >= 24 && x < 1000) {
        const index = Math.floor((y - 172) / 45) * 2 + Number(x >= 512)
        if (index < this.ids.length) {
          this.selected = index
          this.expanded = false
        }
      }
      return
    }
    const row = Math.floor((y - 172) / 60)
    if (y >= 172 && row < 6) {
      const sign = x >= 400 && x < 496 ? -1 : x >= 864 && x < 960 ? 1 : 0
      if (sign) {
        const key = keys[row],
          id = this.ids[this.selected]
        const step = this.calibration.fields(id)[key].step * (this.coarse ? 5 : 1)
        this.calibration.set(id, {
          [key]: this.calibration.get(id)[key] + sign * step,
        } as Partial<XRPoseAdjustment>)
      }
    } else if (y >= 550 && y < 608) {
      if (x < 310) this.calibration.reset(this.ids[this.selected])
      else if (x < 650) this.coarse = !this.coarse
      else this.show()
    }
  }

  interact(pointers: readonly CalibrationPointer[], enabled: boolean): void {
    this.captured.clear()
    for (const source of this.suppressed) {
      if (pointers.some((p) => p.source === source) && source.gamepad?.buttons[0]?.pressed)
        this.captured.add(source)
      else this.suppressed.delete(source)
    }
    for (const m of this.markers.values()) m.visible = false
    for (const r of this.rays.values()) r.visible = false
    if (!enabled || !this.root.visible || !this.placed) {
      this.contacts.clear()
      this.triggers.clear()
      return
    }
    const contacts = new Set<XRInputSource>(),
      triggers = new Set<XRInputSource>()
    for (const pointer of pointers) {
      const { source, tip, armed, aim } = pointer
      const local = this.face.worldToLocal(tip.clone())
      const previous = this.contacts.has(source)
      const contact =
        Math.abs(local.x) <= width / 2 &&
        Math.abs(local.y) <= height / 2 &&
        local.z >= -0.06 &&
        local.z <= (previous ? 0.075 : 0.025)
      const pressed = !!source.gamepad?.buttons[0]?.pressed
      if (pressed) triggers.add(source)
      let point: THREE.Vector3 | undefined
      let fire = false
      if (contact) {
        contacts.add(source)
        point = new THREE.Vector3(local.x, local.y, 0.002)
        fire = !previous
      } else if (!armed) {
        const start = aim.getWorldPosition(new THREE.Vector3())
        const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(
          aim.getWorldQuaternion(new THREE.Quaternion()),
        )
        this.raycaster.set(start, direction)
        this.raycaster.far = 5
        const hit = this.raycaster.intersectObject(this.face, false)[0]
        if (hit) {
          point = this.face.worldToLocal(hit.point.clone())
          point.z = 0.002
          fire = pressed && !this.triggers.has(source)
          let ray = this.rays.get(source)
          if (!ray) {
            ray = new THREE.Line(new THREE.BufferGeometry(), this.rayMaterial)
            this.root.parent!.add(ray)
            this.rays.set(source, ray)
          }
          ray.geometry.setFromPoints([start, hit.point])
          ray.visible = true
        }
      }
      if (!point) continue
      if (pressed) this.suppressed.add(source)
      this.captured.add(source)
      let marker = this.markers.get(source)
      if (!marker) {
        marker = new THREE.Mesh(this.markerGeometry, this.markerMaterial)
        marker.renderOrder = 10002
        this.face.add(marker)
        this.markers.set(source, marker)
      }
      marker.position.copy(point)
      marker.visible = true
      if (fire) this.activate((point.x / width + 0.5) * 1024, (0.5 - point.y / height) * 640)
      this.captured.add(source)
      if (!this.requested) break
    }
    this.contacts = contacts
    this.triggers = triggers
  }
  dispose(): void {
    this.disposed = true
    this.root.removeFromParent()
    for (const marker of this.markers.values()) marker.removeFromParent()
    for (const ray of this.rays.values()) {
      ray.removeFromParent()
      ray.geometry.dispose()
    }
    this.markerGeometry.dispose()
    this.markerMaterial.dispose()
    this.rayMaterial.dispose()
    disposeObject(this.root)
    this.monitor.dispose()
  }
}
