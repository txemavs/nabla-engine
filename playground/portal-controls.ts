import * as THREE from 'three'
import type { SceneDocument } from '../src/scene.js'
import type { Simulation } from '../src/simulation.js'

/** Projected controls stay beside their physical frame; all changes go through Simulation. */
export class PortalControls {
  private entries = new Map<
    string,
    { panel: HTMLDivElement; select: HTMLSelectElement; status: HTMLElement }
  >()
  private simulation: Simulation | null = null
  constructor(
    private viewport: HTMLElement,
    private report: (message: string) => void,
  ) {}
  rebuild(document: SceneDocument): void {
    for (const entry of this.entries.values()) entry.panel.remove()
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
          if (!this.simulation) return
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
      this.viewport.append(panel)
      this.entries.set(mouth.id, { panel, select, status })
    }
  }
  update(sim: Simulation | null, document: SceneDocument, camera: THREE.PerspectiveCamera): void {
    this.simulation = sim
    camera.updateMatrixWorld(true)
    for (const mouth of document.entities.filter((e) => e.portal)) {
      const entry = this.entries.get(mouth.id)
      if (!entry) continue
      entry.panel.hidden = true
      if (!sim) continue
      const pose = sim.entityTransform(mouth.id, true)
      const q = new THREE.Quaternion(...pose.rotation)
      const centre = new THREE.Vector3(...pose.position)
      const localEye = camera.position.clone().sub(centre).applyQuaternion(q.clone().invert())
      const point = new THREE.Vector3(
        mouth.size[0] / 2 - 0.15,
        -0.15,
        localEye.z >= 0 ? 0.25 : -0.25,
      )
        .applyQuaternion(q)
        .add(centre)
      if (camera.position.distanceTo(point) > 11) continue
      // Do not expose controls through walls or closed gates.
      const clear = sim.cameraPosition(camera.position.toArray(), point.toArray())
      if (new THREE.Vector3(...clear).distanceTo(point) > 0.3) continue
      const screen = point.project(camera)
      if (screen.z < -1 || screen.z > 1 || Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1)
        continue
      entry.panel.hidden = false
      entry.panel.style.left = `${Math.max(5, Math.min(this.viewport.clientWidth - 215, ((screen.x + 1) * this.viewport.clientWidth) / 2))}px`
      entry.panel.style.top = `${Math.max(35, Math.min(this.viewport.clientHeight - 140, ((1 - screen.y) * this.viewport.clientHeight) / 2))}px`
      const state = sim.portalState(mouth.id)
      entry.panel.dataset.mode = state.mode
      const destination = document.entities.find((e) => e.id === state.pairId)?.name
      entry.status.textContent = `${state.mode === 'open' ? 'Abierto' : state.mode === 'window' ? 'Ventana' : 'Cerrado'}${destination ? ' · ' + destination : ''} · G libera el ratón`
    }
  }
}
