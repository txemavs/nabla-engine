import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
/** Discover GLB-authored lens meshes without depending on material or node names. */
export function authoredMirrorSurfaces(model: THREE.Object3D): THREE.Mesh[] {
  const surfaces: THREE.Mesh[] = []
  model.traverse((node) => {
    if (node instanceof THREE.Mesh && typeof node.userData.nabla?.mirror === 'string')
      surfaces.push(node)
  })
  return surfaces
}
/**
 * Driver adjustment of one mirror glass, degrees, on top of the angle baked into the asset
 * (GLB lens / anchor, or `vehicle.mirrors`) and the vehicle's shared `mirrorTilt`.
 * `yaw` turns the glass about the vehicle vertical: positive outward (away from the body, so the
 * view swings outward too), negative inward. `tilt` turns it about the horizontal: positive up.
 * The reflected view moves by twice each glass angle.
 */
export interface MirrorAngle {
  yaw: number
  tilt: number
}

/**
 * Baked aim of one side (`vehicle.mirrorAim`): the glass angle, plus `viewYaw`, degrees of glass
 * yaw applied to the reflection only (positive outward, as `yaw`). The glass mesh stays where the
 * housing has it; only the captured view turns, by twice `viewYaw`. Use it where turning the
 * glass itself would push it out of the housing.
 */
export interface MirrorAim extends MirrorAngle {
  viewYaw?: number
}

/** Adjustment of every mirror of a vehicle model, keyed by side (`left`, `right`, …). */
export type MirrorAdjustment = Record<string, MirrorAngle>

/** Neutral glass angle: exactly as the asset aims it. */
export const mirrorAngleCentred: Readonly<MirrorAngle> = Object.freeze({ yaw: 0, tilt: 0 })

/** Limits and step of each glass axis, degrees (yaw ±15°, tilt ±10°, 0.5° steps). */
export const mirrorAngleRange = Object.freeze({
  yaw: Object.freeze({ min: -15, max: 15, step: 0.5 }),
  tilt: Object.freeze({ min: -10, max: 10, step: 0.5 }),
})

/** Clamp to `mirrorAngleRange` and snap to its step; non-finite values become 0. */
export function clampMirrorAngle(angle: Partial<MirrorAngle> | undefined): MirrorAngle {
  const axis = (value: unknown, range: { min: number; max: number; step: number }) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0
    const snapped = Math.round(THREE.MathUtils.clamp(value, range.min, range.max) / range.step)
    return Number((snapped * range.step).toFixed(2)) || 0
  }
  return {
    yaw: axis(angle?.yaw, mirrorAngleRange.yaw),
    tilt: axis(angle?.tilt, mirrorAngleRange.tilt),
  }
}

/** Clamp every side; sides left at 0° / 0° are dropped, so `{}` means "as authored". */
export function clampMirrorAdjustment(
  adjustment: Readonly<Record<string, Partial<MirrorAngle>>> | undefined,
): MirrorAdjustment {
  const result: MirrorAdjustment = {}
  for (const [side, angle] of Object.entries(adjustment ?? {})) {
    const clamped = clampMirrorAngle(angle)
    if (clamped.yaw !== 0 || clamped.tilt !== 0) result[side] = clamped
  }
  return result
}

/**
 * Which side a lens is on: its authored `extras.nabla.mirror` tag, else the sign of its centre
 * across the vehicle (`root` is the chassis-space group: +X is the driver's right).
 */
export function mirrorSideOf(mesh: THREE.Mesh, root?: THREE.Object3D): string | undefined {
  const tagged = authoredMirrorSide(mesh)
  if (tagged) return tagged
  if (!root) return undefined
  mesh.geometry.computeBoundingBox()
  const centre = mesh.geometry.boundingBox!.getCenter(new THREE.Vector3())
  root.updateWorldMatrix(true, false)
  mesh.updateWorldMatrix(true, false)
  const local = root.worldToLocal(centre.applyMatrix4(mesh.matrixWorld))
  return local.x < 0 ? 'left' : 'right'
}

/**
 * Key of a vehicle's mirror settings: its body GLB URL, plus its steering GLB when it has one,
 * so cars that share a body but not a cockpit (the S3 and the A3) keep separate adjustments.
 */
export function mirrorModelKey(bodyUrl: string, steeringUrl?: string): string {
  return steeringUrl ? `${bodyUrl}#${steeringUrl}` : bodyUrl
}

