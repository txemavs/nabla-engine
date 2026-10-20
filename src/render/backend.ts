import * as THREE from 'three'
import {
  hasWebGPUMaterialNodes,
  hasWebGPUSubstitute,
  nodeMaterialTwin,
  webgpuMaterialTwin,
  webgpuSubstitute,
  type NodeKit,
} from './webgpu-substitutes.js'
import { decodeDisplay } from './planet/sky-nodes.js'

/** Renderer requested by the page: `auto` picks WebGPU when an adapter exists, else WebGL. */
export type RendererPreference = 'webgl' | 'webgpu' | 'auto'
/** Backend actually drawing the frame. */
export type RenderBackendKind = 'webgl' | 'webgpu'

/**
 * One renderer and the backend behind it. Under WebGPU, `renderer` is a `three/webgpu`
 * `WebGPURenderer` exposed through the `WebGLRenderer` surface the runtime already uses; every
 * WebGL-only call site checks `kind` (or `isWebGPU`) first. See {@link createRenderBackend}.
 */
export interface RenderBackend {
  readonly kind: RenderBackendKind
  readonly renderer: THREE.WebGLRenderer
  /** What the page asked for; differs from `kind` when `auto` or a WebGPU fallback chose WebGL. */
  readonly requested: RendererPreference
  /** Why WebGPU was not used when it was requested, for diagnostics. */
  readonly fallbackReason?: string
}

/** Parameters shared by both renderers; others stay backend defaults. */
export interface RenderBackendParameters {
  canvas: HTMLCanvasElement
  antialias?: boolean
  alpha?: boolean
  logarithmicDepthBuffer?: boolean
}

/** `?renderer=webgpu|webgl|auto`; anything else (or no parameter) keeps the WebGL default. */
export function parseRendererPreference(search: string | URLSearchParams): RendererPreference {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  const value = params.get('renderer')?.trim().toLowerCase()
  return value === 'webgpu' || value === 'auto' ? value : 'webgl'
}

interface GpuLike {
  requestAdapter(): Promise<unknown>
}

/** True when the browser exposes `navigator.gpu` and grants an adapter. */
export async function webgpuAvailable(): Promise<boolean> {
  const gpu =
    typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { gpu?: GpuLike }).gpu
  if (!gpu) return false
  try {
    return !!(await gpu.requestAdapter())
  } catch {
    return false
  }
}

const backends = new WeakMap<object, RenderBackendKind>()

/** Backend of a renderer created by {@link createRenderBackend}; plain renderers are WebGL. */
export function rendererBackend(renderer: object): RenderBackendKind {
  // `isWebGPURenderer` also answers for a second instance of this module (tests, HMR).
  return (
    backends.get(renderer) ??
    ((renderer as { isWebGPURenderer?: boolean }).isWebGPURenderer ? 'webgpu' : 'webgl')
  )
}

export function isWebGPU(renderer: object): boolean {
  return rendererBackend(renderer) === 'webgpu'
}

/**
 * Create and initialise the renderer for a preference. WebGL is the default and is created exactly
 * as before. WebGPU loads `three/webgpu` on demand, awaits `init()`, and falls back to WebGL when
 * no adapter exists or initialisation fails.
 */
export async function createRenderBackend(
  preference: RendererPreference,
  parameters: RenderBackendParameters,
): Promise<RenderBackend> {
  const webgl = (fallbackReason?: string): RenderBackend => {
    const renderer = new THREE.WebGLRenderer(parameters)
    backends.set(renderer, 'webgl')
    return { kind: 'webgl', renderer, requested: preference, fallbackReason }
  }
  if (preference === 'webgl') return webgl()
  if (!(await webgpuAvailable())) return webgl('No WebGPU adapter')
  try {
    const [webgpu, tsl, csm] = await Promise.all([
      import('three/webgpu'),
      import('three/tsl'),
      import('three/addons/csm/CSMShadowNode.js'),
    ])
    const gpu = new webgpu.WebGPURenderer({ ...parameters, forceWebGL: false })
    await gpu.init()
    const renderer = webglSurface(gpu, {
      webgpu,
      tsl,
      logarithmicDepth: !!parameters.logarithmicDepthBuffer,
      CSMShadowNode: csm.CSMShadowNode,
    })
    backends.set(renderer, 'webgpu')
    return { kind: 'webgpu', renderer, requested: preference }
  } catch (error) {
    console.warn('WebGPU renderer failed; using WebGL', error)
    return webgl(error instanceof Error ? error.message : String(error))
  }
}

