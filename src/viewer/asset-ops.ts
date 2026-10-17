import * as THREE from 'three'

/**
 * Pure scene-graph helpers behind the geographic viewer's asset-editing calls.
 *
 * Everything here works on a plain `THREE.Object3D` (the glTF scene of one loaded asset), needs no
 * renderer and no DOM, and does no work unless the host calls it. The viewer's frame loop never
 * touches this module.
 */

/** What `getNodes` reports for one node of a loaded GLB (the glTF scene root itself is excluded). */
export interface ViewerNodeInfo {
  /** glTF node name as THREE's GLTFLoader exposes it (spaces become `_`, a few characters are dropped). */
  name: string
  /** The node's name exactly as written in the GLB, when the loader changed it. */
  sourceName?: string
  /** Names from the first node under the glTF scene down to this node, joined by `/`. */
  path: string
  kind: 'mesh' | 'group'
  /** The node's own `visible` flag (a hidden ancestor also hides it, whatever this says). */
  visible: boolean
  depth: number
  children: number
  /** Meshes only. */
  hasUv?: boolean
  /** Meshes only: vertex count of the geometry. */
  vertices?: number
  /** Meshes only: triangle count of the geometry. */
  triangles?: number
  /** glTF `extras` of the node, as loaded. */
  extras?: Record<string, unknown>
}

export interface NodeSelectorSpec {
  /** Exact string, or a RegExp tested against the node name (and the source name, if it differs). */
  name?: string | RegExp
  /** Exact string, or a RegExp tested against the `/` path (see `ViewerNodeInfo.path`). */
  path?: string | RegExp
  kind?: 'mesh' | 'group'
  /** Every listed key must equal the node's glTF `extras` value (strict equality). */
  extras?: Record<string, unknown>
}

/**
 * Picks nodes of a loaded GLB. A string is an exact node name, a RegExp is tested against the name,
 * an object combines several criteria (all must match), a function receives the node info.
 * The match covers the node itself; operations that need meshes also cover the node's descendants.
 */
export type NodeSelector = string | RegExp | NodeSelectorSpec | ((node: ViewerNodeInfo) => boolean)

export interface NodeSurfaceImageOptions {
  /** Default false: glTF UVs have v=0 at the top row. Set true for canvases drawn bottom-up. */
  flipY?: boolean
  /** Default `'srgb'`. */
  colorSpace?: 'srgb' | 'linear'
  /** Default 8, capped by the GPU. */
  anisotropy?: number
}

function matchText(rule: string | RegExp | undefined, value: string): boolean {
  if (rule === undefined) return true
  if (typeof rule === 'string') return value === rule
  rule.lastIndex = 0 // a global/sticky RegExp must not carry state between nodes
  return rule.test(value)
}

function matchName(rule: string | RegExp | undefined, info: ViewerNodeInfo): boolean {
  return (
    matchText(rule, info.name) ||
    (info.sourceName !== undefined && matchText(rule, info.sourceName))
  )
}

function nodeExtras(node: THREE.Object3D): Record<string, unknown> | undefined {
  const extras = node.userData
  return extras && Object.keys(extras).length ? (extras as Record<string, unknown>) : undefined
}

/** Describe `node` for a selector or for `getNodes`; `path`/`depth` come from the walk. */
function describe(node: THREE.Object3D, path: string, depth: number): ViewerNodeInfo {
  const info: ViewerNodeInfo = {
    name: node.name,
    path,
    kind: node instanceof THREE.Mesh ? 'mesh' : 'group',
    visible: node.visible,
    depth,
    children: node.children.length,
  }
  if (node instanceof THREE.Mesh) {
    const geometry = node.geometry as THREE.BufferGeometry
    info.hasUv = Boolean(geometry.getAttribute('uv'))
    const position = geometry.getAttribute('position')
    info.vertices = position?.count ?? 0
    info.triangles = geometry.index
      ? Math.floor(geometry.index.count / 3)
      : Math.floor((position?.count ?? 0) / 3)
  }
  const extras = nodeExtras(node)
  if (extras) info.extras = extras
  const source = extras?.name
  if (typeof source === 'string' && source !== node.name) info.sourceName = source
  return info
}

/** Depth-first walk of the descendants of `root` (excluding `root`), parents before children. */
export function walkNodes(
  root: THREE.Object3D,
  visit: (node: THREE.Object3D, info: ViewerNodeInfo) => void,
): void {
  const walk = (parent: THREE.Object3D, prefix: string, depth: number) => {
    for (const child of parent.children) {
      const path = prefix ? `${prefix}/${child.name}` : child.name
      visit(child, describe(child, path, depth))
      walk(child, path, depth + 1)
    }
  }
  walk(root, '', 0)
}

export function listNodes(root: THREE.Object3D): ViewerNodeInfo[] {
  const nodes: ViewerNodeInfo[] = []
  walkNodes(root, (_node, info) => nodes.push(info))
  return nodes
}

export function selectorMatches(selector: NodeSelector, info: ViewerNodeInfo): boolean {
  if (typeof selector === 'string' || selector instanceof RegExp) return matchName(selector, info)
  if (typeof selector === 'function') return Boolean(selector(info))
  if (selector.kind !== undefined && selector.kind !== info.kind) return false
  if (!matchName(selector.name, info) || !matchText(selector.path, info.path)) return false
  if (selector.extras)
    for (const [key, value] of Object.entries(selector.extras))
      if (info.extras?.[key] !== value) return false
  return true
}

