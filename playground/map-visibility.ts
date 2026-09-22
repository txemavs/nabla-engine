import type { Vector3 } from 'three'

/** Map detail is a ground footprint: climbing must not hide the roads underneath. */
export function withinMapDistance(
  center: Vector3,
  eye: Vector3,
  radius: number,
  distance: number,
): boolean {
  return Math.hypot(center.x - eye.x, center.z - eye.z) <= distance + radius
}
