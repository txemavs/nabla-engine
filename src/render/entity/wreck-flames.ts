import * as THREE from 'three'

/** Crossed flame planes ("tongues") of one burning wreck. */
export const FLAME_TONGUES = 6

/** Rest layout of tongue `i`: alternate facing, three rows across, three depths. */
export function tongueLayout(i: number): {
  rotationY: number
  x: number
  z: number
  scaleX: number
  scaleY: number
} {
  return {
    rotationY: ((i % 2) * Math.PI) / 2,
    x: (Math.floor(i / 2) - 1) * 0.24,
    z: ((i % 3) - 1) * 0.1,
    scaleX: 0.7,
    scaleY: 1.0 + (i % 3) * 0.2,
  }
}

/** Animated scale of tongue `i` of a burning car at `age` seconds (the former JS per-tongue sway). */
export function tongueSway(i: number, age: number): { scaleX: number; scaleY: number } {
  const phase = age * (4.5 + i * 0.37) + i * 2.4
  return {
    scaleY: (1 + (i % 3) * 0.2) * (0.92 + Math.sin(phase) * 0.13 + Math.sin(phase * 1.7) * 0.05),
    scaleX: 0.64 + Math.sin(phase * 0.8) * 0.06,
  }
}

/**
 * GLSL after the per-tongue ripple: place the vertex with its tongue's scale (animated from
 * `flameTime` when `flameAnimate` is set, as {@link tongueSway}), quarter turn and offset
 * (as {@link tongueLayout}).
 */
export const TONGUE_GLSL = /* glsl */ `
  {
    float tongueI = flameTongue;
    float row3 = mod(tongueI, 3.0);
    vec2 tongueScale = vec2(0.7, 1.0 + row3 * 0.2);
    if (flameAnimate > 0.5) {
      float phase = flameTime * (4.5 + tongueI * 0.37) + tongueI * 2.4;
      tongueScale = vec2(
        0.64 + sin(phase * 0.8) * 0.06,
        tongueScale.y * (0.92 + sin(phase) * 0.13 + sin(phase * 1.7) * 0.05));
    }
    transformed.xy *= tongueScale;
    if (mod(tongueI, 2.0) > 0.5) transformed = vec3(transformed.z, transformed.y, -transformed.x);
    transformed += vec3((floor(tongueI / 2.0) - 1.0) * 0.24, 0.0, (row3 - 1.0) * 0.1);
  }
`

/** Merged geometry: {@link FLAME_TONGUES} copies of `tongue` with a `flameTongue` index. */
export function mergedFlameGeometry(tongue: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = tongue.getAttribute('position')
  const uv = tongue.getAttribute('uv')
  const index = tongue.getIndex()!
  const vertices = position.count
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(vertices * 3 * FLAME_TONGUES)
  const uvs = new Float32Array(vertices * 2 * FLAME_TONGUES)
  const tongues = new Float32Array(vertices * FLAME_TONGUES)
  const indices = new Uint16Array(index.count * FLAME_TONGUES)
  for (let i = 0; i < FLAME_TONGUES; i++) {
    positions.set(position.array as Float32Array, i * vertices * 3)
    uvs.set(uv.array as Float32Array, i * vertices * 2)
    tongues.fill(i, i * vertices, (i + 1) * vertices)
    for (let k = 0; k < index.count; k++)
      indices[i * index.count + k] = index.getX(k) + i * vertices
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setAttribute('flameTongue', new THREE.BufferAttribute(tongues, 1))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1).setUsage(THREE.DynamicDrawUsage))
  // Every tongue at its largest scale and ripple, in the flames' frame.
  if (!tongue.boundingBox) tongue.computeBoundingBox()
  geometry.userData.tongueBox = tongue.boundingBox!.clone()
  const box = new THREE.Box3(
    new THREE.Vector3(-0.66, 0, -0.52),
    new THREE.Vector3(0.66, 1.62, 0.52),
  )
  geometry.boundingBox = box
  geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere())
  return geometry
}

const center = new THREE.Vector3()
const viewProjection = new THREE.Matrix4()
const tongueMatrix = new THREE.Matrix4()
const tongueBox = new THREE.Box3()
const tonguePosition = new THREE.Vector3()
const tongueRotation = new THREE.Quaternion()
const tongueEuler = new THREE.Euler()
const tongueScale = new THREE.Vector3()

