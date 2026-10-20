import type * as THREE from 'three'

/** `three/webgpu` and `three/tsl`, loaded only when the WebGPU backend starts. */
export interface NodeKit {
  webgpu: typeof import('three/webgpu')
  tsl: typeof import('three/tsl')
  /** The renderer was created with `logarithmicDepthBuffer` (custom depth writes must match). */
  logarithmicDepth?: boolean
  /** `three/addons/csm/CSMShadowNode.js`, for cascaded shadows under WebGPU (shadows.ts). */
  CSMShadowNode?: typeof import('three/addons/csm/CSMShadowNode.js').CSMShadowNode
}

/**
 * What the WebGPU backend draws in place of a GLSL-only object: a node `material` on the same
 * object, or a whole replacement `object` (e.g. a sprite cloud for `gl_PointSize` points) placed
 * at the original's transform. `sync` runs before each frame to copy state the owner changed
 * (opacity, texture, colours) from the GLSL original.
 */
export interface WebGPUSubstitute {
  material?: THREE.Material
  object?: THREE.Object3D
  sync?(): void
}

const factories = new WeakMap<THREE.Object3D, (kit: NodeKit) => WebGPUSubstitute>()
const built = new WeakMap<THREE.Object3D, WebGPUSubstitute>()

/**
 * Register a TSL equivalent for a GLSL-only object. WebGL never calls `factory`: the object keeps
 * drawing exactly as before. Under WebGPU it is built once, on the first frame that shows `object`.
 */
export function setWebGPUSubstitute(
  object: THREE.Object3D,
  factory: (kit: NodeKit) => WebGPUSubstitute,
): void {
  factories.set(object, factory)
  built.delete(object)
}

/** The built substitute of `object` for this kit, or undefined when it has none. */
export function webgpuSubstitute(
  object: THREE.Object3D,
  kit: NodeKit,
): WebGPUSubstitute | undefined {
  let substitute = built.get(object)
  if (substitute) return substitute
  const factory = factories.get(object)
  if (!factory) return undefined
  substitute = factory(kit)
  built.set(object, substitute)
  return substitute
}

export function hasWebGPUSubstitute(object: THREE.Object3D): boolean {
  return factories.has(object)
}

/** Keys never copied from the GLSL original onto its node twin (identity and GLSL hooks). */
const TWIN_SKIP = new Set([
  'id',
  'uuid',
  'type',
  'version',
  'onBeforeCompile',
  'customProgramCacheKey',
  'defines',
  '_listeners',
])

/**
 * A node material of the same kind as `source` (as three's own `NodeLibrary.fromMaterial` makes
 * it), with `build` adding the TSL equivalent of the GLSL patch. `sync` copies the original's
 * properties again (texture swaps, opacity, flags) and recompiles the twin when the original's
 * version moved (`needsUpdate`).
 */
export function nodeMaterialTwin(
  kit: NodeKit,
  source: THREE.Material,
  build: (twin: THREE.Material) => void,
): { material: THREE.Material; sync(): void } {
  const webgpu = kit.webgpu as unknown as Record<string, new () => THREE.Material>
  const Kind = webgpu[source.type.replace(/Material$/, 'NodeMaterial')]
  if (!Kind) throw new Error(`No node material for ${source.type}`)
  const twin = new Kind()
  const record = twin as unknown as Record<string, unknown>
  const copy = () => {
    for (const key in source)
      if (!TWIN_SKIP.has(key)) record[key] = (source as unknown as Record<string, unknown>)[key]
  }
  copy()
  build(twin)
  let version = source.version
  return {
    material: twin,
    sync() {
      copy()
      if (source.version !== version) {
        version = source.version
        twin.needsUpdate = true
      }
    },
  }
}

const materialNodes = new WeakMap<THREE.Material, (kit: NodeKit, twin: THREE.Material) => void>()
const materialTwins = new WeakMap<THREE.Material, { material: THREE.Material; sync(): void }>()

/**
 * Register the TSL equivalent of an `onBeforeCompile` patch on a built-in material. WebGL keeps
 * the GLSL patch; under WebGPU every mesh drawing `material` draws its node twin instead. Patches
 * chain: a later registration runs after the earlier ones on the same twin.
 */
export function addWebGPUMaterialNodes(
  material: THREE.Material,
  build: (kit: NodeKit, twin: THREE.Material) => void,
): void {
  const previous = materialNodes.get(material)
  materialNodes.set(
    material,
    previous
      ? (kit, twin) => {
          previous(kit, twin)
          build(kit, twin)
        }
      : build,
  )
  materialTwins.delete(material)
}

export function hasWebGPUMaterialNodes(material: THREE.Material): boolean {
  return materialNodes.has(material)
}

/** The node twin of a registered material, built on first use. */
export function webgpuMaterialTwin(
  material: THREE.Material,
  kit: NodeKit,
): { material: THREE.Material; sync(): void } | undefined {
  let twin = materialTwins.get(material)
  if (twin) return twin
  const build = materialNodes.get(material)
  if (!build) return undefined
  twin = nodeMaterialTwin(kit, material, (node) => build(kit, node))
  materialTwins.set(material, twin)
  material.addEventListener('dispose', () => twin!.material.dispose())
  return twin
}
