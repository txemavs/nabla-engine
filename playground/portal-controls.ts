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
  private simulation: Simulation | null = null
  constructor(
    private viewport: HTMLElement,
    private report: (message: string) => void,
  ) {
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
    for (const entry of this.entries.values()) this.scene.remove(entry.object)
    this.entries.clear()
    const mouths = document.entities.filter((e) => e.portal)
    for (const mouth of mouths) {
      const panel = window.document.createElement('div')
      panel.className = 'portal-console'
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
  }
  update(
    sim: Simulation | null,
    document: SceneDocument,
    camera: THREE.PerspectiveCamera,
    tablets: Map<string, THREE.Mesh[]>,
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
      if (!sim || sim.player.vehicleId) continue
      const pose = sim.entityTransform(mouth.id, true)
      const q = new THREE.Quaternion(...pose.rotation)
      const centre = new THREE.Vector3(...pose.position)
      const localEye = camera.position.clone().sub(centre).applyQuaternion(q.clone().invert())
      const side = localEye.z >= 0 ? 1 : -1
      const point = new THREE.Vector3(mouth.size[0] / 2 - 0.25, -0.15, side * 0.255)
        .applyQuaternion(q)
        .add(centre)
      if (
        new THREE.Vector3(...sim.player.position).distanceTo(point) >= 1 ||
        camera.position.distanceTo(point) >= 1
      )
        continue
      const clear = sim.cameraPosition(camera.position.toArray(), point.toArray())
      if (new THREE.Vector3(...clear).distanceTo(point) > 0.12) continue
      const screen = point.clone().project(camera)
      if (screen.z < -1 || screen.z > 1 || Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1)
        continue
      const mesh = tablets.get(mouth.id)?.[side === 1 ? 0 : 1]
      if (!mesh) continue
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