/** Fit the whole mirror from the eye position, independently of head rotation.
 * The viewer's orientation only decides whether the mirror is visible.
 *
 * `up` is the world direction the capture camera keeps upright (the vehicle's up). Without it
 * the lens's own +Y is used, which is only right when the lens is authored upright: a lens node
 * authored rotated 180° about X (the S3 right door) would roll the capture upside down.
 */
export function fitMirrorCamera(
  target: THREE.PerspectiveCamera,
  viewer: THREE.PerspectiveCamera,
  mirror: THREE.Mesh,
  aspect = 384 / 256,
  up?: THREE.Vector3,
): void {
  viewer.getWorldPosition(target.position)
  const centre = mirror.getWorldPosition(new THREE.Vector3())
  const view = centre.clone().sub(target.position).normalize()
  // Near-vertical views cannot keep `up`; fall back to the lens's own +Y.
  if (up && up.lengthSq() > 0 && Math.abs(view.dot(up.clone().normalize())) < 0.98)
    target.up.copy(up).normalize()
  else target.up.set(0, 1, 0).transformDirection(mirror.matrixWorld)
  target.lookAt(centre)
  target.updateMatrixWorld(true)
  mirror.geometry.computeBoundingBox()
  const box = mirror.geometry.boundingBox!
  let slope = 0
  target.aspect = aspect
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z)
          .applyMatrix4(mirror.matrixWorld)
          .applyMatrix4(target.matrixWorldInverse)
        slope = Math.max(
          slope,
          Math.abs(p.y) / Math.max(0.001, -p.z),
          Math.abs(p.x) / (Math.max(0.001, -p.z) * target.aspect),
        )
      }
  target.fov = THREE.MathUtils.radToDeg(2 * Math.atan(slope * 1.02))
  target.near = Math.min(viewer.near, 0.01)
  target.far = viewer.far
  target.updateProjectionMatrix()
}
/** Optical elevation follows the car rather than the driver's head pitch. */
export function raisedMirrorNormal(
  normal: THREE.Vector3,
  up: THREE.Vector3,
  degrees = -2,
): THREE.Vector3 {
  const n = normal.clone().normalize()
  const tangent = up.clone().addScaledVector(n, -up.dot(n)).normalize()
  const angle = THREE.MathUtils.degToRad(degrees)
  return n.multiplyScalar(Math.cos(angle)).addScaledVector(tangent, Math.sin(angle)).normalize()
}
export interface MirrorCapturePolicy {
  width?: number
  height?: number
  intervalMs?: number
}
export interface MirrorPolicy extends MirrorCapturePolicy {
  /** Per-side overrides keyed by `userData.nabla.mirror` (`left`, `right`, …). */
  sides?: Readonly<Record<string, MirrorCapturePolicy>>
}
export const defaultMirrorCapture = { width: 384, height: 256, intervalMs: 125 } as const
const highQualityPresets = new Set(['high', 'ultra'])
export function resolveMirrorCapture(
  policy: MirrorPolicy = {},
  side?: string,
): { width: number; height: number; intervalMs: number } {
  const override = side ? policy.sides?.[side] : undefined
  const resolved = {
    width: override?.width ?? policy.width ?? defaultMirrorCapture.width,
    height: override?.height ?? policy.height ?? defaultMirrorCapture.height,
    intervalMs: override?.intervalMs ?? policy.intervalMs ?? defaultMirrorCapture.intervalMs,
  }
  if (
    ![resolved.width, resolved.height, resolved.intervalMs].every(
      (v) => Number.isFinite(v) && v > 0,
    )
  )
    throw new Error('Invalid mirror policy')
  return resolved
}
/** Alto/ultra double the authored left lens; other sides and cheaper presets stay at 8 Hz / 384×256. */
export function mirrorPolicyForQuality(preset: string): MirrorPolicy {
  return highQualityPresets.has(preset)
    ? {
        sides: {
          left: {
            width: defaultMirrorCapture.width * 2,
            height: defaultMirrorCapture.height * 2,
            intervalMs: defaultMirrorCapture.intervalMs / 2,
          },
        },
      }
    : {}
}
function authoredMirrorSide(mesh: THREE.Mesh): string | undefined {
  const side = mesh.userData.nabla?.mirror
  return typeof side === 'string' ? side : undefined
}

/**
 * Draw the sky into the mirror target before the reflected scene. The reflector clears on
 * `renderer.render`, so the sky pass has to run inside that call, first, while autoClear is
 * still on. The scene is then composited with autoClear off and covers the sky where the
 * world is. Without this the mirror target keeps the clear colour, a dark navy that is not
 * the daytime sky.
 */
