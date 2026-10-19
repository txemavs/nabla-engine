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

/** Index arrays a tile geometry may use. */
export type ClusterIndexArray = Uint8Array | Uint16Array | Uint32Array
/** Any typed array a vertex attribute may hold. */
export type ClusterAttributeArray = Exclude<THREE.TypedArray, BigInt64Array | BigUint64Array>

/**
 * Plain-array input of {@link computeTileClusters}: everything it reads, nothing from three.js, so
 * the same function runs on the main thread or in a loading worker.
 */
export interface TileClusterInput {
  /** Vertex positions, packed xyz (already denormalized). */
  positions: Float32Array | Float64Array
  /** Index of an indexed geometry. */
  index?: ClusterIndexArray
  /** Every attribute of a non-indexed geometry (positions included), moved whole triangles at a time. */
  attributes?: { name: string; array: ClusterAttributeArray; itemSize: number }[]
  /** Geometry bounding box: min xyz, max xyz. */
  box: [number, number, number, number, number, number]
  grid: number
}

/** Result of {@link computeTileClusters}: the table plus the reordered arrays (new arrays, inputs untouched). */
export interface TileClusterOutput {
  clusters: TileClusters
  index?: ClusterIndexArray
  attributes?: { name: string; array: ClusterAttributeArray }[]
}

/** Reorder triangles by cluster. Pure: never mutates its input arrays. */
export function computeTileClusters(input: TileClusterInput): TileClusterOutput {
  const { positions, index, grid } = input
  const box = new THREE.Box3(
    new THREE.Vector3(input.box[0], input.box[1], input.box[2]),
    new THREE.Vector3(input.box[3], input.box[4], input.box[5]),
  )
  const elements = index ? index.length : positions.length / 3
  const triangles = Math.floor(elements / 3)
  const clusters = grid * grid
  const vertexOf = (corner: number) => (index ? index[corner] : corner)
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
      x += positions[v * 3]
      z += positions[v * 3 + 2]
    }
    const c = clusterOf(x / 3, z / 3, box, grid)
    cluster[t] = c
    counts[c] += 3
    const o = c * 6
    for (let k = 0; k < 3; k++) {
      const v = vertexOf(t * 3 + k)
      const px = positions[v * 3],
        py = positions[v * 3 + 1],
        pz = positions[v * 3 + 2]
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
  const table = { starts, counts, bounds, total: elements }
  if (index) {
    const reordered = new (index.constructor as Uint32ArrayConstructor)(elements)
    for (let t = 0; t < triangles; t++) {
      const at = cursor[cluster[t]]
      reordered[at] = index[t * 3]
      reordered[at + 1] = index[t * 3 + 1]
      reordered[at + 2] = index[t * 3 + 2]
      cursor[cluster[t]] += 3
    }
    return { clusters: table, index: reordered }
  }
  // Non-indexed triangle list: move whole triangles (all attributes) to their cluster's span.
  const order = new Uint32Array(triangles)
  for (let t = 0; t < triangles; t++) {
    order[cursor[cluster[t]] / 3] = t
    cursor[cluster[t]] += 3
  }
  const attributes = (input.attributes ?? []).map(({ name, array: from, itemSize: size }) => {
    const to = new (from.constructor as Float32ArrayConstructor)(from.length)
    for (let n = 0; n < triangles; n++) {
      const t = order[n]
      to.set(from.subarray(t * 3 * size, (t + 1) * 3 * size), n * 3 * size)
    }
    return { name, array: to as ClusterAttributeArray }
  })
  return { clusters: table, attributes }
}

/**
 * Read a geometry into a {@link TileClusterInput}, or undefined when it is not a plain triangle
 * list worth clustering. With `copy`, arrays are copies safe to transfer to a worker.
 */
