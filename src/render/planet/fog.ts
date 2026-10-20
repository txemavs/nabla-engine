import * as THREE from 'three'

/**
 * The scene's `Fog` with these values, updated in place when it is already a `Fog`. A new fog
 * object every frame is free under WebGL but not under WebGPU: the fog node is part of every
 * render object's cache key there, so each new object rebuilds all render objects (bind groups,
 * buffers and pipelines) on every frame.
 */
export function reuseFog(
  current: THREE.Fog | THREE.FogExp2 | null,
  color: THREE.ColorRepresentation,
  near: number,
  far: number,
): THREE.Fog {
  if (!(current instanceof THREE.Fog)) return new THREE.Fog(color, near, far)
  current.color.set(color)
  current.near = near
  current.far = far
  return current
}
