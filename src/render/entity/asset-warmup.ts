/**
 * Get a GLB ready before it is shown: fetch and parse it once (shared `AssetLibrary` cache),
 * upload its textures one per frame, and compile its shader programs with `compileAsync`
 * (KHR_parallel_shader_compile where the browser has it). The warm instance is kept, so its
 * programs stay alive and the real instance that joins the scene reuses them instead of
 * compiling on the first frame it is drawn.
 */
import * as THREE from 'three'
import { assets, disposeObject, type AssetLibrary } from './assets.js'

export interface AssetWarmupTarget {
  renderer: Pick<THREE.WebGLRenderer, 'initTexture' | 'compileAsync'>
  camera: THREE.Camera
  scene: THREE.Scene
}

/** Every `.glb` URL an entity's visual names (body, wheels, steering…), once each. */
export function visualAssetUrls(visual: unknown): string[] {
  const urls = new Set<string>()
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === 'object')
      for (const [key, child] of Object.entries(value))
        if (key === 'url' && typeof child === 'string' && /\.glb(?:$|\?)/i.test(child))
          urls.add(child)
        else walk(child)
  }
  walk(visual)
  return [...urls]
}

/** Unique textures referenced by the materials under `root`. */
export function materialTextures(root: THREE.Object3D): THREE.Texture[] {
  const textures = new Set<THREE.Texture>()
  root.traverse((object) => {
    const material = (object as THREE.Mesh).material
    if (!material) return
    for (const m of Array.isArray(material) ? material : [material])
      for (const value of Object.values(m))
        if ((value as THREE.Texture | null)?.isTexture) textures.add(value as THREE.Texture)
  })
  return [...textures]
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })
}

export class AssetWarmup {
  private readonly warmed = new Map<string, Promise<void>>()
  private readonly kept: THREE.Object3D[] = []
  private disposed = false
  constructor(
    private readonly target: AssetWarmupTarget,
    private readonly library: Pick<AssetLibrary, 'instantiate'> = assets,
    private readonly frame: () => Promise<void> = nextFrame,
  ) {}

  /** Resolve once `url` can be drawn without a parse, texture upload or shader stall. */
  warm(url: string): Promise<void> {
    let pending = this.warmed.get(url)
    if (!pending) {
      pending = this.prepare(url)
      this.warmed.set(url, pending)
      pending.catch(() => this.warmed.delete(url))
    }
    return pending
  }

  /** Warm every GLB of a visual; resolves when all are ready. */
  async warmVisual(visual: unknown): Promise<void> {
    await Promise.all(visualAssetUrls(visual).map((url) => this.warm(url)))
  }

  private async prepare(url: string): Promise<void> {
    const model = await this.library.instantiate(url)
    if (this.disposed) {
      disposeObject(model)
      return
    }
    // GLB lamps are hidden by the vehicle presentation; compiling them in would key the programs
    // to a light count the scene never draws.
    model.traverse((object) => {
      if (object instanceof THREE.Light) object.visible = false
    })
    // Texture upload and shader compile on the warm instance are off: the warm clone shares its
    // materials and textures with the real vehicle, and since #189 the S3 cabin and the VFR body
    // rendered black (2026-10-09). Only the GLB fetch and parse stay ahead of the spawn.
    await this.frame()
    this.kept.push(model)
    if (this.disposed) this.dispose()
  }

  /** Release the kept warm instances (shared geometry and textures stay with the library). */
  dispose(): void {
    this.disposed = true
    for (const model of this.kept.splice(0)) disposeObject(model)
  }
}
