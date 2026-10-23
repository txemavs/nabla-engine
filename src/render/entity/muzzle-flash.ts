import * as THREE from 'three'

/** Points of the star-shaped flash (alternating long and short rays around the bore). */
export const MUZZLE_FLASH_POINTS = 5

/**
 * The sidearm's flash cone with a star-shaped base: `2 × MUZZLE_FLASH_POINTS` radial segments
 * whose rim vertices alternate between the full and a 45 % radius. Same size and orientation as
 * the former 6-sided cone (radius 0.012 m, length 0.03 m, apex along +Y).
 */
export function muzzleFlashGeometry(radius = 0.012, length = 0.03): THREE.ConeGeometry {
  const geometry = new THREE.ConeGeometry(radius, length, MUZZLE_FLASH_POINTS * 2, 1, true)
  const position = geometry.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      z = position.getZ(i)
    const r = Math.hypot(x, z)
    if (r < 1e-6) continue
    const segment = Math.round(
      ((Math.atan2(x, z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / MUZZLE_FLASH_POINTS),
    )
    const scale = segment % 2 ? 0.45 : 1
    position.setX(i, x * scale)
    position.setZ(i, z * scale)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

/** Deterministic 0…1 value per shot and channel (no state, so every view of a shot agrees). */
function shotRandom(shotMs: number, channel: number): number {
  let h = Math.imul(Math.floor(shotMs * 16) ^ (channel * 0x9e3779b9), 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/**
 * Per-shot variation of the flash: a random roll of the star, length 0.75–1.45× and width
 * 0.8–1.25×, and an opacity that drops over its 60 ms. `base` is the flash's resting opacity.
 */
export function shapeMuzzleFlash(
  flash: THREE.Mesh,
  shotMs: number,
  age: number,
  base: number,
): void {
  const width = 0.8 + 0.45 * shotRandom(shotMs, 1)
  flash.scale.set(width, 0.75 + 0.7 * shotRandom(shotMs, 2), width)
  flash.rotation.y = shotRandom(shotMs, 3) * Math.PI * 2
  const material = flash.material as THREE.MeshBasicMaterial
  const fade = age >= 0 && age < 60 ? 1 - (age / 60) * 0.6 : 1
  material.opacity = Math.min(1, base * fade * (0.85 + 0.3 * shotRandom(shotMs, 4)))
}
