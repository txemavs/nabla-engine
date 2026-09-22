import { DirectionalLight, Vector3 } from 'three'

const direction = new Vector3(),
  right = new Vector3(),
  up = new Vector3(),
  center = new Vector3()
const worldUp = new Vector3(0, 1, 0)

/** Anchor in absolute light space, then rebase. Camera/head motion cannot slide the texel grid. */
export function stabilizeSunShadow(
  light: DirectionalLight,
  focus: Vector3,
  origin: Vector3,
  lightDirection: Vector3,
): void {
  direction.copy(lightDirection).normalize()
  right.crossVectors(worldUp, direction)
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0)
  else right.normalize()
  up.crossVectors(direction, right).normalize()
  const camera = light.shadow.camera
  const step = (camera.right - camera.left) / light.shadow.mapSize.x
  const snap = (axis: Vector3) => Math.round(focus.dot(axis) / step) * step
  center
    .copy(right)
    .multiplyScalar(snap(right))
    .addScaledVector(up, snap(up))
    .addScaledVector(direction, snap(direction))
  light.target.position.copy(center).sub(origin)
  light.position.copy(light.target.position).addScaledVector(direction, 180)
  // Match the basis used above even when the sun is near the zenith.
  camera.up.copy(up)
  light.target.updateMatrixWorld()
  light.updateMatrixWorld()
}
