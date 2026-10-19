import type * as THREE from 'three'

/** `three/webgpu` and `three/tsl`, loaded only when the WebGPU backend starts. */
export interface NodeKit {
  webgpu: typeof import('three/webgpu')
  tsl: typeof import('three/tsl')
  /** The renderer was created with `logarithmicDepthBuffer` (custom depth writes must match). */
  logarithmicDepth?: boolean
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
