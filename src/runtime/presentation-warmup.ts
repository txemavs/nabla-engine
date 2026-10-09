/** Compile chase, cockpit and mirror programs once so later enter/exit and KeyC stay off the critical path. */
import type {
  Material,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Scene,
  Texture,
  WebGLRenderer,
} from 'three'
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

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'alphaMap',
  'bumpMap',
] as const

/**
 * Upload every texture in `scene` (hidden objects included) before it is first drawn, a few
 * milliseconds per frame, so the first gameplay frames (a descent over freshly streamed tiles)
 * do not stall on texture uploads. Already uploaded textures cost a version check.
 */
export async function uploadSceneTextures(
  renderer: { initTexture: (texture: Texture) => void },
  scene: Object3D,
  signal?: AbortSignal,
  budgetMs = 6,
): Promise<number> {
  const textures = new Set<Texture>()
  scene.traverse((object) => {
    const material = (object as Mesh).material as Material | Material[] | undefined
    if (!material) return
    for (const m of Array.isArray(material) ? material : [material]) {
      const slots = m as unknown as Record<string, unknown>
      for (const slot of TEXTURE_SLOTS) {
        const texture = slots[slot]
        if (texture && (texture as Texture).isTexture) textures.add(texture as Texture)
      }
    }
  })
  let started = performance.now()
  let count = 0
  for (const texture of textures) {
    signal?.throwIfAborted()
    if (!texture.image) continue
    try {
      renderer.initTexture(texture)
      count++
    } catch {
      /* Optional; the first frame uploads what remains. */
    }
    if (performance.now() - started > budgetMs) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      started = performance.now()
    }
  }
  return count
}
