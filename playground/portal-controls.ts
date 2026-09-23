import * as THREE from 'three'
import { HelmMap } from './helm-map.js'
import { localToGeo } from '../src/geography.js'
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js'
import type { SceneDocument } from '../src/scene.js'
import type { Simulation } from '../src/simulation.js'

/** Native DOM tablets share the portal pose; activation is limited to one metre. */
export class PortalControls {
  projectRegistry?: {
    entries: () => { id: string; name: string; place: string; size: number[] }[]
    selected: (source: string) => string | undefined
    configure: (source: string, destination: string | null, open: boolean) => string
    status: (source: string) => string | undefined
  }
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
      kind: 'touch' | 'telemetry' | 'map'
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
      if (
        this.simulation?.player.vehicleId !== carrier ||
        !this.simulation.vehicleInfo(carrier).flightMode
      )
        continue
      if (action === 'brake') result.brake = true
      else {
        const [axis, sign] = action.split(':')
        if (axis === 'forward' || axis === 'right' || axis === 'lift' || axis === 'turn')
          result[axis] = Math.max(-1, Math.min(1, result[axis] + Number(sign)))
      }
    }
    return result
  }
  constructor(
    private viewport: HTMLElement,
    private report: (message: string) => void,
  ) {
    window.addEventListener('blur', () => this.held.clear())
    window.document.addEventListener('visibilitychange', () => this.held.clear())
    window.document.addEventListener('pointerlockchange', () => this.held.clear())
    this.renderer.domElement.className = 'css-world-layer portal-tablet-layer'
    this.viewport.prepend(this.renderer.domElement)
    this.viewport.addEventListener('pointerdown', (event) => {
      const canvas = this.viewport.querySelector<HTMLCanvasElement>('#viewport > canvas')
      if (
        this.simulation &&
        event.target === this.viewport &&
        canvas?.style.pointerEvents === 'none'
      )
        void canvas.requestPointerLock()
    })
  }
  rebuild(document: SceneDocument): void {
    this.held.clear()
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
      select.setAttribute('aria-label', `Destino de ${mouth.name}`)
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
        ['Abrir', 'open'],
        ['Cerrar', 'closed'],
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
            if (mode === 'open' && !target) throw new Error('Elige un destino primero')
            this.report(this.simulation.configurePortal(mouth.id, target, mode))
          } catch (error) {
            this.report((error as Error).message)
          }
        }
        buttons.append(button)
      }
      panel.append(title, select, buttons, status)
      const object = new CSS3DObject(panel)
      this.renderer.domElement.append(panel)
      object.matrixAutoUpdate = false
      this.scene.add(object)
      this.entries.set(mouth.id, { panel, select, status, object })
    }
    for (const carrier of document.entities.filter((e) => e.vehicle?.interior)) {
      for (const kind of ['touch', 'telemetry', 'map'] as const) {
        const panel = window.document.createElement('div')
        panel.className = `helm-console ${kind}-console`
        panel.dataset.carrier = carrier.id
        panel.hidden = true
        if (kind === 'telemetry')
          panel.innerHTML = '<strong>TELEMETRÍA</strong><output></output><small></small>'
        if (kind === 'map')
          panel.innerHTML =
            '<strong>NAVEGACIÓN</strong><canvas aria-label="Mapa cenital de carreteras"></canvas><small>Norte arriba · mapa local</small>'
        if (kind === 'touch') {
          panel.innerHTML =
            '<div class="helm-indicators">NABLA · CONTROL DE VUELO</div><div class="hand-controls"><div class="dpad" data-hand="left"><span>WASD</span></div><div class="desk-switches"><button data-flight>Activar vuelo</button><button data-door>Cerrar garaje</button><label>Límite <select aria-label="Velocidad máxima"><option value="0">Parado</option><option value="100">100 km/h</option><option value="300">300 km/h</option><option value="600">600 km/h</option><option value="1000" selected>1000 km/h</option></select></label><button data-brake>Frenar</button></div><div class="dpad" data-hand="right"><span>CURSORES</span></div></div>'
          panel.querySelector<HTMLSelectElement>('select')!.onchange = (event) => {
            if (this.simulation && panel.dataset.active === 'true')
              this.simulation.setCruiseSpeed(
                carrier.id,
                Number((event.target as HTMLSelectElement).value),
              )
          }
          panel.querySelector<HTMLButtonElement>('[data-flight]')!.onclick = () => {
            if (this.simulation?.player.vehicleId === carrier.id && panel.dataset.active === 'true')
              this.report(this.simulation.toggleFlight())
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
                this.simulation?.player.vehicleId !== carrier.id ||
                !this.simulation.vehicleInfo(carrier.id).flightMode
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
            ['left', 'up', 'W', 'Subir', 'lift:1'],
            ['left', 'left', 'A', 'Girar izquierda', 'turn:-1'],
            ['left', 'down', 'S', 'Bajar', 'lift:-1'],
            ['left', 'right', 'D', 'Girar derecha', 'turn:1'],
            ['right', 'up', '↑', 'Avanzar', 'forward:1'],
            ['right', 'left', '←', 'Izquierda', 'right:-1'],
            ['right', 'down', '↓', 'Retroceder', 'forward:-1'],
            ['right', 'right', '→', 'Derecha', 'right:1'],
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
          `${state.mode === 'open' ? 'Abierto' : state.mode === 'window' ? 'Ventana' : 'Cerrado'}${destination ? ' · ' + destination : ''} · G libera el ratón`
    }
    for (const entry of this.panels.values()) {
      const mesh = (
        entry.kind === 'touch'
          ? touchScreens
          : entry.kind === 'telemetry'
            ? flightScreens
            : helmScreens
      ).get(entry.carrier)
      const anchor = helmScreens.get(entry.carrier)
      if (!sim || !mesh || !anchor) continue
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
        entry.panel.querySelector('output')!.textContent =
          `${info.speedKmh.toFixed(0)} km/h · Altitud ${altitude}`
        entry.panel.querySelector('small')!.textContent =
          `${info.flightMode ? 'VUELO · altura asistida' : 'TIERRA'}\nCabeceo ${((euler.x * 180) / Math.PI).toFixed(0)}° · Alabeo ${((euler.z * 180) / Math.PI).toFixed(0)}°\nLímite ${info.cruiseSpeed} km/h`
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
        const flight = entry.panel.querySelector<HTMLButtonElement>('[data-flight]')!
        if (readout) {
          const label = info.rampMoving
            ? 'Puerta en movimiento…'
            : info.rampClosed
              ? 'Abrir garaje'
              : 'Cerrar garaje'
          if (door.textContent !== label) door.textContent = label
          const mode = info.flightMode ? 'Activar tierra' : 'Activar vuelo'
          if (flight.textContent !== mode) flight.textContent = mode
        }
        door.disabled = info.rampMoving
        flight.disabled = sim.player.vehicleId !== entry.carrier
        for (const button of entry.panel.querySelectorAll<HTMLButtonElement>('[data-action]'))
          button.disabled = !piloting || !info.flightMode
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
    const canvas = this.viewport.querySelector<HTMLCanvasElement>('#viewport > canvas')
    if (canvas) canvas.style.pointerEvents = interactive ? 'none' : ''
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