/** Draw calls of the last frame: WebGPU counts them in `drawCalls`, WebGL in `calls`. */
export function frameDrawCalls(renderer: THREE.WebGLRenderer): number {
  const render = renderer.info.render as typeof renderer.info.render & { drawCalls?: number }
  return isWebGPU(renderer) ? (render.drawCalls ?? render.calls) : render.calls
}

interface WebGPURendererLike {
  getMaxAnisotropy(): number
  getRenderTarget(): unknown
  render(scene: THREE.Object3D, camera: THREE.Camera): unknown
  compileAsync(
    object: THREE.Object3D,
    camera: THREE.Camera,
    targetScene?: THREE.Scene | null,
  ): Promise<unknown>
}

const compatibility = new WeakMap<object, WebGPUCompatibility>()

/** GLSL-only material names a WebGPU renderer has skipped so far; empty under WebGL. */
export function webgpuSkippedMaterials(renderer: object): string[] {
  return [...(compatibility.get(renderer)?.skipped ?? [])]
}

/**
 * Give a WebGPU renderer the few WebGL-only members the runtime reads unconditionally
 * (`capabilities.getMaxAnisotropy`, `forceContextLoss`), and route every `render` and
 * `compileAsync` through {@link WebGPUCompatibility} so no pass, warmup or mirror capture draws a
 * GLSL `ShaderMaterial` with the node backend's default material. Everything else is shared API.
 */
function webglSurface(gpu: WebGPURendererLike, kit?: NodeKit): THREE.WebGLRenderer {
  const target = gpu as WebGPURendererLike & {
    capabilities?: { getMaxAnisotropy(): number }
    forceContextLoss?: () => void
  }
  target.capabilities ??= { getMaxAnisotropy: () => gpu.getMaxAnisotropy() }
  target.forceContextLoss ??= () => {}
  const guard = new WebGPUCompatibility(
    kit,
    () =>
      gpu.getRenderTarget() === null &&
      (gpu as unknown as { toneMapping: THREE.ToneMapping }).toneMapping !== THREE.NoToneMapping,
  )
  compatibility.set(gpu, guard)
  if (kit) Object.defineProperty(gpu, NODE_KIT, { value: kit })
  const render = gpu.render.bind(gpu)
  target.render = (scene, camera) => {
    guard.apply(scene)
    try {
      return render(scene, camera)
    } finally {
      guard.restore()
    }
  }
  // compileAsync collects its render objects synchronously before its first await.
  const compileAsync = gpu.compileAsync.bind(gpu)
  target.compileAsync = (object, camera, targetScene) => {
    const roots = targetScene && targetScene !== object ? [object, targetScene] : [object]
    for (const root of roots) guard.apply(root)
    try {
      return compileAsync(object, camera, targetScene)
    } finally {
      for (let i = 0; i < roots.length; i++) guard.restore()
    }
  }
  return target as unknown as THREE.WebGLRenderer
}

/** Material built from GLSL (or patched GLSL) that the WebGPU node backend cannot compile. */
/** The node kit of a WebGPU renderer made by `createRenderBackend`, or undefined under WebGL. */
export function webgpuNodeKit(renderer: object): NodeKit | undefined {
  // Kept on the renderer itself, so it survives a second instance of this module (tests, HMR).
  return (renderer as { [NODE_KIT]?: NodeKit })[NODE_KIT]
}

