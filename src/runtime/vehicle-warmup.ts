import { nextPaint } from './next-paint.js'
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

  warm(entities: readonly Entity[], progress?: (phase: string) => Promise<void>): Promise<void> {
    // IDs, positions and paint colours do not change shader variants; finishes can.
    const key = JSON.stringify(entities.map((e) => [e.visual, e.vehicle]))
    const cached = this.warmed.get(key)
    if (cached) return cached
    const snapshot = structuredClone([...entities])
    const pending = this.queue.then(() => this.prepare(snapshot, progress))
    this.queue = pending.catch(() => undefined)
    this.warmed.set(key, pending)
    void pending.catch(() => this.warmed.delete(key))
    return pending
  }

  private async prepare(
    entities: readonly Entity[],
    progress?: (phase: string) => Promise<void>,
  ): Promise<void> {
    const checkpoint = async (phase: string) => {
      await progress?.(phase)
      // A task after rAF allows the browser to paint before expensive synchronous work.
      await nextPaint()
    }
    if (this.disposed) return
    const { renderer, scene } = this.target
    await checkpoint('Loading model')
    if (this.disposed) return
    const view = this.target.createView([...entities])
    this.kept.add(view)
    try {
      await view.ready
      if (this.disposed) return
      await checkpoint('Preparing materials')
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
      const textures = materialTextures(group)
      for (const [index, texture] of textures.entries()) {
        await checkpoint(`Uploading textures ${index + 1}/${textures.length}`)
        if (this.disposed) return
        renderer.initTexture(texture)
      }
      const camera = this.target.camera.clone()
      await checkpoint('Compiling vehicle shaders')
      if (this.disposed) return
      await renderer.compileAsync(group, camera, scene)
      if (this.disposed) return
      // Restore all shared render state before yielding: the intro/game loop can run
      // between these phases and must never see a temporary vehicle or target.
      const draw = (operation: () => void) => {
        const previous = renderer.getRenderTarget()
        const shadowNeedsUpdate = renderer.shadowMap.needsUpdate
        const target = new THREE.WebGLRenderTarget(1, 1)
        scene.add(group)
        try {
          renderer.setRenderTarget(target)
          operation()
        } finally {
          renderer.shadowMap.needsUpdate = shadowNeedsUpdate
          renderer.setRenderTarget(previous)
          target.dispose()
          group.removeFromParent()
          view.root.add(group)
        }
      }
      await checkpoint('Rendering scene and shadows')
      if (this.disposed) return
      draw(() => {
        renderer.shadowMap.needsUpdate = true
        renderer.render(scene, camera)
      })
      const mirrors = view.mirroredVehicles
      for (const [index, id] of mirrors.entries()) {
        await checkpoint(`Rendering mirrors ${index + 1}/${mirrors.length}`)
        if (this.disposed) return
        draw(() => view.renderMirrors(renderer, scene, camera, id, performance.now()))
      }
      await checkpoint('Vehicle ready')
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
