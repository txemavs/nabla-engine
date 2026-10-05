import { helmTouchAxis } from './helm-touch.js'
import { installVehicleMonitorStyles } from './vehicle-monitor-styles.js'
import { createRuntimeText, type RuntimeText } from './messages.js'
import * as THREE from 'three'
import { HelmMap } from '../render/entity/helm-map.js'
import { localToGeo } from '../math/geo/sphere.js'
import { mapTileAt, mapTileFilename, mapTilePath, MERCATOR_LIMIT } from '../scene/mercator.js'
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js'
import type { SceneDocument } from '../scene/document.js'
import type { Simulation } from '../simulation/simulation.js'

/** Native DOM tablets share the portal pose; activation is limited to one metre. */
export class VehicleMonitors {
  onJump?: (carrier: string, latitude: number, longitude: number) => void
  onShipSwitch?: (carrier: string, kind: 'nav' | 'beacon' | 'spots' | 'cabin' | 'shutters') => void
  projectRegistry?: {
    entries: () => { id: string; name: string; place: string; size: number[] }[]
    selected: (source: string) => string | undefined
    configure: (source: string, destination: string | null, open: boolean) => string
    status: (source: string) => string | undefined
  }
  private readonly lifetime = new AbortController()
  private readonly originalPointerEvents: string
  private readonly originalPosition: string
  private readonly originalZIndex: string
  private readonly originalViewportPosition: string
  private readonly renderer = new CSS3DRenderer()
  private readonly scene = new THREE.Scene()
  private readonly aperture = new THREE.MeshBasicMaterial({
    color: 0,
    opacity: 0,
    blending: THREE.NoBlending,
  })
  private active: {
    mesh: THREE.Mesh
    material: THREE.Material | THREE.Material[]
    object: CSS3DObject
  }[] = []
  private entries = new Map<
    string,
    { panel: HTMLDivElement; select: HTMLSelectElement; status: HTMLElement; object: CSS3DObject }
  >()
  private panels = new Map<
    string,
    {
      carrier: string
      kind: 'touch' | 'telemetry' | 'map' | 'where' | 'systems'
      panel: HTMLDivElement
      object: CSS3DObject
      chart?: HelmMap
    }
  >()
  private mouths: SceneDocument['entities'] = []
  private size = new THREE.Vector2()
  private nextReadout = 0
  private held = new Map<number, { carrier: string; action: string }>()
  private simulation: Simulation | null = null
  flightInput() {
    const result = { forward: 0, right: 0, lift: 0, turn: 0, brake: false }
    for (const { carrier, action } of this.held.values()) {
      if (this.simulation?.player.vehicleId !== carrier) continue
      const mapped = helmTouchAxis(action, this.simulation.vehicleInfo(carrier).flightMode)
      if (!mapped) continue
      if (mapped.axis === 'brake') result.brake = true
      else result[mapped.axis] = Math.max(-1, Math.min(1, result[mapped.axis] + mapped.sign))
    }
    return result
  }
  constructor(
    private viewport: HTMLElement,
    private report: (message: string) => void,
    private canvas: HTMLCanvasElement = viewport.querySelector('canvas')!,
    private readonly text: RuntimeText = createRuntimeText(),
  ) {
    if (!canvas) throw new Error('Vehicle monitors require a canvas')
    this.originalPointerEvents = canvas.style.pointerEvents
    this.originalPosition = canvas.style.position
    this.originalZIndex = canvas.style.zIndex
    this.originalViewportPosition = viewport.style.position
    if (getComputedStyle(viewport).position === 'static') viewport.style.position = 'relative'
    canvas.style.position = 'relative'
    canvas.style.zIndex = '1'
    installVehicleMonitorStyles(this.renderer.domElement)
    const options = { signal: this.lifetime.signal }
    window.addEventListener('blur', () => this.releaseInput(), options)
    window.document.addEventListener('visibilitychange', () => this.releaseInput(), options)
    window.document.addEventListener('pointerlockchange', () => this.releaseInput(), options)
    this.renderer.domElement.className = 'css-world-layer portal-tablet-layer'
    this.viewport.prepend(this.renderer.domElement)
    // Clicks outside the monitors (on the bare viewport) are recaptured by the game runtime.
  }
  /**
   * Whether a visible monitor covers the viewport point (client pixels). The game uses it to
   * free the mouse when the player clicks a monitor under the crosshair while locked.
   */
  panelAt(x: number, y: number): boolean {
    const active = new Set(this.active.map((e) => e.object))
    for (const entry of [...this.entries.values(), ...this.panels.values()]) {
      if (entry.panel.hidden || !active.has(entry.object)) continue
      const box = entry.panel.getBoundingClientRect()
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return true
    }
    return false
  }
  releaseInput(): void {
    this.held.clear()
  }
  hide(): void {
    this.finish()
    this.active = []
    this.simulation = null
    this.releaseInput()
    for (const entry of [...this.entries.values(), ...this.panels.values()])
      entry.panel.hidden = true
    this.canvas.style.pointerEvents = this.originalPointerEvents
  }
  dispose(): void {
    this.hide()
    this.lifetime.abort()
    this.renderer.domElement.remove()
    this.scene.clear()
    this.panels.clear()
    this.entries.clear()
    this.aperture.dispose()
    this.canvas.style.position = this.originalPosition
    this.canvas.style.zIndex = this.originalZIndex
    this.viewport.style.position = this.originalViewportPosition
  }
  rebuild(document: SceneDocument): void {
    this.hide()
    for (const entry of this.panels.values()) this.scene.remove(entry.object)
    this.panels.clear()
    for (const entry of this.entries.values()) this.scene.remove(entry.object)
    this.entries.clear()
    const mouths = document.entities.filter((e) => e.portal)
    this.mouths = mouths
    for (const mouth of mouths) {
      const panel = window.document.createElement('div')
      panel.className = mouth.parentId ? 'portal-console helm-portal' : 'portal-console'
      panel.dataset.portalId = mouth.id
      panel.hidden = true
      const title = window.document.createElement('strong')
      title.textContent = mouth.parentId ? 'PORTAL' : mouth.name
      const select = window.document.createElement('select')
      select.setAttribute('aria-label', this.text('Destination of {0}', mouth.name))
      const placeholder = new Option('Elegir destino…', '')
      select.add(placeholder)
      for (const target of mouths
        .filter(
          (e) => e.id !== mouth.id && e.size.every((n, i) => Math.abs(n - mouth.size[i]) < 1e-6),
        )
        .sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId)))
        select.add(new Option(target.name, target.id))
      for (const target of this.projectRegistry?.entries() ?? [])
        if (target.size.every((n, i) => Math.abs(n - mouth.size[i]) < 1e-6))
          select.add(new Option(`${target.name} · ${target.place}`, `global:${target.id}`))
      const global = this.projectRegistry?.selected(mouth.id)
      select.value = global ? `global:${global}` : (mouth.portal!.pairId ?? '')
      const status = window.document.createElement('small')
      const buttons = window.document.createElement('div')
      for (const [label, mode] of [
        [this.text('Open'), 'open'],
        [this.text('Close'), 'closed'],
      ] as const) {
        const button = window.document.createElement('button')
        button.textContent = label
        button.onclick = () => {
          if (!this.simulation || panel.hidden || panel.dataset.active !== 'true') return
          try {
            const currentGlobal = this.projectRegistry?.selected(mouth.id)
            if (select.value.startsWith('global:') || (mode === 'closed' && currentGlobal)) {
              this.report(
                this.projectRegistry!.configure(
                  mouth.id,
                  mode === 'closed' ? (currentGlobal ?? null) : select.value.slice(7),
                  mode === 'open',
                ),
              )
              return
            }
            if (currentGlobal) this.projectRegistry!.configure(mouth.id, null, false)
            const target =
              mode === 'closed'
                ? this.simulation.portalState(mouth.id).pairId
                : select.value || null
            if (mode === 'open' && !target) throw new Error(this.text('Choose a destination first'))
            this.report(this.simulation.configurePortal(mouth.id, target, mode))
          } catch (error) {
            this.report((error as Error).message)
          }
        }
        buttons.append(button)
      }
      panel.append(title, select, buttons, status)
      if (mouth.parentId) {
        const jump = window.document.createElement('form')
        jump.className = 'portal-jump'
        jump.innerHTML = this.text(
          '<label>Lat<input name="lat" type="number" step="any" required /></label><label>Lon<input name="lon" type="number" step="any" required /></label><button type="submit">Go</button>',
        )
        jump.onsubmit = (event) => {
          event.preventDefault()
          if (!this.simulation || panel.dataset.active !== 'true') return
          const data = new FormData(jump)
          const latitude = Number(data.get('lat'))
          const longitude = Number(data.get('lon'))
          if (
            !Number.isFinite(latitude) ||
            latitude < -85 ||
            latitude > 85 ||
            !Number.isFinite(longitude) ||
            longitude < -180 ||
            longitude > 180
          ) {
            this.report(this.text('Coordinates out of range'))
            return
          }
          this.onJump?.(mouth.parentId!, latitude, longitude)
        }
        panel.append(jump)
      }
      const object = new CSS3DObject(panel)
      this.renderer.domElement.append(panel)
      object.matrixAutoUpdate = false
      this.scene.add(object)
      this.entries.set(mouth.id, { panel, select, status, object })
    }
    for (const carrier of document.entities.filter((e) => e.vehicle?.interior)) {
      for (const kind of ['touch', 'telemetry', 'map', 'where', 'systems'] as const) {
        const panel = window.document.createElement('div')
        panel.className = `helm-console ${kind}-console`
        panel.dataset.carrier = carrier.id
        panel.hidden = true
        if (kind === 'telemetry')
          panel.innerHTML = this.text('<strong>TELEMETRY</strong><output></output><small></small>')
        if (kind === 'map')
          panel.innerHTML = this.text(
            '<strong>NAVIGATION</strong><canvas aria-label="Overhead road map"></canvas><small>North up · local map</small>',
          )
        if (kind === 'where')
          panel.innerHTML = this.text(
            '<strong>LOCATION</strong><output></output><small class="where-detail"></small>',
          )
        if (kind === 'systems') {
          panel.innerHTML = this.text(
            '<strong>SYSTEMS</strong><div class="systems-board"><button type="button" data-helm="off">POWER</button><button type="button" data-ship="nav">NAV</button><button type="button" data-ship="spots">SPOTS</button><button type="button" data-helm="space">SPACE</button><button type="button" data-ship="beacon">FLASH</button><output class="sys-time">--:--</output><output class="sys-rumbo">---°</output><button type="button" data-helm="plane">PLANE</button><button type="button" data-door>DOOR</button><span></span><span></span><button type="button" data-helm="drone">DRONE</button><button type="button" data-helm="car">LAND</button><button type="button" data-ship="shutters">SHUTTER</button><button type="button" data-helm="auto">AUTO</button><button type="button" data-helm="drone">HOVER</button></div>',
          )
          for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-ship]'))
            button.onclick = () => {
              if (panel.dataset.active !== 'true') return
              button.classList.toggle('is-on')
              this.onShipSwitch?.(
                carrier.id,
                button.dataset.ship as 'nav' | 'beacon' | 'spots' | 'cabin' | 'shutters',
              )
            }
          for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-helm]'))
            button.onclick = () => {
              if (panel.dataset.active !== 'true' || !this.simulation) return
              this.report(
                this.simulation.setHelmMode(
                  button.dataset.helm as 'off' | 'auto' | 'car' | 'drone' | 'plane' | 'space',
                ),
              )
            }
          panel.querySelector<HTMLButtonElement>('[data-door]')!.onclick = () => {
            if (!this.simulation || panel.dataset.active !== 'true') return
            try {
              this.report(
                this.simulation.setGarageDoor(
                  carrier.id,
                  !this.simulation.vehicleInfo(carrier.id).rampClosed,
                ),
              )
            } catch (error) {
              this.report((error as Error).message)
            }
          }
        }
        if (kind === 'touch') {
          panel.innerHTML = this.text(
            '<div class="helm-indicators">NABLA · FLIGHT CONTROL</div><div class="hand-controls"><div class="ship-switches"><button type="button" data-ship="nav">NAV</button><button type="button" data-ship="beacon">FLASH</button><button type="button" data-ship="spots">SPOTS</button><button type="button" data-ship="cabin" class="is-on">CABIN</button></div><div class="dpad" data-hand="left"><span>WASD</span></div><div class="helm-desk"><button type="button" data-helm="off">Off</button><button type="button" data-helm="auto">Auto</button><button type="button" data-helm="car">Car</button><output class="helm-mode">Road mode</output><button type="button" data-helm="drone">Drone</button><button type="button" data-helm="plane">Aircraft</button><button type="button" data-helm="space">Space</button><button type="button" data-door>Close garage</button><button type="button" data-brake>Brake</button></div><div class="dpad" data-hand="right"><span>ARROW KEYS</span></div><div class="ship-switches"><button type="button" data-ship="shutters">SHUTTERS</button></div></div>',
          )
          for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-ship]'))
            button.onclick = () => {
              if (
                this.simulation?.player.vehicleId !== carrier.id ||
                panel.dataset.active !== 'true'
              )
                return
              button.classList.toggle('is-on')
              this.onShipSwitch?.(
                carrier.id,
                button.dataset.ship as 'nav' | 'beacon' | 'spots' | 'cabin' | 'shutters',
              )
            }
          for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-helm]'))
            button.onclick = () => {
              if (
                this.simulation?.player.vehicleId !== carrier.id ||
                panel.dataset.active !== 'true'
              )
                return
              this.report(
                this.simulation.setHelmMode(
                  button.dataset.helm as 'off' | 'auto' | 'car' | 'drone' | 'plane' | 'space',
                ),
              )
            }
          panel.querySelector<HTMLButtonElement>('[data-door]')!.onclick = () => {
            if (!this.simulation || panel.dataset.active !== 'true') return
            try {
              this.report(
                this.simulation.setGarageDoor(
                  carrier.id,
                  !this.simulation.vehicleInfo(carrier.id).rampClosed,
                ),
              )
            } catch (error) {
              this.report((error as Error).message)
            }
          }
          const bind = (button: HTMLButtonElement, action: string) => {
            button.dataset.action = action
            button.onpointerdown = (event) => {
              if (
                panel.dataset.active !== 'true' ||
                this.simulation?.player.vehicleId !== carrier.id
              )
                return
              event.preventDefault()
              button.setPointerCapture(event.pointerId)
              this.held.set(event.pointerId, { carrier: carrier.id, action })
            }
            const release = (event: PointerEvent) => this.held.delete(event.pointerId)
            button.onpointerup = release
            button.onpointercancel = release
            button.onlostpointercapture = release
          }
          for (const [hand, position, key, label, action] of [
            ['left', 'up', 'W', this.text('Ascend'), 'lift:1'],
            ['left', 'left', 'A', this.text('Turn left'), 'turn:-1'],
            ['left', 'down', 'S', this.text('Descend'), 'lift:-1'],
            ['left', 'right', 'D', this.text('Turn right'), 'turn:1'],
            ['right', 'up', '↑', this.text('Forward'), 'forward:1'],
            ['right', 'left', '←', this.text('Left'), 'right:-1'],
            ['right', 'down', '↓', this.text('Backward'), 'forward:-1'],
            ['right', 'right', '→', this.text('Right'), 'right:1'],
          ]) {
            const button = window.document.createElement('button')
            button.className = position
            button.textContent = key
            button.title = label
            button.setAttribute('aria-label', label)
            bind(button, action)
            panel.querySelector(`[data-hand="${hand}"]`)!.append(button)
          }
          bind(panel.querySelector('[data-brake]')!, 'brake')
        }
        const object = new CSS3DObject(panel)
        this.renderer.domElement.append(panel)
        object.matrixAutoUpdate = false
        this.scene.add(object)
        this.panels.set(`${carrier.id}:${kind}`, {
          carrier: carrier.id,
          kind,
          panel,
          object,
          chart: kind === 'map' ? new HelmMap(panel.querySelector('canvas')!) : undefined,
        })
      }
    }
  }
  update(
    sim: Simulation | null,
    document: SceneDocument,
    camera: THREE.PerspectiveCamera,
    tablets: Map<string, THREE.Mesh[]>,
    helmScreens: Map<string, THREE.Mesh>,
    touchScreens: Map<string, THREE.Mesh>,
    flightScreens: Map<string, THREE.Mesh>,
    placeScreens: Map<string, THREE.Mesh>,
    systemScreens: Map<string, THREE.Mesh>,
    renderOrigin: THREE.Vector3,
    cockpit = false,
  ): void {
    this.simulation = sim
    this.active = []
    camera.updateMatrixWorld(true)
    const now = performance.now()
    const readout = now >= this.nextReadout
    if (readout) this.nextReadout = now + 100
    let interactive = false
    for (const mouth of this.mouths) {
      const entry = this.entries.get(mouth.id)
      if (!entry) continue
      if (!sim) continue
      const mesh = tablets.get(mouth.id)?.[0]
      if (!mesh) continue
      mesh.updateWorldMatrix(true, false)
      const point = mesh.getWorldPosition(new THREE.Vector3()).add(renderOrigin)
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld)
      if (camera.position.clone().sub(point).dot(normal) <= 0) continue
      const consoleMesh = mouth.parentId ? helmScreens.get(mouth.parentId) : undefined
      consoleMesh?.updateWorldMatrix(true, false)
      const activationPoint = consoleMesh
        ? consoleMesh.getWorldPosition(new THREE.Vector3()).add(renderOrigin)
        : point
      const aboard =
        !!mouth.parentId &&
        (sim.player.interiorId === mouth.parentId || sim.player.vehicleId === mouth.parentId)
      if (
        !aboard &&
        (sim.player.vehicleId ||
          new THREE.Vector3(...sim.player.position).distanceTo(activationPoint) >= 1 ||
          camera.position.distanceTo(activationPoint) >= 1)
      )
        continue
      if (!aboard) {
        const clear = sim.cameraPosition(camera.position.toArray(), point.toArray())
        if (new THREE.Vector3(...clear).distanceTo(point) > 0.12) continue
      }
      const screen = point.clone().project(camera)
      if (
        !mouth.parentId &&
        (screen.z < -1 || screen.z > 1 || Math.abs(screen.x) > 1.2 || Math.abs(screen.y) > 1.2)
      )
        continue
      interactive ||= !window.document.pointerLockElement
      this.active.push({ mesh, material: mesh.material, object: entry.object })
      const state = sim.portalState(mouth.id)
      entry.panel.dataset.mode = state.mode
      const destination = document.entities.find((e) => e.id === state.pairId)?.name
      if (readout)
        entry.status.textContent =
          this.projectRegistry?.status(mouth.id) ??
          this.text(
            '{0}{1} · Esc releases the mouse',
            state.mode === 'open'
              ? this.text('Open')
              : state.mode === 'window'
                ? this.text('Window')
                : this.text('Closed'),
            destination ? ' · ' + destination : '',
          )
    }
    for (const entry of this.panels.values()) {
      const mesh = (
        entry.kind === 'touch'
          ? touchScreens
          : entry.kind === 'telemetry'
            ? flightScreens
            : entry.kind === 'where'
              ? placeScreens
              : entry.kind === 'systems'
                ? systemScreens
                : helmScreens
      ).get(entry.carrier)
      const anchor = helmScreens.get(entry.carrier)
      if (!sim || !mesh || !anchor) continue
      if (sim.player.vehicleId === entry.carrier && !cockpit) continue
      anchor.updateWorldMatrix(true, false)
      const activation = anchor.getWorldPosition(new THREE.Vector3()).add(renderOrigin)
      const piloting = cockpit && sim.player.vehicleId === entry.carrier
      const aboard =
        sim.player.interiorId === entry.carrier || sim.player.vehicleId === entry.carrier
      if (
        !aboard &&
        (sim.player.vehicleId ||
          camera.position.distanceTo(activation) >= 1 ||
          new THREE.Vector3(...sim.player.position).distanceTo(activation) >= 1)
      )
        continue
      mesh.updateWorldMatrix(true, false)
      const point = mesh.getWorldPosition(new THREE.Vector3()).add(renderOrigin)
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld)
      if (camera.position.clone().sub(point).dot(normal) <= 0) continue
      if (
        !aboard &&
        new THREE.Vector3(
          ...sim.cameraPosition(camera.position.toArray(), point.toArray()),
        ).distanceTo(point) > 0.12
      )
        continue
      this.active.push({ mesh, material: mesh.material, object: entry.object })
      interactive ||= !window.document.pointerLockElement
      const info = sim.vehicleInfo(entry.carrier)
      if (readout && entry.kind === 'telemetry') {
        const altitude =
          Math.abs(info.altitude) >= 1000
            ? `${(info.altitude / 1000).toFixed(2)} km`
            : `${info.altitude.toFixed(0)} m`
        const q = new THREE.Quaternion(...sim.entityTransform(entry.carrier).rotation)
        const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ')
        entry.panel.querySelector('output')!.textContent = this.text(
          '{0} km/h · Altitude {1}',
          info.speedKmh.toFixed(0),
          altitude,
        )
        entry.panel.querySelector('small')!.textContent = this.text(
          '{0}\nPitch {1}° · Roll {2}°\nLimit {3} km/h',
          info.flightMode ? this.text('FLIGHT · assisted altitude') : this.text('GROUND'),
          ((euler.x * 180) / Math.PI).toFixed(0),
          ((euler.z * 180) / Math.PI).toFixed(0),
          info.cruiseSpeed,
        )
      }
      if (readout && entry.kind === 'where') {
        const pose = sim.entityTransform(entry.carrier)
        const [x, , z] = pose.position
        const under = underfoot(document, x, z)
        const output = entry.panel.querySelector('output')!
        const detail = entry.panel.querySelector('.where-detail')!
        if (document.geography) {
          const gps = localToGeo(document.geography, pose.position)
          if (
            !Number.isFinite(gps.latitude) ||
            !Number.isFinite(gps.longitude) ||
            Math.abs(gps.latitude) > MERCATOR_LIMIT
          )
            continue
          const tile = mapTileAt(gps.latitude, gps.longitude, 15)
          output.textContent = `${mapTilePath(tile)}\nzoom ${tile.z} · x ${tile.x} · y ${tile.y}`
          detail.textContent = `${mapTileFilename(tile, 'terrain')}\n${mapTileFilename(tile, 'buildings-osm')}\n${under}`
        } else {
          output.textContent = this.text('No geography')
          detail.textContent = under
        }
      }
      if (entry.kind === 'systems') {
        const clock = entry.panel.querySelector<HTMLOutputElement>('.sys-time')
        const course = entry.panel.querySelector<HTMLOutputElement>('.sys-rumbo')
        const door = entry.panel.querySelector<HTMLButtonElement>('[data-door]')
        if (clock)
          clock.textContent = new Date().toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          })
        if (course) {
          const yaw = new THREE.Euler().setFromQuaternion(
            new THREE.Quaternion(...sim.entityTransform(entry.carrier).rotation),
          ).y
          const deg = (Math.round(((-yaw * 180) / Math.PI) % 360) + 360) % 360
          course.textContent = `${String(deg).padStart(3, '0')}°`
        }
        door?.classList.toggle('is-on', !info.rampClosed)
      }
      if (entry.chart) {
        const pose = sim.entityTransform(entry.carrier)
        entry.chart.update(document, pose, now)
        if (readout && document.geography) {
          const gps = localToGeo(document.geography, pose.position)
          entry.panel.querySelector('small')!.textContent =
            `${gps.latitude.toFixed(5)}°, ${gps.longitude.toFixed(5)}° · N ↑`
        }
      }
      if (entry.kind === 'touch') {
        const door = entry.panel.querySelector<HTMLButtonElement>('[data-door]')!
        const readoutMode = entry.panel.querySelector<HTMLOutputElement>('.helm-mode')
        if (readout && readoutMode) {
          const label = info.rampMoving
            ? this.text('Door moving…')
            : info.rampClosed
              ? this.text('Open garage')
              : this.text('Close garage')
          if (door.textContent !== label) door.textContent = label
          const names = {
            off: this.text('Craft off'),
            auto: this.text('Autopilot'),
            car: this.text('Road mode'),
            drone: this.text('Drone mode'),
            plane: this.text('Aircraft mode'),
            space: this.text('Spacecraft mode'),
          } as const
          readoutMode.textContent = names[info.helm]
          const plane = info.helm === 'plane'
          const stick: Record<string, string> = plane
            ? {
                'lift:1': this.text('Throttle up'),
                'lift:-1': this.text('Throttle down'),
                'turn:-1': this.text('Rudder left'),
                'turn:1': this.text('Rudder right'),
                'forward:1': this.text('Pitch down'),
                'forward:-1': this.text('Pitch up'),
                'right:-1': this.text('Roll left'),
                'right:1': this.text('Roll right'),
              }
            : {
                'lift:1': this.text('Ascend'),
                'lift:-1': this.text('Descend'),
                'turn:-1': this.text('Turn left'),
                'turn:1': this.text('Turn right'),
                'forward:1': this.text('Forward'),
                'forward:-1': this.text('Backward'),
                'right:-1': this.text('Left'),
                'right:1': this.text('Right'),
              }
          for (const button of entry.panel.querySelectorAll<HTMLButtonElement>('[data-helm]')) {
            button.classList.toggle('is-on', button.dataset.helm === info.helm)
            button.disabled = button.dataset.helm === 'car' && info.flightMode
          }
          for (const button of entry.panel.querySelectorAll<HTMLButtonElement>('[data-action]')) {
            const label = stick[button.dataset.action ?? '']
            if (label && button.title !== label) {
              button.title = label
              button.setAttribute('aria-label', label)
            }
          }
        }
        door.disabled = info.rampMoving
        for (const button of entry.panel.querySelectorAll<HTMLButtonElement>('[data-action]'))
          button.disabled = !piloting
      }
    }
    const active = new Set(this.active.map((e) => e.object))
    for (const entry of [...this.entries.values(), ...this.panels.values()]) {
      const visible = active.has(entry.object)
      if (entry.panel.hidden === visible) entry.panel.hidden = !visible
      const state = String(visible)
      if (entry.panel.dataset.active !== state) entry.panel.dataset.active = state
      const events = visible && !window.document.pointerLockElement ? 'auto' : 'none'
      if (entry.panel.style.pointerEvents !== events) entry.panel.style.pointerEvents = events
    }
    for (const [pointer, held] of this.held) {
      const panel = this.panels.get(`${held.carrier}:touch`)
      if (!panel || !active.has(panel.object) || window.document.pointerLockElement)
        this.held.delete(pointer)
    }
    // The canvas remains visually above the DOM; only nearby, visible tablets receive native input.
    const canvas = this.canvas
    if (canvas) canvas.style.pointerEvents = interactive ? 'none' : this.originalPointerEvents
  }
  prepare(camera: THREE.Camera): void {
    if (!this.active.length) return
    const width = this.viewport.clientWidth,
      height = this.viewport.clientHeight
    if (this.size.x !== width || this.size.y !== height) {
      this.size.set(width, height)
      this.renderer.setSize(width, height)
    }
    for (const entry of this.active) {
      entry.mesh.updateWorldMatrix(true, false)
      // Use CSS pixel units for native DOM hit testing as well as visual projection.
      entry.object.matrix
        .copy(entry.mesh.matrixWorld)
        .premultiply(new THREE.Matrix4().makeScale(1000, 1000, 1000))
        .multiply(new THREE.Matrix4().makeScale(0.001, 0.001, 0.001))
      entry.object.matrixWorldNeedsUpdate = true
      entry.mesh.material = this.aperture
    }
    const cssCamera = camera.clone()
    cssCamera.position.multiplyScalar(1000)
    cssCamera.updateMatrixWorld()
    this.renderer.render(this.scene, cssCamera)
  }
  finish(): void {
    for (const entry of this.active) entry.mesh.material = entry.material
  }
}

function underfoot(document: SceneDocument, x: number, z: number): string {
  let building: string | undefined
  let street: string | undefined
  let streetDist = Infinity
  for (const e of document.entities) {
    if (e.vehicle || e.portal || e.parentId) continue
    const tags = e.source?.tags
    const [px, , pz] = e.transform.position
    if (tags?.building && e.size) {
      if (Math.abs(x - px) <= e.size[0] / 2 && Math.abs(z - pz) <= e.size[2] / 2) building = e.name
    }
    if (!e.road || !tags?.highway) continue
    for (const path of e.road.paths)
      for (let i = 1; i < path.length; i++) {
        const d = segmentDistance(x, z, path[i - 1][0], path[i - 1][2], path[i][0], path[i][2])
        if (d <= e.road.width / 2 && d < streetDist) {
          streetDist = d
          street = e.name
        }
      }
  }
  return [
    building ? `Building · ${building}` : 'Building · none',
    street ? `Street · ${street}` : 'Street · none',
  ].join('\n')
}

function segmentDistance(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax
  const dz = bz - az
  const length = dx * dx + dz * dz
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length))
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t))
}