export function renderSceneWithSky(
  renderer: { render: THREE.WebGLRenderer['render']; autoClear: boolean },
  paintSky: ((camera: THREE.PerspectiveCamera) => void) | undefined,
  draw: () => void,
  /**
   * Projection to paint the sky with: the capture camera's, before the reflector bends its near
   * plane onto the glass (see `skyCamera`). Omitted: the reflection camera itself.
   */
  plain?: THREE.Matrix4,
): void {
  if (!paintSky) {
    draw()
    return
  }
  const original = renderer.render
  let painting = false
  renderer.render = function (this: unknown, scene, camera, ...rest: unknown[]) {
    if (painting || !(camera as { isPerspectiveCamera?: boolean } | undefined)?.isPerspectiveCamera)
      return original.call(this, scene, camera as THREE.Camera, ...(rest as []))
    painting = true
    try {
      const reflection = camera as THREE.PerspectiveCamera
      paintSky(plain ? skyCamera(reflection, plain) : reflection)
      const clear = renderer.autoClear
      renderer.autoClear = false
      try {
        return original.call(this, scene, camera as THREE.Camera, ...(rest as []))
      } finally {
        renderer.autoClear = clear
      }
    } finally {
      painting = false
    }
  } as THREE.WebGLRenderer['render']
  try {
    draw()
  } finally {
    renderer.render = original
  }
}

/**
 * A camera the sky pass can rebuild: the sky redraws with its own camera from `fov`, `aspect`
 * and `view` (it has its own near/far), so a projection matrix set directly is lost. A mirror's
 * capture frustum is off-axis (fitted to the glass, far from the eye's axis on the right-hand
 * mirrors), and the sky then looked along the wrong axis: below the horizon, a dark band over
 * most of the glass. Encode the same frustum as a view offset of a symmetric one.
 */
export function skyCamera(
  reflection: THREE.PerspectiveCamera,
  projection: THREE.Matrix4,
): THREE.PerspectiveCamera {
  const te = projection.elements
  // Extents on the plane one unit in front of the camera.
  const width = 2 / te[0],
    height = 2 / te[5]
  const cx = te[8] / te[0],
    cy = te[9] / te[5]
  const left = cx - width / 2,
    right = cx + width / 2,
    top = cy + height / 2,
    bottom = cy - height / 2
  const halfX = Math.max(Math.abs(left), Math.abs(right)),
    halfY = Math.max(Math.abs(top), Math.abs(bottom))
  const sky = new THREE.PerspectiveCamera(
    THREE.MathUtils.radToDeg(2 * Math.atan(halfY)),
    halfX / halfY,
    reflection.near,
    reflection.far,
  )
  const k = 1000
  sky.setViewOffset(
    2 * halfX * k,
    2 * halfY * k,
    (left + halfX) * k,
    (halfY - top) * k,
    (right - left) * k,
    (top - bottom) * k,
  )
  sky.position.copy(reflection.position)
  sky.quaternion.copy(reflection.quaternion)
  sky.updateMatrixWorld(true)
  return sky
}

