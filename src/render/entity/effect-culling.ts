import * as THREE from 'three'

/**
 * Off-screen culling for transparent effects that keep `frustumCulled = false`.
 *
 * three uses one bounding sphere both to cull an object and as the depth it sorts transparent
 * objects by. The effect pools pin that sphere on purpose (a fixed sort centre, see
 * exhaust-smoke.ts), so giving them real bounds would change the draw order of overlapping
 * transparents and with it the picture. Instead the pool keeps its own conservative local box,
 * and {@link cullOffscreen} tests it against the camera frustum in `onBeforeRender`: when no live
 * particle can reach the screen, the draw range collapses to zero for that draw, so the GPU does
 * no vertex or fragment work. Order and pixels are unchanged; three still issues an empty draw
 * (it counts in `renderer.info.render.calls`, but draws no primitives).
 */

/**
 * Bounds of short-lived spawns, O(1) per spawn and never walked per frame. Spawns go into the
 * current window; after `lifetime` the windows rotate, so the union of the two always covers
 * every spawn younger than `lifetime` (everything that can still be visible).
 */
export class SpawnBounds {
  private current = new THREE.Box3()
  private previous = new THREE.Box3()
  private windowStart = -Infinity
  constructor(public lifetime: number) {}

  /** Rotate the windows at time `now` (same units as `lifetime`). */
  advance(now: number): void {
    if (now - this.windowStart < this.lifetime) return
    if (now - this.windowStart >= 2 * this.lifetime) this.previous.makeEmpty()
    else {
      const swap = this.previous
      this.previous = this.current
      this.current = swap
    }
    this.current.makeEmpty()
    this.windowStart = now
  }

  /** Grow by the axis-aligned box `[min, max]`. */
  expand(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void {
    const { min, max } = this.current
    if (minX < min.x) min.x = minX
    if (minY < min.y) min.y = minY
    if (minZ < min.z) min.z = minZ
    if (maxX > max.x) max.x = maxX
    if (maxY > max.y) max.y = maxY
    if (maxZ > max.z) max.z = maxZ
  }

  /** Grow by a sphere. */
  expandSphere(x: number, y: number, z: number, r: number): void {
    this.expand(x - r, y - r, z - r, x + r, y + r, z + r)
  }

  /** Union of the live windows into `target` (which is not cleared). */
  unionInto(target: THREE.Box3): THREE.Box3 {
    if (!this.current.isEmpty()) target.union(this.current)
    if (!this.previous.isEmpty()) target.union(this.previous)
    return target
  }

  clear(): void {
    this.current.makeEmpty()
    this.previous.makeEmpty()
    this.windowStart = -Infinity
  }
}

/** World-space radius of `pixels` screen pixels at view distance `distance`. */
export function pixelsToWorld(
  camera: THREE.Camera,
  heightPx: number,
  distance: number,
  pixels: number,
): number {
  const p11 = camera.projectionMatrix.elements[5]
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera)
    return (pixels * 2) / Math.max(1e-6, heightPx * p11)
  return (pixels * Math.max(0, distance)) / Math.max(1e-6, heightPx * p11)
}

export type CullBounds = {
  /** Conservative bounds in the object's local frame, or an empty box when nothing is live. */
  box: (target: THREE.Box3) => THREE.Box3
  /**
   * Extra world-space radius at the farthest view distance `distance` (screen-sized sprites,
   * minimum line widths, …). Must not decrease with distance.
   */
  pad?: (camera: THREE.Camera, heightPx: number, distance: number) => number
}

const frustum = new THREE.Frustum()
const viewProjection = new THREE.Matrix4()
const box = new THREE.Box3()
const sphere = new THREE.Sphere()
const eye = new THREE.Vector3()
const size = new THREE.Vector2()

/** Whether the bounds can reach the screen of `camera`. Exported for tests. */
export function boundsVisible(
  object: THREE.Object3D,
  bounds: CullBounds,
  camera: THREE.Camera,
  heightPx: number,
): boolean {
  bounds.box(box.makeEmpty())
  if (box.isEmpty()) return false
  box.getBoundingSphere(sphere)
  sphere.applyMatrix4(object.matrixWorld)
  if (!Number.isFinite(sphere.radius)) return true
  eye.setFromMatrixPosition(camera.matrixWorld)
  const far = eye.distanceTo(sphere.center) + sphere.radius
  sphere.radius += bounds.pad?.(camera, heightPx, far) ?? 0
  viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  frustum.setFromProjectionMatrix(
    viewProjection,
    camera.coordinateSystem,
    (camera as THREE.Camera & { reversedDepth?: boolean }).reversedDepth ?? false,
  )
  return frustum.intersectsSphere(sphere)
}

/**
 * Skip the GPU work of `object` while its bounds are off-screen, without changing its sort order
 * (see the module comment). Chains any existing `onBeforeRender`/`onAfterRender`. Array (XR)
 * cameras are never culled.
 */
export function cullOffscreen(
  object: THREE.Mesh | THREE.Points | THREE.LineSegments,
  bounds: CullBounds,
): void {
  const before = object.onBeforeRender
  const after = object.onAfterRender
  let saved = -1
  object.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
    before.call(this, renderer, scene, camera, geometry, material, group)
    if ((camera as THREE.ArrayCamera).isArrayCamera) return
    const height = 'getDrawingBufferSize' in renderer ? renderer.getDrawingBufferSize(size).y : 1080
    if (boundsVisible(object, bounds, camera, height)) return
    saved = geometry.drawRange.count
    geometry.drawRange.count = 0
  }
  object.onAfterRender = function (renderer, scene, camera, geometry, material, group) {
    if (saved !== -1) {
      geometry.drawRange.count = saved
      saved = -1
    }
    after.call(this, renderer, scene, camera, geometry, material, group)
  }
}