export function validateSelector(selector: NodeSelector) {
  if (selector === undefined || selector === null) throw new Error('Node selector required')
  if (
    typeof selector === 'object' &&
    !(selector instanceof RegExp) &&
    selector.name === undefined &&
    selector.path === undefined &&
    selector.kind === undefined &&
    selector.extras === undefined
  )
    throw new Error('Node selector matches nothing: give a name, path, kind or extras')
}

/** Nodes (not descendants) matched by `selector`. */
export function matchNodes(root: THREE.Object3D, selector: NodeSelector): THREE.Object3D[] {
  validateSelector(selector)
  const matches: THREE.Object3D[] = []
  walkNodes(root, (node, info) => {
    if (selectorMatches(selector, info)) matches.push(node)
  })
  return matches
}

/** Show or hide matched nodes; returns how many nodes matched (0 when nothing did). */
export function setNodesVisible(
  root: THREE.Object3D,
  selector: NodeSelector,
  visible: boolean,
): number {
  const matches = matchNodes(root, selector)
  for (const node of matches) node.visible = visible
  return matches.length
}

/** Meshes at or under the matched nodes, each once. With no selector: every mesh under `root`. */
export function meshesUnder(root: THREE.Object3D, selector?: NodeSelector): THREE.Mesh[] {
  const meshes = new Set<THREE.Mesh>()
  const collect = (node: THREE.Object3D) =>
    node.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.add(object)
    })
  if (selector === undefined) collect(root)
  else for (const node of matchNodes(root, selector)) collect(node)
  return [...meshes]
}

/** True when the object and every ancestor up to (excluding) `stop` have `visible` set. */
export function visibleThrough(object: THREE.Object3D, stop: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node && node !== stop; node = node.parent)
    if (!node.visible) return false
  return true
}

const baseState = new WeakMap<
  THREE.Material,
  { transparent: boolean; opacity: number; depthWrite: boolean }
>()

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

/** A cloned material starts from the same un-faded state as its source. */
function inheritBase(from: THREE.Material, to: THREE.Material) {
  const base = baseState.get(from)
  if (base) baseState.set(to, base)
}

/**
 * Fade every material under `root` to `opacity` (0..1), multiplying the material's own opacity.
 * 1 restores the loaded state exactly. A faded material is transparent with depth writes off, so
 * overlapping faded surfaces can sort imperfectly.
 */
export function applyOpacity(root: THREE.Object3D, opacity: number) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    for (const material of materialsOf(object)) {
      let base = baseState.get(material)
      if (!base) {
        if (opacity === 1) continue
        base = {
          transparent: material.transparent,
          opacity: material.opacity,
          depthWrite: material.depthWrite,
        }
        baseState.set(material, base)
      }
      const transparent = opacity < 1 ? true : base.transparent
      if (material.transparent !== transparent) material.needsUpdate = true
      material.transparent = transparent
      material.opacity = base.opacity * opacity
      material.depthWrite = opacity < 1 ? false : base.depthWrite
    }
  })
}

interface MeshOverride {
  original: THREE.Material | THREE.Material[]
  clones: THREE.Material[]
  texture: THREE.CanvasTexture
}

/**
 * Per-mesh surface-image overrides for one asset. Materials are cloned, never edited, so
 * `clear` always restores the loaded material. One texture is shared by the meshes of one call and
 * is disposed when the last mesh using it is restored.
 */
export class SurfaceImages {
  private readonly overrides = new Map<THREE.Mesh, MeshOverride>()

  get size() {
    return this.overrides.size
  }

  /** Restore one mesh; returns whether it had an override. */
  private restore(mesh: THREE.Mesh): boolean {
    const override = this.overrides.get(mesh)
    if (!override) return false
    mesh.material = override.original
    for (const material of override.clones) material.dispose()
    this.overrides.delete(mesh)
    for (const other of this.overrides.values()) if (other.texture === override.texture) return true
    override.texture.dispose()
    return true
  }

  /** Restore these meshes, or every overridden mesh when `meshes` is omitted. */
  clear(meshes?: Iterable<THREE.Mesh>): number {
    let restored = 0
    for (const mesh of [...(meshes ?? this.overrides.keys())]) if (this.restore(mesh)) restored++
    return restored
  }

  /**
   * Drape `image` over the given meshes that have UVs (replacing any earlier override on them) and
   * return how many meshes were changed. Meshes without UVs are skipped untouched.
   */
  set(
    meshes: Iterable<THREE.Mesh>,
    image: HTMLCanvasElement,
    options: NodeSurfaceImageOptions & { maxAnisotropy?: number } = {},
  ): number {
    const targets = [...meshes].filter((mesh) => mesh.geometry.getAttribute('uv'))
    if (!targets.length) return 0
    this.clear(targets)
    const texture = new THREE.CanvasTexture(image)
    texture.flipY = options.flipY ?? false
    texture.colorSpace = options.colorSpace === 'linear' ? THREE.NoColorSpace : THREE.SRGBColorSpace
    texture.anisotropy = Math.min(options.anisotropy ?? 8, options.maxAnisotropy ?? 8)
    for (const mesh of targets) {
      const original = mesh.material
      const clones = (Array.isArray(original) ? original : [original]).map((material) => {
        const copy = material.clone()
        inheritBase(material, copy)
        if ('map' in copy) {
          ;(copy as THREE.MeshStandardMaterial).map = texture
          if ('color' in copy) (copy as THREE.MeshStandardMaterial).color.set(0xffffff)
          copy.needsUpdate = true
        }
        return copy
      })
      mesh.material = Array.isArray(original) ? clones : clones[0]
      this.overrides.set(mesh, { original, clones, texture })
    }
    return targets.length
  }

  dispose() {
    this.clear()
  }
}