/** Side mirrors render only in the occupied cockpit. Default 8 Hz; high/ultra left is 16 Hz. */
export class CarMirrors {
  private entries: {
    side: string
    normal: THREE.Vector3
    up: THREE.Vector3
    /** Unit vector away from the vehicle body, in the lens parent's frame. */
    outward: THREE.Vector3
    rotation: THREE.Quaternion
    original: THREE.Mesh
    mirror: Reflector
    render: Reflector['onBeforeRender']
    capture: THREE.PerspectiveCamera
    width: number
    height: number
    intervalMs: number
    next: number
  }[] = []
  private frames = 0
  private tilt: number
  private adjustment: MirrorAdjustment = {}
  /**
   * `root` is the vehicle's chassis-space group; it tells untagged lenses their side and gives
   * the outward direction for yaw (without it, the glass yaw has no reference). `aim` is the
   * vehicle's baked per-side glass aim (`vehicle.mirrorAim`); `setAdjustment` adds to it.
   */
  constructor(
    candidates: readonly THREE.Mesh[],
    carUp = new THREE.Vector3(0, 1, 0),
    tilt = -2,
    private readonly policy: MirrorPolicy = {},
    root?: THREE.Object3D,
    private readonly aim: Readonly<Record<string, MirrorAim>> = {},
  ) {
    this.tilt = tilt
    resolveMirrorCapture(policy)
    for (const side of Object.keys(policy.sides ?? {})) resolveMirrorCapture(policy, side)
    for (const original of candidates) {
      if (!original.parent || !original.geometry.getAttribute('normal')) {
        console.warn('Mirror omitted: missing parent or surface normals')
        continue
      }
      original.updateWorldMatrix(true, false)
      const geometry = original.geometry.clone()
      geometry.applyMatrix4(original.matrix)
      geometry.computeBoundingBox()
      const centre = geometry.boundingBox!.getCenter(new THREE.Vector3())
      const normals = geometry.getAttribute('normal'),
        normal = new THREE.Vector3()
      for (let i = 0; i < normals.count; i++)
        normal.add(new THREE.Vector3().fromBufferAttribute(normals, i))
      normal.normalize()
      const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
      const basis = new THREE.Matrix4().compose(centre, rotation, new THREE.Vector3(1, 1, 1))
      geometry.applyMatrix4(basis.clone().invert())
      // The authored lens is slightly curved. Place a planar reflection at its
      // frontmost surface so the oblique clip plane excludes its own housing.
      geometry.computeBoundingBox()
      centre.addScaledVector(normal, geometry.boundingBox!.max.z + 0.003)
      const positions = geometry.getAttribute('position')
      for (let i = 0; i < positions.count; i++) positions.setZ(i, 0)
      positions.needsUpdate = true
      geometry.computeBoundingBox()
      geometry.computeBoundingSphere()
      const capture = resolveMirrorCapture(this.policy, authoredMirrorSide(original))
      const mirror = new Reflector(geometry, {
        textureWidth: capture.width,
        textureHeight: capture.height,
        color: 0xaaaaaa,
        multisample: 0,
        clipBias: 0.003,
      })
      mirror.position.copy(centre)
      const up = carUp
        .clone()
        .applyQuaternion(original.parent!.getWorldQuaternion(new THREE.Quaternion()).invert())
      const side = mirrorSideOf(original, root) ?? `mirror${this.entries.length}`
      const parentRotation = original.parent!.getWorldQuaternion(new THREE.Quaternion()).invert()
      const across = root
        ? new THREE.Vector3(1, 0, 0)
            .applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()))
            .applyQuaternion(parentRotation)
        : new THREE.Vector3()
      const outward = side === 'left' ? across.negate() : across
      mirror.visible = false
      original.parent!.add(mirror)
      const render = mirror.onBeforeRender
      mirror.onBeforeRender = () => {}
      const entry = {
        side,
        original,
        mirror,
        render,
        normal,
        up,
        outward,
        rotation,
        capture: new THREE.PerspectiveCamera(),
        width: capture.width,
        height: capture.height,
        intervalMs: capture.intervalMs,
        next: 0,
      }
      this.entries.push(entry)
      this.orient(entry)
    }
  }
  /** Sides of the lenses this vehicle has (`left`, `right`, …), in lens order. */
  get sides(): string[] {
    return this.entries.map((e) => e.side)
  }
  /** Vehicle-wide glass tilt (`vehicle.mirrorTilt`, −5…12°); per-side adjustments add to it. */
  setTilt(degrees: number): void {
    this.tilt = THREE.MathUtils.clamp(degrees, -5, 12)
    for (const e of this.entries) this.orient(e)
  }
  /**
   * Turn each side's glass by its `MirrorAngle` (clamped) on top of the authored aim and the
   * vehicle tilt. The reflection is computed from the glass every capture, so the mirror view
   * follows at once. Sides not listed return to the authored aim.
   */
  setAdjustment(adjustment: Readonly<Record<string, Partial<MirrorAngle>>>): MirrorAdjustment {
    this.adjustment = clampMirrorAdjustment(adjustment)
    for (const e of this.entries) this.orient(e)
    return { ...this.adjustment }
  }
  private orient(e: CarMirrors['entries'][number]): void {
    const adjusted = this.adjustment[e.side] ?? mirrorAngleCentred
    const baked = this.aim[e.side] ?? mirrorAngleCentred
    const angle = { yaw: baked.yaw + adjusted.yaw, tilt: baked.tilt + adjusted.tilt }
    // Tilt the glass toward vehicle-up (both GLB housings use different local axes).
    // The property specifies glass tilt; the reflected view changes at twice that angle.
    const raised = raisedMirrorNormal(e.normal, e.up, this.tilt + angle.tilt)
    // Yaw about vehicle-up; the sign that swings the glass normal toward `outward` is positive.
    const swing = new THREE.Vector3().crossVectors(e.up, raised).dot(e.outward)
    const yaw = THREE.MathUtils.degToRad(angle.yaw) * (swing < 0 ? -1 : 1)
    // Preserve the lens roll: reconstructing a quaternion from +Z is ambiguous
    // near -Z and can rotate the silhouette out of its housing.
    e.mirror.quaternion
      .copy(e.rotation)
      .premultiply(new THREE.Quaternion().setFromUnitVectors(e.normal, raised))
      .premultiply(new THREE.Quaternion().setFromAxisAngle(e.up, yaw))
    e.next = 0
  }
  /** Signed view-only yaw of a side, radians, about the lens parent's vehicle-up. */
  private viewYaw(e: CarMirrors['entries'][number]): number {
    const degrees = this.aim[e.side]?.viewYaw ?? 0
    if (!degrees) return 0
    const swing = new THREE.Vector3()
      .crossVectors(e.up, new THREE.Vector3(0, 0, 1).applyQuaternion(e.mirror.quaternion))
      .dot(e.outward)
    return THREE.MathUtils.degToRad(degrees) * (swing < 0 ? -1 : 1)
  }
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    enabled: boolean,
    now: number,
    /** Paints the real sky into the mirror target for this reflection camera. */
    paintSky?: (camera: THREE.PerspectiveCamera) => void,
  ): void {
    for (const e of this.entries) {
      e.mirror.visible = enabled
      e.original.visible = !enabled
    }
    renderer.domElement.dataset.mirrorActive = String(enabled && this.entries.length > 0)
    renderer.domElement.dataset.mirrorFrames = String(this.frames)
    renderer.domElement.dataset.mirrorPolicy = this.entries
      .map((e) => {
        const side = authoredMirrorSide(e.original) ?? 'shared'
        return `${side}:${e.width}x${e.height}@${e.intervalMs}`
      })
      .join(',')
    const due = this.entries.filter((e) => now >= e.next)
    if (!enabled || !due.length) return
    for (const e of due) e.next = now + e.intervalMs
    scene.updateMatrixWorld(true)
    camera.updateMatrixWorld(true)
    const projection = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    )
    const frustum = new THREE.Frustum().setFromProjectionMatrix(projection)
    const background = scene.background,
      autoClear = renderer.autoClear
    const visible = this.entries.map((e) => e.mirror.visible)
    const capturing = new Set(due)
    try {
      // No recursive mirror captures; keep an inexpensive atmospheric background.
      for (const e of this.entries) {
        e.mirror.visible = false
        e.original.visible = true
      }
      // Same light as the sky backdrop, so a mirror that misses the sky pass is not navy.
      if (!scene.background) scene.background = scene.fog?.color ?? new THREE.Color('#a6bbd5')
      renderer.autoClear = true
      for (const e of this.entries) {
        if (!capturing.has(e) || !frustum.intersectsObject(e.mirror)) continue
        const eye = camera.position.clone().sub(e.mirror.getWorldPosition(new THREE.Vector3()))
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(e.mirror.matrixWorld)
        if (eye.dot(normal) <= 0) continue
        // Keep the capture upright with the vehicle, whatever roll the lens node was authored with.
        const up = e.up.clone()
        if (e.mirror.parent) up.transformDirection(e.mirror.parent.matrixWorld)
        // View-only yaw: turn the glass for the capture and back, so the mesh never moves.
        const viewYaw = this.viewYaw(e)
        const placed = e.mirror.quaternion.clone()
        if (viewYaw !== 0)
          e.mirror.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(e.up, viewYaw))
        e.mirror.updateMatrixWorld(true)
        try {
          fitMirrorCamera(e.capture, camera, e.mirror, e.width / e.height, up)
          e.original.visible = false
          renderSceneWithSky(
            renderer,
            paintSky,
            () =>
              e.render.call(
                e.mirror,
                renderer,
                scene,
                e.capture,
                e.mirror.geometry,
                e.mirror.material as THREE.Material,
                null!,
              ),
            e.capture.projectionMatrix.clone(),
          )
        } finally {
          e.mirror.quaternion.copy(placed)
          e.mirror.updateMatrixWorld(true)
        }
        e.mirror.visible = false
        e.original.visible = true
        this.frames++
      }
    } finally {
      scene.background = background
      renderer.autoClear = autoClear
      this.entries.forEach((e, i) => {
        e.mirror.visible = visible[i]
        e.original.visible = !enabled
      })
      renderer.domElement.dataset.mirrorFrames = String(this.frames)
    }
  }
  dispose(): void {
    for (const e of this.entries) {
      e.original.visible = true
      e.mirror.removeFromParent()
      e.mirror.geometry.dispose()
      e.mirror.dispose()
    }
    this.entries = []
  }
}
