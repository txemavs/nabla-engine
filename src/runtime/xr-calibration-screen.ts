import { xrMonitorThemeStyles } from './interface-theme.js'
import { XRDisposalPortal } from './xr-disposal-portal.js'
import { XRObjectGrab } from './xr-object-grab.js'
import { XRUiClick } from './xr-ui-click.js'
import {
  radioActionAt,
  XRPanelCanvas,
  type XRPanelAction,
  type XRPanelPage,
} from './xr-panel-canvas.js'
import type { XRQualityMenu } from './xr-quality.js'
import * as THREE from 'three'
import { HtmlMonitor } from '../render/monitors/html-monitor.js'
import { assets, disposeObject } from '../render/entity/assets.js'
import type { XRCalibration, XRCalibrationObject, XRPoseAdjustment } from './xr-calibration.js'

export interface CalibrationPointer {
  source: XRInputSource
  tip: THREE.Vector3
  armed: boolean
  grip?: THREE.Group
  aim: THREE.Object3D
}
const width = 2,
  height = 1.25
const keys = ['x', 'y', 'z', 'rx', 'ry', 'rz'] as const

/** A real HTML monitor texture in the stock portal frame, with explicit XR hit regions. */
export class XRCalibrationScreen {
  qualityMenu?: XRQualityMenu
  development = false
  mainMenu?: () => XRPanelAction[]
  mainMenuOrder?: readonly string[]
  optionsMenu?: () => XRPanelAction[]
  radioMenu?: () => XRPanelAction[]
  mapMenu?: () => XRPanelAction[]
  environmentMenu?: () => XRPanelAction[]
  experimentalMenu?: () => XRPanelAction[]
  mainStatus: () => string = () => ''
  private page: XRPanelPage = 'main'
  private canvasPanel?: XRPanelCanvas
  private readonly frameGrab = new XRObjectGrab()
  private gripDown = new Set<XRInputSource>()
  openMain(): void {
    this.page = 'main'
    this.show()
  }
  navigate(page: XRPanelPage): void {
    this.page = page
    this.development = page === 'development'
    this.expanded = false
    this.canvasPanel?.endStrokes()
  }
  private actions(): XRPanelAction[] {
    if (this.page === 'experimental') return this.experimentalMenu?.() ?? []
    if (this.page === 'map') return this.mapMenu?.() ?? []
    if (this.page === 'environment') return this.environmentMenu?.() ?? []
    if (this.page === 'radio') return this.radioMenu?.() ?? []
    if (this.page === 'options') return this.optionsMenu?.() ?? []
    const actions: XRPanelAction[] = [
      ...(this.mainMenu?.() ?? []),
      ...(this.radioMenu
        ? [{ id: 'radio', label: 'Radiocontrol', run: () => this.navigate('radio') }]
        : []),
      { id: 'quality', label: 'Calidad', run: () => this.navigate('quality') },
      { id: 'development', label: 'Desarrollo', run: () => this.navigate('development') },
      { id: 'board', label: 'Pizarra', run: () => this.navigate('board') },
      { id: 'target', label: 'Diana 1–10', run: () => this.navigate('target') },
      { id: 'options', label: 'Opciones', run: () => this.navigate('options') },
    ]
    if (!this.mainMenuOrder) return actions
    const rank = new Map(this.mainMenuOrder.map((id, index) => [id, index]))
    return actions.sort(
      (a, b) => (rank.get(a.id ?? '') ?? Infinity) - (rank.get(b.id ?? '') ?? Infinity),
    )
  }
  get targets(): THREE.Mesh[] {
    return this.root.visible && (this.page === 'target' || this.page === 'board') ? [this.face] : []
  }
  hit(object: THREE.Object3D, point: THREE.Vector3): boolean {
    if (object !== this.face || this.page !== 'target') return false
    const local = this.face.worldToLocal(point.clone())
    this.canvasPanel?.shot((local.x / width + 0.5) * 1024, (0.5 - local.y / height) * 640)
    return true
  }
  readonly root = new THREE.Group()
  readonly monitor = new HtmlMonitor('/monitors/xr-calibration.html', 1024, 640, {
    intervalMs: 100,
    styleText: xrMonitorThemeStyles,
  })
  readonly face = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: this.monitor.texture, toneMapped: false }),
  )
  readonly captured = new Set<XRInputSource>()
  private readonly clickSound = new XRUiClick()
  private requested = false
  private qualityPage = 0
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

  readonly solid = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.03),
    new THREE.MeshBasicMaterial({ visible: false }),
  )
  readonly disposal = new XRDisposalPortal(this.face, width, height)
  get collisionSurfaces(): THREE.Mesh[] {
    return this.root.visible ? [this.solid] : []
  }
  constructor(
    scene: THREE.Scene,
    readonly calibration: XRCalibration,
  ) {
    this.ids = Object.keys(calibration.editableObjects) as XRCalibrationObject[]
    this.root.name = 'XR calibration touchscreen'
    this.solid.userData.xrSupplementalCollision = true
    this.root.add(this.face, this.solid)
    this.root.visible = false
    scene.add(this.root)
    void assets
      .instantiate('/library/portals/portal.frame.glb')
      .then((frame) => {
        if (this.disposed) {
          disposeObject(frame)
          return
        }
        // Authored opening: 3.236068 × 2 m, centred at y=1.1; depth ±0.04.
        // The screen overlaps the opening by 5 mm and sits halfway through the frame.
        frame.scale.set((width - 0.01) / 3.236068, (height - 0.01) / 2, 1.5)
        frame.position.y = -1.1 * frame.scale.y
        this.face.position.z = 0
        this.root.add(frame)
      })
      .catch((error) => console.warn('XR calibration frame', error))
  }
  get isOpen(): boolean {
    return this.requested
  }
  show(reposition = false): void {
    this.requested = true
    if (reposition) this.placed = false
  }
  hide(): void {
    this.requested = false
    this.release()
  }
  private release(): void {
    this.root.visible = false
    this.frameGrab.reset()
    this.gripDown.clear()
    this.canvasPanel?.endStrokes()
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
    const canvasPage =
      this.mainMenu &&
      [
        'main',
        'options',
        'radio',
        'board',
        'target',
        'map',
        'environment',
        'experimental',
      ].includes(this.page)
    if (canvasPage) {
      this.canvasPanel ??= new XRPanelCanvas()
      this.face.material.map = this.canvasPanel.texture
      this.canvasPanel.draw(this.page, this.actions(), this.mainStatus())
      return
    }
    this.face.material.map = this.monitor.texture
    if (this.qualityMenu && !this.development) {
      const values: Record<string, string | number> = {
        title: this.mainMenu ? '‹ Volver' : 'CALIDAD',
        section: this.mainMenu ? 'CALIDAD' : 'Desarrollo ›',
        object: `Calidad · ${this.qualityPage + 1}/${Math.ceil(this.qualityMenu.rows().length / 6)}`,
        footerRight: 'Más opciones ›',
        hint: 'X del mando: abrir/cerrar · Resolución nativa del casco',
        status: this.qualityMenu.status(),
        footerLeft: 'Perfil Carretera',
        step: 'Aplicar y salir',
      }
      keys.forEach((key) => {
        values['label-' + key] = ''
        values[key] = ''
      })
      this.qualityMenu
        .rows()
        .slice(this.qualityPage * 6, this.qualityPage * 6 + 6)
        .forEach((row, i) => {
          values['label-' + keys[i]] = row.label
          values[keys[i]] = row.value
        })
      this.monitor.update({ values, bars: { dropdown: 0 } }, now)
      return
    }
    const id = this.ids[this.selected],
      pose = this.calibration.get(id)
    const values: Record<string, string | number> = {
      title: this.mainMenu ? '‹ Volver' : '‹ CALIDAD',
      section: this.mainMenu ? 'DESARROLLO' : 'Desarrollo ›',
      footerRight: '',
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

  /** Screen-space XR taps hit the same monitor face and actions as controller rays. */
  selectRay(origin: THREE.Vector3, direction: THREE.Vector3): boolean {
    if (!this.root.visible || !this.placed || !this.requested) return false
    this.face.updateWorldMatrix(true, false)
    this.raycaster.set(origin, direction)
    this.raycaster.far = 5
    const hit = this.raycaster.intersectObject(this.face, false)[0]
    if (!hit) return false
    const point = this.face.worldToLocal(hit.point.clone())
    this.activate((point.x / width + 0.5) * 1024, (0.5 - point.y / height) * 640)
    return true
  }

  /** Pixel regions match the trusted HTML template; no arbitrary page scripts are executed. */
  activate(x: number, y: number, hand?: THREE.Object3D): void {
    if (this.mainMenu && this.page === 'main' && x < 400 && y < 76) {
      this.click()
      if (hand) {
        const position = hand
          .getWorldPosition(new THREE.Vector3())
          .add(
            new THREE.Vector3(0, height / 2, -0.06).applyQuaternion(
              this.root.getWorldQuaternion(new THREE.Quaternion()),
            ),
          )
        this.frameGrab.reset()
        this.root.position.copy(
          this.root.parent ? this.root.parent.worldToLocal(position) : position,
        )
        this.root.updateWorldMatrix(true, true)
        this.placed = true
      } else this.show(true)
      return
    }
    if (this.mainMenu) {
      if (x >= 936 && y < 76) {
        this.click()
        this.hide()
        return
      }
      if (y < 76 && this.page !== 'main') {
        this.click()
        this.monitor.press('.header')
        if (x < 400) this.navigate('main')
        else if (x >= 780 && x < 936 && (this.page === 'board' || this.page === 'target'))
          this.canvasPanel?.clear(this.page)
        return
      }
      if (this.page === 'radio' && this.actions()[1]?.preview) {
        const i = radioActionAt(x, y)
        if (i >= 0 && this.actions()[i]) {
          this.canvasPanel?.press(i)
          this.click()
          this.actions()[i].run()
        }
        return
      }
      if (['main', 'options', 'radio', 'map', 'environment', 'experimental'].includes(this.page)) {
        if (x >= 24 && x < 1008 && y >= 94 && y < 544) {
          const i = Math.floor((y - 94) / 90) * 3 + Math.floor((x - 24) / 328)
          this.canvasPanel?.press(i)
          this.click()
          this.actions()[i]?.run()
        }
        return
      }
      if (this.page === 'board' || this.page === 'target') return
    }
    const rowIndex = Math.floor((y - 172) / 60)
    let button = ''
    if (y < 60) button = x >= 936 ? '.close' : x >= 400 ? '.development' : '.header'
    else if (y >= 90 && y < 156 && this.development)
      button = x < 90 ? '.prev' : x > 934 ? '.next' : '.selector'
    else if (this.expanded && y >= 172 && y < 532)
      button = `[data-value="option${Math.floor((y - 172) / 45) * 2 + Number(x >= 512)}"]`
    else if (y >= 172 && y < 532 && ((x >= 400 && x < 496) || (x >= 864 && x < 960)))
      button = `.row:has([data-value="label-${keys[rowIndex]}"]) .${x < 496 ? 'minus' : 'plus'}`
    else if (y >= 550 && y < 608 && (!this.development || x < 650))
      button = `[data-value="${x < 310 ? 'footerLeft' : x < 650 ? 'step' : 'footerRight'}"]`
    if (button) {
      this.monitor.press(button)
      this.click()
    }

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
      if (y >= 172 && row < 6 && direction)
        this.qualityMenu.change(this.qualityPage * 6 + row, direction)
      else if (y >= 550 && y < 608) {
        if (x < 310) this.qualityMenu.road()
        else if (x < 650) this.qualityMenu.apply()
        else
          this.qualityPage = (this.qualityPage + 1) % Math.ceil(this.qualityMenu.rows().length / 6)
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
    }
  }

  private click(): void {
    this.clickSound.play()
  }

  private grabFrame(pointers: readonly CalibrationPointer[]): void {
    const down = (p: CalibrationPointer) =>
      !!p.source.gamepad?.buttons[1]?.pressed || (p.source.gamepad?.buttons[1]?.value ?? 0) > 0.6
    const grips = this.frameGrab.hands.filter((grip) =>
      pointers.some((p) => p.grip === grip && !p.armed && down(p)),
    )
    for (const p of pointers) {
      if (
        !p.grip ||
        p.armed ||
        !down(p) ||
        this.gripDown.has(p.source) ||
        grips.includes(p.grip) ||
        grips.length >= 2
      )
        continue
      const local = this.root.worldToLocal(p.grip.getWorldPosition(new THREE.Vector3()))
      const near =
        Math.abs(local.x) <= width / 2 + 0.16 &&
        Math.abs(local.y) <= height / 2 + 0.16 &&
        Math.abs(local.z) < 0.16
      const edge = Math.abs(local.x) > width / 2 - 0.08 || Math.abs(local.y) > height / 2 - 0.08
      if (near && edge) grips.push(p.grip)
    }
    this.frameGrab.update(this.root, grips, 0)
    for (const p of pointers)
      if (p.grip && this.frameGrab.hands.includes(p.grip)) this.captured.add(p.source)
    this.gripDown = new Set(pointers.filter(down).map((p) => p.source))
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
    this.canvasPanel?.retainSources(pointers.map((p) => p.source))
    this.grabFrame(pointers)
    const contacts = new Set<XRInputSource>(),
      triggers = new Set<XRInputSource>()
    for (const pointer of pointers) {
      const { source, tip, armed, aim } = pointer
      if (pointer.grip && this.frameGrab.hands.includes(pointer.grip)) continue
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
      if (!point) {
        this.canvasPanel?.endStroke(source)
        continue
      }
      const px = (point.x / width + 0.5) * 1024,
        py = (0.5 - point.y / height) * 640
      if (this.mainMenu && this.page === 'board' && py >= 90) {
        if (contact || (!armed && pressed)) this.canvasPanel?.stroke(source, px, py)
        else this.canvasPanel?.endStroke(source)
      } else this.canvasPanel?.endStroke(source)
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
      if (fire)
        this.activate(
          (point.x / width + 0.5) * 1024,
          (0.5 - point.y / height) * 640,
          pointer.grip ?? aim,
        )
      this.captured.add(source)
      if (!this.requested) break
    }
    this.contacts = contacts
    this.triggers = triggers
  }
  dispose(): void {
    this.solid.geometry.dispose()
    this.solid.material.dispose()
    this.disposed = true
    this.clickSound.dispose()
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
    this.canvasPanel?.dispose()
    this.monitor.dispose()
  }
}