export function tileClusterInput(
  geometry: THREE.BufferGeometry,
  grid = TILE_CLUSTER_GRID,
  copy = false,
): TileClusterInput | undefined {
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
  const b = geometry.boundingBox!
  // Same values `position.getX/Y/Z` returns; the raw array when it already is packed xyz floats.
  let positions: Float32Array | Float64Array
  if (position.array instanceof Float32Array && position.itemSize === 3 && !position.normalized)
    positions = copy ? position.array.slice() : position.array
  else {
    positions = new Float64Array(position.count * 3)
    for (let v = 0; v < position.count; v++) {
      positions[v * 3] = position.getX(v)
      positions[v * 3 + 1] = position.getY(v)
      positions[v * 3 + 2] = position.getZ(v)
    }
  }
  const array = <T extends ClusterAttributeArray>(a: T): T => (copy ? (a.slice() as T) : a)
  return {
    positions,
    ...(index
      ? { index: array(index.array as ClusterIndexArray) }
      : {
          attributes: Object.entries(geometry.attributes).map(([name, attribute]) => ({
            name,
            array: array((attribute as THREE.BufferAttribute).array as ClusterAttributeArray),
            itemSize: attribute.itemSize,
          })),
        }),
    box: [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z],
    grid,
  }
}

/**
 * Put the reordered arrays of a {@link computeTileClusters} result on the geometry. The renderer's
 * copies of the old buffers are freed first (otherwise they stay in GPU memory until the tile is
 * removed); the reordered buffers upload on the next draw. Normalization is kept per attribute.
 */
export function applyTileClusters(
  geometry: THREE.BufferGeometry,
  output: TileClusterOutput,
): TileClusters {
  geometry.dispose()
  if (output.index) geometry.setIndex(new THREE.BufferAttribute(output.index, 1))
  for (const { name, array } of output.attributes ?? []) {
    const source = geometry.getAttribute(name) as THREE.BufferAttribute
    geometry.setAttribute(
      name,
      new THREE.BufferAttribute(array, source.itemSize, source.normalized),
    )
  }
  return output.clusters
}

/**
 * Reorder a geometry's triangles by cluster and return its cluster table. New index or attribute
 * arrays replace the old ones on the geometry (whose renderer buffers are disposed); arrays already shared elsewhere (collision, caches)
 * are never mutated. Returns undefined for geometries that are not plain triangle lists.
 */
export function buildTileClusters(
  geometry: THREE.BufferGeometry,
  grid = TILE_CLUSTER_GRID,
): TileClusters | undefined {
  const input = tileClusterInput(geometry, grid)
  return input && applyTileClusters(geometry, computeTileClusters(input))
}

/** Runs {@link computeTileClusters} somewhere else (a loading worker). */
export type TileClusterRunner = (input: TileClusterInput) => Promise<TileClusterOutput>

/**
 * {@link buildTileClusters} with the reorder done by `run` (a worker). The geometry is left alone when `keep()` is false or
 * if its index or attributes changed while the job ran.
 */
export async function buildTileClustersWith(
  geometry: THREE.BufferGeometry,
  run: TileClusterRunner,
  grid = TILE_CLUSTER_GRID,
  keep: () => boolean = () => true,
): Promise<TileClusters | undefined> {
  const input = tileClusterInput(geometry, grid, true)
  if (!input) return undefined
  const index = geometry.index
  const attributes = { ...geometry.attributes }
  const output = await run(input)
  const same =
    geometry.index === index &&
    Object.keys(attributes).length === Object.keys(geometry.attributes).length &&
    Object.entries(attributes).every(([name, a]) => geometry.attributes[name] === a)
  return same && keep() ? applyTileClusters(geometry, output) : undefined
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
  narrowPerCamera(mesh, clusters)
  return true
}

/**
 * {@link installTileClusterCulling} with the reorder done off the main thread by `run`. The mesh
 * counts as tried right away (so it is not queued twice) and draws in full until the job lands.
 */
export async function installTileClusterCullingWith(
  mesh: THREE.Mesh,
  run: TileClusterRunner,
): Promise<boolean> {
  if (tried.has(mesh)) return !!tried.get(mesh)
  tried.set(mesh, null)
  const clusters =
    (await buildTileClustersWith(mesh.geometry, run, TILE_CLUSTER_GRID, () => !!mesh.parent).catch(
      () => undefined,
    )) ?? null
  tried.set(mesh, clusters)
  if (!clusters) return false
  narrowPerCamera(mesh, clusters)
  return true
}

function narrowPerCamera(mesh: THREE.Mesh, clusters: TileClusters): void {
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
}

/** Planet tile meshes worth clustering: terrain, photo drapes and buildings. */
export function isClusterableTileMesh(object: THREE.Object3D): object is THREE.Mesh {
  const mesh = object as THREE.Mesh
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return false
  const category = mesh.userData?.category
  return mesh.name === 'Drape' || category === 'Terrain' || category === 'Buildings'
}
