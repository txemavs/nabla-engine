/**
 * Bow model bindings shared by every bow in the engine: the headset XRBow (AR and VR) and the
 * held bow on foot (HeldWeapon) build their meshes from the same GLB, node, string triangles
 * and transform, so the bow looks the same everywhere.
 */
import * as THREE from 'three'

export interface BowModelDescription {
  bowNode: string
  arrowNode: string
  stringTriangles: readonly number[]
  bowScale: number
  bowRotationX: number
  bowOffset: readonly number[]
  arrowScale: number
  arrowRotationX: number
  arrowOffset: readonly number[]
}

/** String geometry shared by every bow (bow-local metres): tips, rest nock, arrow lead. */
export const bowString = Object.freeze({ tipY: 0.481, restZ: 0.155, arrowLead: 0.29 })

/** The dynamic string that replaces the GLB's static one: tip, nock, tip. */
export function createBowString(): THREE.Line {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]),
    new THREE.LineBasicMaterial({ color: 0xe8dfce }),
  )
  setBowString(line, new THREE.Vector3(0, 0, bowString.restZ))
  return line
}

/** Move the string's nock point (bow-local); the tips stay. */
export function setBowString(line: THREE.Line, nock: THREE.Vector3): void {
  const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute
  attr.setXYZ(0, 0, -bowString.tipY, bowString.restZ)
  attr.setXYZ(1, nock.x, nock.y, nock.z)
  attr.setXYZ(2, 0, bowString.tipY, bowString.restZ)
  attr.needsUpdate = true
  line.geometry.computeBoundingSphere()
}

/** A bow GLB and how to cut it into the bow (string removed) and one arrow. */
export interface BowModel {
  url: string
  model: BowModelDescription
}

/**
 * Arco: the engine's own bow (original model, assets/library/weapons/arco/README.md). Authored in
 * engine metres and axes (grip at the origin, +Y up, -Z to the target, string at +Z), so no cut
 * or transform; its `Bow_String` node is unused (the engine draws the string).
 */
export const arcoBow: BowModel = {
  url: '/library/weapons/arco/arco.glb',
  model: {
    bowNode: 'Bow',
    arrowNode: 'Arrow',
    stringTriangles: [],
    bowScale: 1,
    bowRotationX: 0,
    bowOffset: [0, 0, 0],
    arrowScale: 1,
    arrowRotationX: 0,
    arrowOffset: [0, 0, 0],
  },
}

/** The bow web (held, slot 4) and XR use unless a host names another. */
export const defaultBow: BowModel = arcoBow

/** Bindings by id, as named by a held bow preset's `bowModel`. */
export const bowModels: Readonly<Record<string, BowModel>> = {
  arco: arcoBow,
}

/**
 * The bow (its static string triangles removed) and one arrow, cloned out of `asset` and
 * oriented, scaled and offset as `options` says. `asset` is left untouched.
 */
export function buildBowModel(
  asset: THREE.Object3D,
  options: BowModelDescription,
): { bow: THREE.Mesh; arrow: THREE.Mesh } {
  if (
    options.bowOffset.length !== 3 ||
    options.arrowOffset.length !== 3 ||
    ![
      options.bowScale,
      options.arrowScale,
      options.bowRotationX,
      options.arrowRotationX,
      ...options.bowOffset,
      ...options.arrowOffset,
    ].every(Number.isFinite) ||
    options.bowScale <= 0 ||
    options.arrowScale <= 0
  )
    throw new RangeError('Invalid bow model transform')
  const bowSource = asset.getObjectByName(options.bowNode),
    arrowSource = asset.getObjectByName(options.arrowNode)
  if (!(bowSource instanceof THREE.Mesh) || !(arrowSource instanceof THREE.Mesh))
    throw new Error('Bow/arrow nodes missing from GLB')
  const clone = (source: THREE.Mesh) =>
    new THREE.Mesh(
      source.geometry.clone(),
      Array.isArray(source.material)
        ? source.material.map((m) => m.clone())
        : source.material.clone(),
    )
  const bow = clone(bowSource)
  const geometry = bow.geometry,
    indices = geometry.getIndex()
  if (indices) {
    const hidden = new Set(options.stringTriangles)
    geometry.setIndex(Array.from(indices.array).filter((_, i) => !hidden.has(Math.floor(i / 3))))
  }
  const scale = options.bowScale
  geometry
    .rotateX(options.bowRotationX)
    .scale(scale, scale, scale)
    .translate(options.bowOffset[0], options.bowOffset[1], options.bowOffset[2])
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  const arrow = clone(arrowSource)
  const arrowScale = options.arrowScale
  arrow.geometry
    .rotateX(options.arrowRotationX)
    .scale(arrowScale, arrowScale, arrowScale)
    .translate(options.arrowOffset[0], options.arrowOffset[1], options.arrowOffset[2])
  arrow.geometry.computeBoundingSphere()
  bow.userData.bowModelPart = arrow.userData.bowModelPart = true
  return { bow, arrow }
}
