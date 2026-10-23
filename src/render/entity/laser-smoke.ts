import * as THREE from 'three'
import { smokeDensityFor } from './smoke-density.js'

export interface LaserSmokePool {
  root: THREE.Object3D
  positions: Float32Array
  life: Float32Array
  lifetime: number
  size: number
  /** Refresh `positions` and `life` first (pools whose motion is evaluated on the GPU). */
  sync?(): void
}

/** Live smoke pools; removed on disposal so reset worlds do not retain particles. */
export const laserSmokePools = new Set<LaserSmokePool>()

/** Bounded density profile along a beam, in its own scene frame. */
export function sampleLaserSmoke(
  start: THREE.Vector3,
  end: THREE.Vector3,
  frame: THREE.Object3D,
  result: Float32Array,
): void {
  result.fill(0)
  const smokeDensity = smokeDensityFor(frame)
  if (smokeDensity.value <= 0) return
  const delta = end.clone().sub(start)
  const length = delta.length()
  if (length < 1e-5) return
  delta.divideScalar(length)
  frame.updateWorldMatrix(true, false)
  const inverse = frame.matrixWorld.clone().invert()
  const position = new THREE.Vector3()
  const sceneRoot = (node: THREE.Object3D): THREE.Object3D => {
    while (node.parent) node = node.parent
    return node
  }
  const owner = sceneRoot(frame)
  for (const pool of laserSmokePools) {
    if (sceneRoot(pool.root) !== owner) continue
    if (!pool.root.visible || !pool.root.parent) continue
    pool.sync?.()
    pool.root.updateWorldMatrix(true, false)
    const transform = inverse.clone().multiply(pool.root.matrixWorld)
    for (let i = 0; i < pool.life.length; i++) {
      const age = pool.life[i] / pool.lifetime
      if (age <= 0) continue
      position
        .fromArray(pool.positions, i * 3)
        .applyMatrix4(transform)
        .sub(start)
      const along = position.dot(delta)
      const radius = Math.max(0.04, ((1 - age) * pool.size) / 700)
      if (along < -radius || along > length + radius) continue
      const perpendicular = Math.sqrt(Math.max(0, position.lengthSq() - along * along))
      if (perpendicular >= radius) continue
      const density = age * (1 - perpendicular / radius) * smokeDensity.value
      const index = THREE.MathUtils.clamp(
        Math.round((along / length) * (result.length - 1)),
        0,
        result.length - 1,
      )
      const spread = Math.max(1, Math.ceil((radius / length) * (result.length - 1)))
      for (
        let j = Math.max(0, index - spread);
        j <= Math.min(result.length - 1, index + spread);
        j++
      )
        result[j] = Math.min(1, result[j] + density * (1 - Math.abs(j - index) / (spread + 1)))
    }
  }
}
