import * as THREE from 'three'
import type { Transform, Vec3Tuple } from '../../entity/schema.js'

/** Most shot marks kept alive at once; the oldest is recycled past this. */
export const MAX_IMPACT_MARKS = 96
/** Distance a mark stands off the hit surface along its normal, metres (keeps it out of z-fighting). */
export const IMPACT_MARK_STANDOFF = 0.003
/** Radius of the opaque bullet hole, metres. */
export const IMPACT_MARK_HOLE_RADIUS = 0.01
/** Outer radius of the mark (hole plus scorch, fading to fully transparent), metres. */
export const IMPACT_MARK_RADIUS = 0.02125
/** Side of the generated square mark texture, texels. */
export const IMPACT_MARK_TEXTURE_SIZE = 64
/** Peak opacity of the dark scorch just outside the hole; it fades to 0 at the rim. */
const SCORCH_ALPHA = 0.55
/** Width of the anti-aliased hole edge, as a fraction of the mark radius. */
const HOLE_EDGE = 0.06
/** Hole and scorch colours (sRGB 0–255). Dark everywhere, also under alpha 0, so texture
 * filtering and mipmaps never bleed a light fringe. */
const HOLE_RGB = [10, 10, 10] as const
const SCORCH_RGB = [22, 18, 14] as const

/** Random size of one mark, 0.8–1.25× (bullets do not leave identical holes). */
function markScale(): number {
  return 0.8 + Math.random() * 0.45
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * RGBA texels of a shot mark: an opaque near-black hole with a soft dark scorch that fades
 * to alpha 0 at the rim. No light pixels anywhere, so it only darkens the surface it sits on
 * (light ground or dark walls alike). Row-major, `size × size × 4`.
 */
export function impactMarkPixels(size = IMPACT_MARK_TEXTURE_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4)
  const hole = IMPACT_MARK_HOLE_RADIUS / IMPACT_MARK_RADIUS
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      // Texel centre in [-1, 1]; r = 1 is the mark rim.
      const u = ((x + 0.5) / size) * 2 - 1,
        v = ((y + 0.5) / size) * 2 - 1
      const r = Math.hypot(u, v)
      const inHole = 1 - smoothstep(hole - HOLE_EDGE / 2, hole + HOLE_EDGE / 2, r)
      const fade = 1 - smoothstep(hole, 1, r)
      const scorch = SCORCH_ALPHA * fade * fade
      const alpha = inHole + (1 - inHole) * scorch
      const at = (y * size + x) * 4
      for (let c = 0; c < 3; c++)
        data[at + c] = Math.round(HOLE_RGB[c] * inHole + SCORCH_RGB[c] * (1 - inHole))
      data[at + 3] = r >= 1 ? 0 : Math.round(255 * Math.min(1, alpha))
    }
  return data
}