/**
 * One draw for the six tongues of a burning wreck. Before each draw the index buffer lists the
 * tongues back to front exactly as three sorted the six former meshes (by the projected depth of
 * each tongue's bounding-sphere centre, ties by creation order), so the blending is unchanged;
 * the index is only re-uploaded when that order changes.
 */
export class WreckFlames {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>
  private readonly order = Array.from({ length: FLAME_TONGUES }, (_, i) => i)
  private readonly depth = new Float64Array(FLAME_TONGUES)
  private readonly source: Uint16Array
  private readonly perTongue: number
  /** Bounding box of one tongue's plane. */
  private readonly tongueBox: THREE.Box3

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    private readonly clock: { value: number },
    /** 1: the tongues sway with `clock` (a burning car); 0: rest scales (debris fires). */
    readonly animate: { value: number },
  ) {
    // Shared vertex attributes; only the index (the per-camera tongue order) is this wreck's own.
    const merged = new THREE.BufferGeometry()
    for (const [name, attribute] of Object.entries(geometry.attributes))
      merged.setAttribute(name, attribute)
    const shared = geometry.getIndex()!
    this.source = (shared.array as Uint16Array).slice()
    merged.setIndex(
      new THREE.BufferAttribute(this.source.slice(), 1).setUsage(THREE.DynamicDrawUsage),
    )
    // Culling uses the fixed, conservative sphere; the box is kept equal to the union of the six
    // former tongue boxes (see updateBounds), because the wreck's smoke rises from its centre.
    merged.boundingBox = new THREE.Box3()
    merged.boundingSphere = geometry.boundingSphere
    this.tongueBox = geometry.userData.tongueBox as THREE.Box3
    this.perTongue = shared.count / FLAME_TONGUES
    this.mesh = new THREE.Mesh(merged, material)
    this.updateBounds()
    this.mesh.name = 'Wreck flame tongues'
    this.mesh.onBeforeRender = (_renderer, _scene, camera) => this.sort(camera)
  }

  /** Bounding-sphere centre of tongue `i` in the flames' frame (as the former mesh had it). */
  tongueCentre(i: number, out: THREE.Vector3): THREE.Vector3 {
    const layout = tongueLayout(i)
    const scaleY = this.animate.value ? tongueSway(i, this.clock.value).scaleY : layout.scaleY
    return out.set(layout.x, 0.5 * scaleY, layout.z)
  }

  /**
   * Set the geometry box to the union of the six tongues' boxes at their current scales, as
   * `Box3.setFromObject` saw the former meshes (the burning wreck's smoke emits from its centre).
   * Call after the clock changes.
   */
  updateBounds(): void {
    const box = this.mesh.geometry.boundingBox!.makeEmpty()
    for (let i = 0; i < FLAME_TONGUES; i++) {
      const layout = tongueLayout(i)
      const sway = this.animate.value ? tongueSway(i, this.clock.value) : layout
      tongueMatrix.compose(
        tonguePosition.set(layout.x, 0, layout.z),
        tongueRotation.setFromEuler(tongueEuler.set(0, layout.rotationY, 0)),
        tongueScale.set(sway.scaleX, sway.scaleY, 1),
      )
      box.union(tongueBox.copy(this.tongueBox).applyMatrix4(tongueMatrix))
    }
  }

  /** Reorder the tongues back to front for `camera`. */
  sort(camera: THREE.Camera): void {
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    for (let i = 0; i < FLAME_TONGUES; i++)
      this.depth[i] = this.tongueCentre(i, center)
        .applyMatrix4(this.mesh.matrixWorld)
        .applyMatrix4(viewProjection).z
    const order = this.order
    let changed = false
    // Insertion sort of six: farthest (largest depth) first, stable by tongue index.
    for (let i = 0; i < FLAME_TONGUES; i++) {
      let k = i
      while (k > 0 && this.depth[order[k - 1]] < this.depth[i]) {
        order[k] = order[k - 1]
        k--
      }
      order[k] = i
    }
    const index = this.mesh.geometry.getIndex()!
    const array = index.array as Uint16Array
    const n = this.perTongue
    for (let slot = 0; slot < FLAME_TONGUES; slot++) {
      const from = order[slot] * n
      if (array[slot * n] !== this.source[from]) changed = true
    }
    if (!changed) return
    for (let slot = 0; slot < FLAME_TONGUES; slot++)
      array.set(this.source.subarray(order[slot] * n, order[slot] * n + n), slot * n)
    index.clearUpdateRanges()
    index.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
  }
}
