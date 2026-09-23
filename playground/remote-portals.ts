import * as THREE from 'three'
import { SceneView } from './view.js'
import { GeographicView } from './geography.js'
import type { SceneDocument } from '../src/scene.js'
import type { ExternalPortalView } from './portals.js'

/** Small cache of visited destination scenes, independent of the main view's working frame. */
export class RemotePortalViews {
  private readonly views = new Map<
    string,
    {
      scene: THREE.Scene
      view: SceneView
      geography: GeographicView
      ambient: THREE.AmbientLight
      sun: THREE.DirectionalLight
      ready: boolean
    }
  >()
  constructor(
    private readonly changed: () => void,
    private readonly report: (message: string) => void,
  ) {}
  resolve(key: string, document: SceneDocument, entityId: string): ExternalPortalView | undefined {
    let entry = this.views.get(key)
    if (!entry) {
      // Limit simultaneous destination render resources. Closed connections are disposed by the host.
      if (this.views.size >= 2) return undefined
      const scene = new THREE.Scene(),
        view = new SceneView(document)
      const geography = new GeographicView(document, this.changed)
      const ambient = new THREE.AmbientLight('#dce7f5', 0.22),
        sun = new THREE.DirectionalLight('#fff0d8', 3.2)
      scene.add(view.root, geography.tiles, ambient, sun)
      entry = { scene, view, geography, ambient, sun, ready: false }
      this.views.set(key, entry)
      const owned = entry
      void view.ready
        .then(() => {
          if (this.views.get(key) === owned) {
            owned.ready = true
            this.changed()
          }
        })
        .catch(() => this.report('No se pudo preparar la vista del portal de destino'))
    }
    const target = entry.view.portals.get(entityId)
    if (!entry.ready || !target) return undefined
    entry.scene.updateMatrixWorld(true)
    const e = entry
    return {
      destination: target,
      scene: e.scene,
      background: (renderer, camera) => {
        camera.far = Math.max(camera.far, 2000)
        camera.updateProjectionMatrix()
        e.view.flushMapInstall(3, 16, camera.position)
        e.view.limitDrawDistance(camera.position, 1500, false, true, 1000)
        e.geography.viewDistance = 1500
        e.geography.update(camera.position.toArray(), new THREE.Vector3(), document.sky)
        const air = e.geography.atmosphere
        e.scene.fog = air.space >= 1 ? null : new THREE.Fog(air.color, air.near, air.far)
        e.ambient.intensity = 0.22 * air.day * (1 - air.space)
        e.sun.position.copy(e.geography.sunDirection).multiplyScalar(65)
        e.sun.intensity = 3.2 * Math.max(air.day, air.space)
        if (e.geography.enabled) {
          e.geography.render(renderer, camera, camera.position)
          renderer.autoClear = false
        } else e.scene.background = new THREE.Color('#a6bbd5')
      },
    }
  }
  get pending(): boolean {
    return [...this.views.values()].some((e) => e.ready && e.view.pendingBuildingBatches)
  }
  dispose(): void {
    for (const e of this.views.values()) {
      e.view.dispose()
      e.geography.dispose()
    }
    this.views.clear()
  }
}
