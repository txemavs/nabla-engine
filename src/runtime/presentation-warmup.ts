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
import { Scene as EffectScene, WebGLRenderTarget } from 'three'

/** Compile hidden common effects and upload their buffers in an offscreen draw before play. */
export async function warmEffectPresentation(
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
  roots: readonly Object3D[],
  world?: Scene,
): Promise<void> {
  const scene = world ?? new EffectScene()
  const copies: Object3D[] = []
  for (const root of roots) {
    const copy = root.clone(true)
    copy.traverse((object) => {
      object.visible = true
      object.frustumCulled = false
    })
    scene.add(copy)
    copies.push(copy)
  }
  const previous = renderer.getRenderTarget()
  const target = new WebGLRenderTarget(1, 1)
  const auto = renderer.shadowMap.autoUpdate,
    needs = renderer.shadowMap.needsUpdate
  try {
    await renderer.compileAsync(scene, camera)
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.needsUpdate = false
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
  } finally {
    renderer.setRenderTarget(previous)
    renderer.shadowMap.autoUpdate = auto
    renderer.shadowMap.needsUpdate = needs
    target.dispose()
    for (const copy of copies) copy.removeFromParent()
  }
}

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
  onProgress?: (detail: string) => Promise<void>
}

/** Complete GPU preparation before play; propagate errors rather than claiming readiness. */
export async function warmGamePresentation(target: PresentationWarmup): Promise<void> {
  const { renderer, scene, camera, view, settings, signal } = target
  const fov = camera.fov
  try {
    signal?.throwIfAborted()
    await target.onProgress?.('Compilando shaders: vista exterior')
    camera.fov = settings.chaseFov
    camera.updateProjectionMatrix()
    await renderer.compileAsync(scene, camera)
    signal?.throwIfAborted()
    await target.onProgress?.('Compilando shaders: cabina')
    camera.fov = settings.firstPersonFov
    camera.updateProjectionMatrix()
    await renderer.compileAsync(scene, camera)
    const now = performance.now()
    for (const id of view.mirroredVehicles) {
      signal?.throwIfAborted()
      await target.onProgress?.('Preparando espejos: ' + id)
      view.renderMirrors(renderer as WebGLRenderer, scene, camera, id, now)
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    view.renderMirrors(renderer as WebGLRenderer, scene, camera, null, now)
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