const NODE_KIT = Symbol.for('nabla.webgpuNodeKit')

export function glslOnlyMaterial(material: THREE.Material): boolean {
  if ((material as { isNodeMaterial?: boolean }).isNodeMaterial) return false
  return (
    (material as THREE.ShaderMaterial).isShaderMaterial === true ||
    (material as THREE.RawShaderMaterial).isRawShaderMaterial === true
  )
}

/**
 * WebGPU-only guard: hide meshes whose material is GLSL `ShaderMaterial` (the node backend would
 * draw them with a default white material). Hidden objects are tracked so a later visibility
 * change by their owner is honoured on the next frame. Returns the material names hidden now,
 * for diagnostics. Materials patched with `onBeforeCompile` still draw, as their base material.
 */
export class WebGPUCompatibility {
  /** Objects hidden by this guard and the visibility their owner last set. */
  private readonly hidden = new Map<THREE.Object3D, boolean>()
  /** Materials swapped for their TSL substitute, with the GLSL original to put back. */
  private readonly swapped = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
  /** Replacement objects added next to their (hidden) original for this frame. */
  private readonly added: THREE.Object3D[] = []
  /** Distinct GLSL-only material names met, for the gap list in diagnostics. */
  readonly skipped = new Set<string>()
  /** Nested apply/restore pairs (a mirror capture inside a frame); restore at the outermost. */
  private depth = 0
  /** Display twins of `toneMapped: false` materials (see {@link displayTwin}). */
  private readonly displayTwins = new WeakMap<
    THREE.Material,
    { material: THREE.Material; sync(): void }
  >()
  /** Background nodes that undo the output tone mapping of a background colour. */
  private readonly backgrounds = new WeakMap<THREE.Color, unknown>()
  /** Scene whose `backgroundNode` this frame set, with the node to put back. */
  private background: { scene: THREE.Scene; node: unknown } | null = null
  /**
   * `kit` enables registered TSL substitutes (see `setWebGPUSubstitute`); without it they hide.
   * `toScreen` tells whether the next render goes through the renderer's tone-mapping output pass.
   */
  constructor(
    readonly kit?: NodeKit,
    private readonly toScreen: () => boolean = () => false,
  ) {}
  /** Hide incompatible objects (or swap in their TSL substitute) before a frame; then {@link restore}. */
  apply(root: THREE.Object3D): void {
    this.depth++
    const found: THREE.Object3D[] = []
    const twinned: THREE.Mesh[] = []
    root.traverseVisible((object) => {
      const material = (object as THREE.Mesh).material as
        THREE.Material | THREE.Material[] | undefined
      if (!material) return
      const materials = Array.isArray(material) ? material : [material]
      if (materials.some(glslOnlyMaterial) || hasWebGPUSubstitute(object)) found.push(object)
      else if (this.kit && materials.some(hasWebGPUMaterialNodes))
        twinned.push(object as THREE.Mesh)
    })
    // Shared materials: one twin and one sync per material per frame.
    const synced = new Map<THREE.Material, THREE.Material>()
    const swap = (material: THREE.Material) => {
      let node = synced.get(material)
      if (node) return node
      const twin = webgpuMaterialTwin(material, this.kit!)
      twin?.sync()
      node = twin?.material ?? material
      synced.set(material, node)
      return node
    }
    for (const mesh of twinned) {
      if (this.swapped.has(mesh)) continue
      const original = mesh.material
      this.swapped.set(mesh, original)
      mesh.material = Array.isArray(original) ? original.map(swap) : swap(original)
    }
    for (const object of found) {
      const substitute = this.kit && webgpuSubstitute(object, this.kit)
      if (substitute?.material) {
        // Nested passes (shadow maps, mirrors) meet the mesh already swapped: keep it drawn.
        const mesh = object as THREE.Mesh
        if (this.swapped.has(mesh)) continue
        substitute.sync?.()
        this.swapped.set(mesh, mesh.material)
        mesh.material = substitute.material
        continue
      }
      if (substitute?.object && object.parent) {
        substitute.sync?.()
        const replacement = substitute.object
        replacement.position.copy(object.position)
        replacement.quaternion.copy(object.quaternion)
        replacement.scale.copy(object.scale)
        replacement.renderOrder = object.renderOrder
        object.parent.add(replacement)
        this.added.push(replacement)
      } else if (!substitute) {
        const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[]
        const materials = Array.isArray(material) ? material : [material]
        const glsl = materials.find(glslOnlyMaterial)
        if (!glsl) continue
        this.skipped.add(glsl.name || object.name || object.type)
      }
      if (!this.hidden.has(object)) this.hidden.set(object, object.visible)
      object.visible = false
    }
    if (this.depth === 1 && this.kit && this.toScreen()) this.matchWebGLToneMapping(root)
  }

