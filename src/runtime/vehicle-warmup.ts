/** Prepare the mounted vehicle presentation, rather than the unmodified source GLB. */
import * as THREE from 'three'
import type { Entity } from '../entity/schema.js'
import type { SceneView } from '../render/entity/view.js'
import { materialTextures } from '../render/entity/asset-warmup.js'

export interface VehicleWarmupTarget {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  createView: (entities: Entity[]) => SceneView
}

/** Retain prepared materials until runtime disposal so Three.js retains their programs. */
export class VehicleWarmup {
  private readonly warmed = new Map<string, Promise<void>>()
  private readonly kept = new Set<SceneView>()
  private queue: Promise<void> = Promise.resolve()
  private disposed = false
  constructor(private readonly target: VehicleWarmupTarget) {}

  warm(entities: readonly Entity[]): Promise<void> {
    // IDs, positions and paint colours do not change shader variants; finishes can.
    const key = JSON.stringify(entities.map((e) => [e.visual, e.vehicle]))
    const cached = this.warmed.get(key)
    if (cached) return cached
    const snapshot = structuredClone([...entities])
    const pending = this.queue.then(() => this.prepare(snapshot))
    this.queue = pending.catch(() => undefined)
    this.warmed.set(key, pending)
    void pending.catch(() => this.warmed.delete(key))
    return pending
  }

  private async prepare(entities: readonly Entity[]): Promise<void> {
    if (this.disposed) return
    const { renderer, scene } = this.target
    const view = this.target.createView([...entities])
    this.kept.add(view)
    try {
      await view.ready
      if (this.disposed) return
      view.setPlaying(true)
      // Only vehicle groups join the warm draw. The temporary view's fixed light pools
      // must not increase the actual scene's lighting budget.
      const group = new THREE.Group()
      for (const entity of entities) {
        const object = view.objects.get(entity.id)
        if (object) group.add(object)
      }
      view.root.add(group)
      group.updateMatrixWorld(true)
      group.traverse((object) => {
        // Hidden authored lamps remain hidden. Geometry outside the live camera's frustum
        // still needs its GPU buffers uploaded before an eventual cockpit/chase view.
        if (object instanceof THREE.Mesh) object.frustumCulled = false
      })
      for (const texture of materialTextures(group)) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        if (this.disposed) return
        renderer.initTexture(texture)
      }
      const camera = this.target.camera.clone()
      await renderer.compileAsync(group, camera, scene)
      if (this.disposed) return
      const previous = renderer.getRenderTarget()
      const target = new THREE.WebGLRenderTarget(1, 1)
      // Attach, draw and detach in one synchronous block: attract/game frames never see
      // these representatives. Use the real scene's lights and shadow configuration.
      scene.add(group)
      try {
        renderer.setRenderTarget(target)
        renderer.render(scene, camera)
        for (const id of view.mirroredVehicles)
          view.renderMirrors(renderer, scene, camera, id, performance.now())
      } finally {
        renderer.setRenderTarget(previous)
        target.dispose()
        group.removeFromParent()
        view.root.add(group)
      }
    } catch (error) {
      view.dispose()
      this.kept.delete(view)
      throw error
    }
  }

  dispose(): void {
    this.disposed = true
    for (const view of this.kept) view.dispose()
    this.kept.clear()
    this.warmed.clear()
  }
}
