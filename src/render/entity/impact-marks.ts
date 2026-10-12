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

/**
 * Bounded shot marks. Entity hits parent into the hit object's local frame so they
 * ride with vehicles; world hits (buildings and other static colliders without an
 * entity id) parent under a scene root that shares the floating-origin shift.
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
  private marks: THREE.Group[] = []
  get count(): number {
    return this.marks.length
  }

  private take(): THREE.Group {
    if (this.marks.length >= MAX_IMPACT_MARKS) {
      const oldest = this.marks.shift()!
      oldest.removeFromParent()
      return oldest
    }
    const group = new THREE.Group()
    group.name = 'shot-impact'
    const mark = new THREE.Mesh(this.geom, this.material)
    mark.renderOrder = 2
    group.add(mark)
    return group
  }

  private place(mark: THREE.Group, point: Vec3Tuple, normal: Vec3Tuple, local: boolean): void {
    const n = new THREE.Vector3(...normal).normalize()
    if (n.lengthSq() < 1e-8) n.set(0, 1, 0)
    mark.position.fromArray(point).addScaledVector(n, IMPACT_MARK_STANDOFF)
    mark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
    // Slight random roll so overlapping marks do not stack identically.
    mark.rotateZ(Math.random() * Math.PI * 2)
    void local
  }

  /** Mark on a scene entity (car, prop, authored mesh) in that entity's local frame. */
  add(parent: THREE.Object3D, pose: Transform, point: Vec3Tuple, normal: Vec3Tuple): void {
    const mark = this.take()
    mark.removeFromParent()
    const inverse = new THREE.Quaternion(...pose.rotation).invert()
    const n = new THREE.Vector3(...normal).normalize().applyQuaternion(inverse)
    if (n.lengthSq() < 1e-8) n.set(0, 1, 0)
    mark.position
      .fromArray(point)
      .sub(new THREE.Vector3(...pose.position))
      .applyQuaternion(inverse)
      .addScaledVector(n, IMPACT_MARK_STANDOFF)
    mark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
    mark.rotateZ(Math.random() * Math.PI * 2)
    parent.add(mark)
    this.marks.push(mark)
  }

  /**
   * Mark on static world geometry (planet buildings, ground colliders, …).
   * `root` must share the floating-origin shift with the hit meshes (e.g. `SceneView.root`
   * or `PlanetWorld.root`).
   */
  addWorld(root: THREE.Object3D, point: Vec3Tuple, normal: Vec3Tuple): void {
    const mark = this.take()
    mark.removeFromParent()
    this.place(mark, point, normal, false)
    root.add(mark)
    this.marks.push(mark)
  }

  removeFor(parent: THREE.Object3D): void {
    this.marks = this.marks.filter((mark) => {
      let owner: THREE.Object3D | null = mark.parent
      while (owner && owner !== parent) owner = owner.parent
      if (!owner) return true
      mark.removeFromParent()
      return false
    })
  }

  clear(): void {
    for (const mark of this.marks) mark.removeFromParent()
    this.marks = []
  }

  dispose(): void {
    this.clear()
    this.geom.dispose()
    this.texture.dispose()
    this.material.dispose()
  }
}
