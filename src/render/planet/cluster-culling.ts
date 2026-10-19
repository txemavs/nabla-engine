import * as THREE from 'three'

/**
 * Sub-tile cluster culling for planet tile meshes (terrain, photo drape, buildings).
 *
 * At install a mesh's triangles are reordered into an N×N grid of clusters over its local XZ
 * bounds (serpentine row order, so neighbouring clusters stay adjacent in the buffer), and each
 * cluster keeps its local bounding box. Before each draw, for whatever camera draws it (main view,
 * mirror, or shadow camera), the mesh narrows `geometry.drawRange` to the one contiguous span
 * that covers every cluster inside that camera's frustum, and restores it right after the draw, so
 * raycasts and other passes still see the whole mesh. The triangle set never changes, only which
 * part of the buffer one draw call covers: same picture, fewer triangles off screen, no extra draw
 * calls. Works with `WebGLRenderer` (onBeforeRender / onBeforeShadow) and the WebGPU renderer (which
 * calls onBeforeRender for every pass, shadows included).
 *
 * Off by default; see {@link setTileClusterCulling}.
 */

/** Grid size per side: 8 → 64 clusters per tile mesh. */
export const TILE_CLUSTER_GRID = 8
/** Meshes smaller than this keep a single draw range; the per-draw test would cost more than it saves. */
export const TILE_CLUSTER_MIN_TRIANGLES = 4096

let enabled = false
/** Meshes already handled: their cluster table, or null when they were left as they are. */
const tried = new WeakMap<THREE.Object3D, TileClusters | null>()

/** Whether {@link installTileClusterCulling} already ran on this mesh (successfully or not). */
export function tileClustersTried(mesh: THREE.Object3D): boolean {
  return tried.has(mesh)
}

/** The cluster table of a mesh prepared by {@link installTileClusterCulling}. */
export function tileClustersOf(mesh: THREE.Object3D): TileClusters | undefined {
  return tried.get(mesh) ?? undefined
}

/** Opt in or out for tile meshes installed from now on (`?clusterCulling=1`, see {@link parseClusterCulling}). */
export function setTileClusterCulling(on: boolean): void {
  enabled = on
}

/** `?clusterCulling=1|true|on` opts in; anything else (or no parameter) keeps it off. */
export function parseClusterCulling(search: string): boolean {
  const value = new URLSearchParams(search).get('clusterCulling')
  return value !== null && ['', '1', 'true', 'on'].includes(value.toLowerCase())
}

export function tileClusterCullingEnabled(): boolean {
  return enabled
}

/** Per-mesh cluster table, in draw-range units (indices when indexed, vertices otherwise). */
export interface TileClusters {
  /** First draw-range element of cluster i (clusters are contiguous in draw order). */
  starts: Uint32Array
  /** Draw-range element count of cluster i; zero for empty clusters. */
  counts: Uint32Array
  /** Local-space bounds of cluster i, 6 floats each: min xyz, max xyz. */
  bounds: Float32Array
  /** Total draw-range elements of the reordered geometry. */
  total: number
}

/** Cluster index, in serpentine order, of each triangle; triangles given by their centroid x/z. */
function clusterOf(x: number, z: number, box: THREE.Box3, grid: number): number {
  const sx = box.max.x - box.min.x || 1
  const sz = box.max.z - box.min.z || 1
  const cx = Math.min(grid - 1, Math.max(0, Math.floor(((x - box.min.x) / sx) * grid)))
  const cz = Math.min(grid - 1, Math.max(0, Math.floor(((z - box.min.z) / sz) * grid)))
  return cz * grid + (cz % 2 === 0 ? cx : grid - 1 - cx)
}

/**
 * Reorder a geometry's triangles by cluster and return its cluster table. New index or attribute
 * arrays replace the old ones on the geometry; arrays already shared elsewhere (collision, caches)
 * are never mutated. Returns undefined for geometries that are not plain triangle lists.
 */