/** Shot mark texture (see {@link impactMarkPixels}), mipmapped so far marks stay soft. */
export function impactMarkTexture(size = IMPACT_MARK_TEXTURE_SIZE): THREE.DataTexture {
  const texture = new THREE.DataTexture(impactMarkPixels(size), size, size)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

/** One batch: the marks of one parent (a vehicle, a prop, or the static world root). */
type MarkBatch = {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  /** Marks by instance index (`count` of them). */
  readonly marks: Mark[]
  parent: THREE.Object3D | null
}
type Mark = { batch: MarkBatch; index: number }

const scratch = new THREE.Object3D()
const inverse = new THREE.Matrix4()
const zAxis = new THREE.Vector3(0, 0, 1)

/**
 * Bounded shot marks, one instanced draw per parent instead of one mesh per mark. Entity hits
 * go into a batch parented to the hit object, with each mark's matrix in that object's local
 * frame, so marks on a moving car ride with it at no per-frame cost (three composes the car's
 * world matrix with the instance matrices on the GPU). World hits (buildings and other static
 * colliders without an entity id) share one batch under a scene root that has the
 * floating-origin shift. The instance matrices are the exact local matrices the former
 * per-mark groups had.
 */
export class ImpactMarks {
  private readonly geom = new THREE.PlaneGeometry(IMPACT_MARK_RADIUS * 2, IMPACT_MARK_RADIUS * 2)
  private readonly texture = impactMarkTexture()
  /**
   * One alpha-blended quad per mark: hole and scorch come from the texture, the surround is
   * transparent. No depth write (marks never occlude each other or the surface), and a
   * polygon offset on top of the standoff keeps them out of z-fighting.
   */
  private readonly material = new THREE.MeshBasicMaterial({
    map: this.texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  /** Live marks, oldest first. */
  private marks: Mark[] = []
  private readonly batches = new Map<THREE.Object3D, MarkBatch>()
  private readonly spare: MarkBatch[] = []
  private limit = MAX_IMPACT_MARKS
  setLimit(limit: number): void {
    this.limit = Number.isFinite(limit)
      ? Math.max(0, Math.min(MAX_IMPACT_MARKS, Math.floor(limit)))
      : MAX_IMPACT_MARKS
    while (this.marks.length > this.limit) this.remove(this.marks[0])
  }
  get count(): number {
    return this.marks.length
  }
  /** Instanced draws currently holding marks (one per parent with marks). */
  get batchCount(): number {
    return this.batches.size
  }

  /** Shared GPU resources (the instanced program), without creating a live impact. */
  warmupObject(): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geom, this.material, 1)
    mesh.renderOrder = 2
    return mesh
  }

  /** Local matrices of the marks under `parent`, in instance order (tests and tools). */
  matricesFor(parent: THREE.Object3D): THREE.Matrix4[] {
    const batch = this.batches.get(parent)
    if (!batch) return []
    return batch.marks.map((_, i) => {
      const m = new THREE.Matrix4()
      batch.mesh.getMatrixAt(i, m)
      return m
    })
  }

  private batchFor(parent: THREE.Object3D): MarkBatch {
    let batch = this.batches.get(parent)
    if (batch) return batch
    batch = this.spare.pop()
    if (!batch) {
      const mesh = new THREE.InstancedMesh(this.geom, this.material, MAX_IMPACT_MARKS)
      mesh.name = 'shot-impacts'
      mesh.renderOrder = 2
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      batch = { mesh, marks: [], parent: null }
    }
    batch.mesh.count = 0
    batch.parent = parent
    parent.add(batch.mesh)
    this.batches.set(parent, batch)
    return batch
  }

  private release(batch: MarkBatch): void {
    batch.mesh.removeFromParent()
    if (batch.parent) this.batches.delete(batch.parent)
    batch.parent = null
    batch.marks.length = 0
    batch.mesh.count = 0
    this.spare.push(batch)
  }

  private touched(batch: MarkBatch, index: number): void {
    batch.mesh.instanceMatrix.addUpdateRange(index * 16, 16)
    batch.mesh.instanceMatrix.needsUpdate = true
    // Recomputed lazily by three for culling and sorting.
    batch.mesh.boundingSphere = null
    batch.mesh.boundingBox = null
  }

  /** Drop one mark: the batch's last instance moves into its slot. */
  private remove(mark: Mark): void {
    const at = this.marks.indexOf(mark)
    if (at >= 0) this.marks.splice(at, 1)
    const { batch, index } = mark
    const last = batch.marks.length - 1
    if (index !== last) {
      const moved = batch.marks[last]
      batch.mesh.getMatrixAt(last, inverse)
      batch.mesh.setMatrixAt(index, inverse)
      batch.marks[index] = moved
      moved.index = index
      this.touched(batch, index)
    }
    batch.marks.length = last
    batch.mesh.count = last
    if (!last) this.release(batch)
    else {
      batch.mesh.boundingSphere = null
      batch.mesh.boundingBox = null
    }
  }

  /** Store `scratch`'s local matrix as a new mark under `parent`. */
  private push(parent: THREE.Object3D): void {
    if (this.marks.length >= this.limit) this.remove(this.marks[0])
    const batch = this.batchFor(parent)
    const index = batch.marks.length
    const mark = { batch, index }
    batch.marks.push(mark)
    batch.mesh.count = batch.marks.length
    batch.mesh.setMatrixAt(index, scratch.matrix)
    this.touched(batch, index)
    this.marks.push(mark)
  }

  /** Reset the scratch transform with a random size (0.8–1.25×). */
  private begin(): void {
    scratch.position.set(0, 0, 0)
    scratch.quaternion.identity()
    scratch.scale.setScalar(markScale())
  }

  private place(point: Vec3Tuple, normal: Vec3Tuple): void {
    const n = new THREE.Vector3(...normal).normalize()
    if (n.lengthSq() < 1e-8) n.set(0, 1, 0)
    scratch.position.fromArray(point).addScaledVector(n, IMPACT_MARK_STANDOFF)
    scratch.quaternion.setFromUnitVectors(zAxis, n)
    // Slight random roll so overlapping marks do not stack identically.
    scratch.rotateZ(Math.random() * Math.PI * 2)
  }

  /** Exact rendered surface hit, anchored in the moving mesh's local frame. */
  addSurface(parent: THREE.Object3D, point: Vec3Tuple, normal: Vec3Tuple): void {
    if (!this.limit) return
    this.begin()
    this.place(point, normal)
    scratch.updateMatrix()
    parent.updateWorldMatrix(true, false)
    // What `parent.attach(mark)` did: re-express the world placement in the parent's frame.
    scratch.applyMatrix4(inverse.copy(parent.matrixWorld).invert())
    scratch.updateMatrix()
    this.push(parent)
  }

  /** Mark on a scene entity (car, prop, authored mesh) in that entity's local frame. */
  add(parent: THREE.Object3D, pose: Transform, point: Vec3Tuple, normal: Vec3Tuple): void {
    if (!this.limit) return
    this.begin()
    const rotation = new THREE.Quaternion(...pose.rotation).invert()
    const n = new THREE.Vector3(...normal).normalize().applyQuaternion(rotation)
    if (n.lengthSq() < 1e-8) n.set(0, 1, 0)
    scratch.position
      .fromArray(point)
      .sub(new THREE.Vector3(...pose.position))
      .applyQuaternion(rotation)
      .addScaledVector(n, IMPACT_MARK_STANDOFF)
    scratch.quaternion.setFromUnitVectors(zAxis, n)
    scratch.rotateZ(Math.random() * Math.PI * 2)
    scratch.updateMatrix()
    this.push(parent)
  }

  /**
   * Mark on static world geometry (planet buildings, ground colliders, …).
   * `root` must share the floating-origin shift with the hit meshes (e.g. `SceneView.root`
   * or `PlanetWorld.root`).
   */
  addWorld(root: THREE.Object3D, point: Vec3Tuple, normal: Vec3Tuple): void {
    if (!this.limit) return
    this.begin()
    this.place(point, normal)
    scratch.updateMatrix()
    this.push(root)
  }

  /** Remove the marks whose batch hangs from `parent` or any of its descendants. */
  removeFor(parent: THREE.Object3D): void {
    for (const batch of [...this.batches.values()]) {
      let owner: THREE.Object3D | null = batch.mesh.parent
      while (owner && owner !== parent) owner = owner.parent
      if (!owner) continue
      const gone = new Set(batch.marks)
      this.marks = this.marks.filter((mark) => !gone.has(mark))
      this.release(batch)
    }
  }

  clear(): void {
    for (const batch of [...this.batches.values()]) this.release(batch)
    this.marks = []
  }

  dispose(): void {
    this.clear()
    for (const batch of this.spare) batch.mesh.dispose()
    this.spare.length = 0
    this.geom.dispose()
    this.texture.dispose()
    this.material.dispose()
  }
}
