/** Compile chase, cockpit and mirror programs once so later enter/exit and KeyC stay off the critical path. */
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import type { SceneView } from '../render/entity/view.js'
import type { GameCameraSettings } from '../config/camera.js'

export interface PresentationWarmup {
  renderer: {
    compileAsync: (...args: Parameters<WebGLRenderer['compileAsync']>) => Promise<unknown>
  }
  scene: Scene
  camera: PerspectiveCamera
  view: {
    mirroredVehicles: readonly string[]
    renderMirrors: SceneView['renderMirrors']
  }
  settings: Pick<GameCameraSettings, 'firstPersonFov' | 'chaseFov'>
  signal?: AbortSignal
}

/** Best-effort GPU warmup. Failures must not stop play. */
export async function warmGamePresentation(target: PresentationWarmup): Promise<void> {
  const { renderer, scene, camera, view, settings, signal } = target
  const fov = camera.fov
  try {
    signal?.throwIfAborted()
    camera.fov = settings.chaseFov
    camera.updateProjectionMatrix()
    await renderer.compileAsync(scene, camera)
    signal?.throwIfAborted()
    camera.fov = settings.firstPersonFov
    camera.updateProjectionMatrix()
    await renderer.compileAsync(scene, camera)
    const now = performance.now()
    for (const id of view.mirroredVehicles) {
      signal?.throwIfAborted()
      view.renderMirrors(renderer as WebGLRenderer, scene, camera, id, now)
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    view.renderMirrors(renderer as WebGLRenderer, scene, camera, null, now)
  } catch {
    /* Warmup is optional; the next visible frame still compiles what remains. */
  } finally {
    camera.fov = fov
    camera.updateProjectionMatrix()
  }
}