  /**
   * WebGL tone-maps per material and clears to the background colour as is; WebGPU tone-maps the
   * whole frame in its output pass. For an on-screen frame, draw `toneMapped: false` materials
   * and a background colour through the inverse tone curve, so the output pass gives back what
   * WebGL shows. Render targets get no output pass in either backend and are left alone.
   */
  private matchWebGLToneMapping(root: THREE.Object3D): void {
    const kit = this.kit!
    const scene = root as THREE.Scene & { backgroundNode?: unknown }
    if (
      scene.isScene &&
      (scene.background as THREE.Color | null)?.isColor &&
      !scene.backgroundNode
    ) {
      const color = scene.background as THREE.Color
      let node = this.backgrounds.get(color)
      if (!node) {
        const tsl = kit.tsl
        node = tsl.vec4(decodeDisplay(tsl.sRGBTransferOETF(tsl.uniform(color)), tsl), 1)
        this.backgrounds.set(color, node)
      }
      this.background = { scene, node: scene.backgroundNode ?? null }
      scene.backgroundNode = node as never
    }
    const synced = new Map<THREE.Material, THREE.Material>()
    const display = (material: THREE.Material) => {
      if (material.toneMapped !== false || glslOnlyMaterial(material)) return material
      let node = synced.get(material)
      if (node) return node
      let twin = this.displayTwins.get(material)
      if (!twin) {
        twin = nodeMaterialTwin(kit, material, (target) => {
          const tsl = kit.tsl
          const node = target as THREE.Material & { outputNode: unknown }
          const base = (node.outputNode ?? tsl.output) as ReturnType<typeof tsl.vec4>
          node.outputNode = tsl.vec4(decodeDisplay(tsl.sRGBTransferOETF(base.rgb), tsl), base.a)
        })
        this.displayTwins.set(material, twin)
      }
      twin.sync()
      synced.set(material, twin.material)
      return twin.material
    }
    root.traverseVisible((object) => {
      const mesh = object as THREE.Mesh
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (!material) return
      const materials = Array.isArray(material) ? material : [material]
      if (!materials.some((m) => m.toneMapped === false && !glslOnlyMaterial(m))) return
      if (!this.swapped.has(mesh)) this.swapped.set(mesh, material)
      mesh.material = Array.isArray(material) ? material.map(display) : display(material)
    })
  }
  /** Give hidden objects back the visibility (and swapped meshes the material) their owner set. */
  restore(): void {
    if (this.depth > 0) this.depth--
    if (this.depth > 0) return
    if (this.background) {
      ;(this.background.scene as { backgroundNode?: unknown }).backgroundNode = this.background.node
      this.background = null
    }
    for (const [object, visible] of this.hidden) object.visible = visible
    this.hidden.clear()
    for (const [mesh, material] of this.swapped) mesh.material = material
    this.swapped.clear()
    for (const object of this.added) object.removeFromParent()
    this.added.length = 0
  }
}
