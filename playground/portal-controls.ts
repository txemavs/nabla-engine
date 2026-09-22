import * as THREE from 'three'
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js'
import type { SceneDocument } from '../src/scene.js'
import type { Simulation } from '../src/simulation.js'

/** Native DOM tablets share the portal pose; activation is limited to one metre. */
export class PortalControls {
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
  private helm = new Map<
    string,
    { panel: HTMLDivElement; object: CSS3DObject; readout: HTMLElement; door: HTMLButtonElement }
  >()
  private auxiliary = new Map<
    string,
    { carrier: string; kind: 'touch' | 'flight'; panel: HTMLDivElement; object: CSS3DObject }
  >()
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
      const canvas = this.viewport.querySelector('canvas')
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
    for (const entry of this.auxiliary.values()) this.scene.remove(entry.object)
    this.auxiliary.clear()
    for (const entry of this.entries.values()) this.scene.remove(entry.object)
    this.entries.clear()
    for (const entry of this.helm.values()) this.scene.remove(entry.object)
    this.helm.clear()
    const mouths = document.entities.filter((e) => e.portal)
    for (const mouth of mouths) {
      const panel = window.document.createElement('div')
      panel.className = mouth.parentId ? 'portal-console helm-portal' : 'portal-console'
      panel.dataset.portalId = mouth.id
      panel.hidden = true
      const title = window.document.createElement('strong')
      title.textContent = mouth.name
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
      select.value = mouth.portal!.pairId ?? ''
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
      object.matrixAutoUpdate = false
      this.scene.add(object)
      this.entries.set(mouth.id, { panel, select, status, object })
    }
    for (const carrier of document.entities.filter((e) => e.vehicle?.interior)) {
      const panel = window.document.createElement('div')
      panel.className = 'helm-console'
      panel.dataset.carrier = carrier.id
      panel.innerHTML =
        '<strong>NABLA · MANDO</strong><output></output><label>Velocidad máxima <select aria-label="Velocidad máxima"><option value="0">Parado</option><option value="100">100 km/h</option><option value="300">300 km/h</option><option value="600">600 km/h</option><option value="1000" selected>1000 km/h</option></select></label><button>Puerta del garaje</button><small>G libera el ratón</small>'
      const readout = panel.querySelector('output')!
      const door = panel.querySelector('button')!
      const select = panel.querySelector('select')!
      select.onchange = () => {
        if (this.simulation && panel.dataset.active === 'true')
          this.simulation.setCruiseSpeed(carrier.id, Number(select.value))
      }
      door.onclick = () => {
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
      const object = new CSS3DObject(panel)
      object.matrixAutoUpdate = false
      this.scene.add(object)
      this.helm.set(carrier.id, { panel, object, readout, door })
      for (const kind of ['touch', 'flight'] as const) {
        const extra = window.document.createElement('div')
        extra.className =
          kind === 'touch' ? 'helm-console touch-console' : 'helm-console flight-console'
        extra.dataset.carrier = carrier.id
        extra.hidden = true
        extra.innerHTML =
          kind === 'flight'
            ? '<strong>NABLA · VUELO</strong><output></output><button data-flight>Activar vuelo</button><p>En vuelo, soltar los controles mantiene la altura. G libera el ratón.</p>'
            : '<strong>NABLA · MESA TÁCTIL</strong><small>Al mando: mantén pulsado para maniobrar · suelta para estabilizar</small><div class="touch-controls"></div>'
        if (kind === 'flight')
          extra.querySelector('button')!.onclick = () => {
            if (
              this.simulation &&
              extra.dataset.active === 'true' &&
              this.simulation.player.vehicleId === carrier.id
            )
              this.report(this.simulation.toggleFlight())
          }
        else
          for (const [label, action] of [
            ['Subir', 'lift:1'],
            ['Bajar', 'lift:-1'],
            ['Girar izquierda', 'turn:-1'],
            ['Girar derecha', 'turn:1'],
            ['Avanzar', 'forward:1'],
            ['Retroceder', 'forward:-1'],
            ['Izquierda', 'right:-1'],
            ['Derecha', 'right:1'],
            ['Frenar', 'brake'],
          ]) {
            const button = window.document.createElement('button')
            button.textContent = label
            button.dataset.action = action
            button.onpointerdown = (event) => {
              if (
                extra.dataset.active !== 'true' ||
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
            extra.querySelector('.touch-controls')!.append(button)
          }
        const css = new CSS3DObject(extra)
        css.matrixAutoUpdate = false
        this.scene.add(css)
        this.auxiliary.set(`${carrier.id}:${kind}`, {
          carrier: carrier.id,
          kind,
          panel: extra,
          object: css,
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
    let interactive = false
    for (const mouth of document.entities.filter((e) => e.portal)) {
      const entry = this.entries.get(mouth.id)
      if (!entry) continue
      entry.panel.hidden = true
      entry.panel.dataset.active = 'false'
      entry.panel.style.pointerEvents = 'none'
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
      const piloting = cockpit && !!mouth.parentId && sim.player.vehicleId === mouth.parentId
      if (
        !piloting &&
        (sim.player.vehicleId ||
          new THREE.Vector3(...sim.player.position).distanceTo(activationPoint) >= 1 ||
          camera.position.distanceTo(activationPoint) >= 1)
      )
        continue
      const clear = sim.cameraPosition(camera.position.toArray(), point.toArray())
      if (new THREE.Vector3(...clear).distanceTo(point) > 0.12) continue
      const screen = point.clone().project(camera)
      if (
        !mouth.parentId &&
        (screen.z < -1 || screen.z > 1 || Math.abs(screen.x) > 1.2 || Math.abs(screen.y) > 1.2)
      )
        continue
      entry.panel.hidden = false
      entry.panel.dataset.active = 'true'
      entry.panel.style.pointerEvents = window.document.pointerLockElement ? 'none' : 'auto'
      interactive ||= !window.document.pointerLockElement
      this.active.push({ mesh, material: mesh.material, object: entry.object })
      const state = sim.portalState(mouth.id)
      entry.panel.dataset.mode = state.mode
      const destination = document.entities.find((e) => e.id === state.pairId)?.name
      entry.status.textContent = `${state.mode === 'open' ? 'Abierto' : state.mode === 'window' ? 'Ventana' : 'Cerrado'}${destination ? ' · ' + destination : ''} · G libera el ratón`
    }
    for (const [id, entry] of this.helm) {
      entry.panel.hidden = true
      entry.panel.dataset.active = 'false'
      entry.panel.style.pointerEvents = 'none'
      const mesh = helmScreens.get(id)
      if (!sim || !mesh) continue
      mesh.updateWorldMatrix(true, false)
      const point = mesh.getWorldPosition(new THREE.Vector3()).add(renderOrigin)
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld)
      if (camera.position.clone().sub(point).dot(normal) <= 0) continue
      const piloting = cockpit && sim.player.vehicleId === id
      if (
        !piloting &&
        (sim.player.vehicleId ||
          camera.position.distanceTo(point) >= 1 ||
          new THREE.Vector3(...sim.player.position).distanceTo(point) >= 1)
      )
        continue
      const clear = sim.cameraPosition(camera.position.toArray(), point.toArray())
      if (new THREE.Vector3(...clear).distanceTo(point) > 0.12) continue
      const info = sim.vehicleInfo(id)
      entry.panel.hidden = false
      entry.panel.dataset.active = 'true'
      entry.panel.style.pointerEvents = window.document.pointerLockElement ? 'none' : 'auto'
      interactive ||= !window.document.pointerLockElement
      entry.readout.textContent = `${info.speedKmh.toFixed(0)} km/h · Altitud ${info.altitude.toFixed(0)} m`
      entry.door.textContent = info.rampMoving
        ? 'Puerta en movimiento…'
        : info.rampClosed
          ? 'Abrir garaje'
          : 'Cerrar garaje'
      entry.door.disabled = info.rampMoving
      this.active.push({ mesh, material: mesh.material, object: entry.object })
    }
    for (const entry of this.auxiliary.values()) {
      const mesh = (entry.kind === 'touch' ? touchScreens : flightScreens).get(entry.carrier)
      const anchor = helmScreens.get(entry.carrier)
      let visible = false
      if (sim && mesh && anchor) {
        mesh.updateWorldMatrix(true, false)
        anchor.updateWorldMatrix(true, false)
        const point = mesh.getWorldPosition(new THREE.Vector3()).add(renderOrigin)
        const activation = anchor.getWorldPosition(new THREE.Vector3()).add(renderOrigin)
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld)
        const piloting = cockpit && sim.player.vehicleId === entry.carrier
        const nearby =
          !sim.player.vehicleId &&
          camera.position.distanceTo(activation) < 1 &&
          new THREE.Vector3(...sim.player.position).distanceTo(activation) < 1
        const clear = sim.cameraPosition(camera.position.toArray(), point.toArray())
        visible =
          (piloting || nearby) &&
          camera.position.clone().sub(point).dot(normal) > 0 &&
          new THREE.Vector3(...clear).distanceTo(point) < 0.12
        if (visible) {
          this.active.push({ mesh, material: mesh.material, object: entry.object })
          interactive ||= !window.document.pointerLockElement
          const info = sim.vehicleInfo(entry.carrier)
          if (entry.kind === 'flight') {
            entry.panel.querySelector('output')!.textContent = info.flightMode
              ? 'Vuelo · altura estabilizada'
              : 'Modo tierra'
            const button = entry.panel.querySelector('button')!
            button.textContent = info.flightMode ? 'Activar tierra' : 'Activar vuelo'
            button.disabled = sim.player.vehicleId !== entry.carrier
          } else
            for (const button of entry.panel.querySelectorAll('button'))
              button.disabled = !piloting || !info.flightMode
        }
      }
      entry.panel.hidden = !visible
      entry.panel.dataset.active = String(visible)
      entry.panel.style.pointerEvents =
        visible && !window.document.pointerLockElement ? 'auto' : 'none'
      if (entry.kind === 'touch' && (!visible || window.document.pointerLockElement)) {
        for (const [pointer, held] of this.held)
          if (held.carrier === entry.carrier) this.held.delete(pointer)
      }
    }
    // The canvas remains visually above the DOM; only nearby, visible tablets receive native input.
    const canvas = this.viewport.querySelector('canvas')
    if (canvas) canvas.style.pointerEvents = interactive ? 'none' : ''
  }
  prepare(camera: THREE.Camera): void {
    this.renderer.setSize(this.viewport.clientWidth, this.viewport.clientHeight)
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