export function buildTileClusters(
  geometry: THREE.BufferGeometry,
  grid = TILE_CLUSTER_GRID,
): TileClusters | undefined {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  const interleaved = Object.values(geometry.attributes).some(
    (attribute) =>
      (attribute as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute,
  )
  if (!position || interleaved) return undefined
  const index = geometry.index
  const elements = index ? index.count : position.count
  const triangles = Math.floor(elements / 3)
  if (triangles < TILE_CLUSTER_MIN_TRIANGLES || elements % 3 !== 0) return undefined
  if (geometry.groups.length > 1) return undefined
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  const clusters = grid * grid
  const vertexOf = (corner: number) => (index ? index.getX(corner) : corner)
  const cluster = new Uint16Array(triangles)
  const counts = new Uint32Array(clusters)
  const bounds = new Float32Array(clusters * 6)
  for (let c = 0; c < clusters; c++) {
    bounds.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], c * 6)
  }
  for (let t = 0; t < triangles; t++) {
    let x = 0,
      z = 0
    for (let k = 0; k < 3; k++) {
      const v = vertexOf(t * 3 + k)
      x += position.getX(v)
      z += position.getZ(v)
    }
    const c = clusterOf(x / 3, z / 3, box, grid)
    cluster[t] = c
    counts[c] += 3
    const o = c * 6
    for (let k = 0; k < 3; k++) {
      const v = vertexOf(t * 3 + k)
      const px = position.getX(v),
        py = position.getY(v),
        pz = position.getZ(v)
      if (px < bounds[o]) bounds[o] = px
      if (py < bounds[o + 1]) bounds[o + 1] = py
      if (pz < bounds[o + 2]) bounds[o + 2] = pz
      if (px > bounds[o + 3]) bounds[o + 3] = px
      if (py > bounds[o + 4]) bounds[o + 4] = py
      if (pz > bounds[o + 5]) bounds[o + 5] = pz
    }
  }
  const starts = new Uint32Array(clusters)
  for (let c = 1; c < clusters; c++) starts[c] = starts[c - 1] + counts[c - 1]
  const cursor = starts.slice()
  if (index) {
    const source = index.array
    const reordered = new (source.constructor as Uint32ArrayConstructor)(elements)
    for (let t = 0; t < triangles; t++) {
      const at = cursor[cluster[t]]
      reordered[at] = source[t * 3]
      reordered[at + 1] = source[t * 3 + 1]
      reordered[at + 2] = source[t * 3 + 2]
      cursor[cluster[t]] += 3
    }
    geometry.setIndex(new THREE.BufferAttribute(reordered, 1))
  } else {
    // Non-indexed triangle list: move whole triangles (all attributes) to their cluster's span.
    const order = new Uint32Array(triangles)
    for (let t = 0; t < triangles; t++) {
      order[cursor[cluster[t]] / 3] = t
      cursor[cluster[t]] += 3
    }
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const source = attribute as THREE.BufferAttribute
      const size = source.itemSize
      const from = source.array
      const to = new (from.constructor as Float32ArrayConstructor)(from.length)
      for (let n = 0; n < triangles; n++) {
        const t = order[n]
        to.set(from.subarray(t * 3 * size, (t + 1) * 3 * size), n * 3 * size)
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(to, size, source.normalized))
    }
  }
  return { starts, counts, bounds, total: elements }
}

const frustum = new THREE.Frustum()
const matrix = new THREE.Matrix4()
const box = new THREE.Box3()

/** First/last visible cluster span for a camera, in draw-range units: [start, count]. */
export function visibleClusterSpan(
  clusters: TileClusters,
  object: THREE.Object3D,
  camera: THREE.Camera,
): [number, number] {
  matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  matrix.multiply(object.matrixWorld)
  frustum.setFromProjectionMatrix(
    matrix,
    camera.coordinateSystem,
    (camera as { reversedDepth?: boolean }).reversedDepth ?? false,
  )
  let first = -1,
    last = -1
  const { counts, bounds, starts } = clusters
  for (let c = 0; c < counts.length; c++) {
    if (!counts[c]) continue
    const o = c * 6
    box.min.set(bounds[o], bounds[o + 1], bounds[o + 2])
    box.max.set(bounds[o + 3], bounds[o + 4], bounds[o + 5])
    if (!frustum.intersectsBox(box)) continue
    if (first < 0) first = c
    last = c
  }
  if (first < 0) return [0, 0]
  return [starts[first], starts[last] + counts[last] - starts[first]]
}

/**
 * Reorder a tile mesh into clusters and narrow its draw range per camera. Returns false when the
 * mesh is unsuitable (too small, interleaved, multi-group) and was left untouched.
 */
export function installTileClusterCulling(mesh: THREE.Mesh): boolean {
  if (tried.has(mesh)) return !!tried.get(mesh)
  const clusters = buildTileClusters(mesh.geometry) ?? null
  tried.set(mesh, clusters)
  if (!clusters) return false
  const range = mesh.geometry.drawRange
  let saved: [number, number] | null = null
  const narrow = (camera: THREE.Camera) => {
    if (saved) return
    saved = [range.start, range.count]
    const [start, count] = visibleClusterSpan(clusters, mesh, camera)
    const end = Math.min(range.start + range.count, start + count)
    range.start = Math.max(range.start, start)
    range.count = Math.max(0, end - range.start)
  }
  const restore = () => {
    if (!saved) return
    ;[range.start, range.count] = saved
    saved = null
  }
  const beforeRender = mesh.onBeforeRender
  const afterRender = mesh.onAfterRender
  const beforeShadow = mesh.onBeforeShadow
  const afterShadow = mesh.onAfterShadow
  mesh.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
    beforeRender.call(this, renderer, scene, camera, geometry, material, group)
    narrow(camera)
  }
  mesh.onAfterRender = function (renderer, scene, camera, geometry, material, group) {
    restore()
    afterRender.call(this, renderer, scene, camera, geometry, material, group)
  }
  mesh.onBeforeShadow = function (
    renderer,
    object,
    camera,
    shadowCamera,
    geometry,
    material,
    group,
  ) {
    beforeShadow.call(this, renderer, object, camera, shadowCamera, geometry, material, group)
    narrow(shadowCamera)
  }
  mesh.onAfterShadow = function (
    renderer,
    object,
    camera,
    shadowCamera,
    geometry,
    material,
    group,
  ) {
    restore()
    afterShadow.call(this, renderer, object, camera, shadowCamera, geometry, material, group)
  }
  return true
}

/** Planet tile meshes worth clustering: terrain, photo drapes and buildings. */
export function isClusterableTileMesh(object: THREE.Object3D): object is THREE.Mesh {
  const mesh = object as THREE.Mesh
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return false
  const category = mesh.userData?.category
  return mesh.name === 'Drape' || category === 'Terrain' || category === 'Buildings'
}
