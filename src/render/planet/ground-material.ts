import { SURFACE_LAYERS } from '../../planet/land/surface.js'
import * as THREE from 'three'

/**
 * `{ map }` when there is a texture, else `{}`: three.js warns "parameter 'map' has value of undefined"
 * for a key that is present but undefined, once per material.
 */
export function withMap(map: THREE.Texture | undefined): { map?: THREE.Texture } {
  return map ? { map } : {}
}

/**
 * Terrain casts its shadow from the faces turned away from the sun only. A heightfield's sunlit
 * faces then never write into the shadow map, so they cannot shadow themselves (acne: contour
 * stripes on every gentle slope under a low sun), while hills still shade the valleys behind them.
 * Three.js already does this for single-sided materials; double-sided ground (the Atlas LiDAR mesh
 * is exported `doubleSided`) would otherwise write its lit side too. Returns the material.
 */
export function castShadowFromBackFaces<T extends THREE.Material>(material: T): T {
  material.shadowSide = THREE.BackSide
  return material
}

/** Diffuse ground: roughness alone still leaves a broad dielectric sun highlight. */
export function matteGroundMaterial(
  parameters: THREE.MeshStandardMaterialParameters,
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    ...parameters,
    roughness: 1,
    metalness: 0,
    specularIntensity: 0,
    envMapIntensity: 0,
  })
}

const firstTransportLayer = Math.max(...Object.values(SURFACE_LAYERS)) + 1
const footHighways = ['path', 'footway', 'pedestrian', 'cycleway', 'steps', 'track']

/** Carriageways paint white on the GPS. Paths, tracks and rails stay blue. */
export function isChartCarriageway(metadata: {
  groundLayer?: number
  transport?: string
  source?: { tags?: Record<string, string> }
}): boolean {
  if (metadata.transport === 'rail' || metadata.transport === 'ballast') return false
  const highway = metadata.source?.tags?.highway
  if (highway && footHighways.includes(highway)) return false
  if (metadata.groundLayer === firstTransportLayer) return false
  return true
}

/** Feet stay under the carriageway and the rails. 17 is the layer that briefly drew them on top. */
export function liftFootLayer(layer: number): number {
  return layer === firstTransportLayer || layer === firstTransportLayer + 5
    ? firstTransportLayer
    : layer
}

export function footBuried(layer: number): boolean {
  return layer === firstTransportLayer
}

/** Order only coplanar transport surfaces; physical bridge/tunnel heights still apply. */
export function transportLayer(entity: {
  railway?: { part: string }
  source?: { tags?: Record<string, string> }
}): number {
  if (entity.railway) return firstTransportLayer + (entity.railway.part === 'ballast' ? 2 : 3)
  const highway = entity.source?.tags?.highway
  return firstTransportLayer + (highway && footHighways.includes(highway) ? 0 : 1)
}

const carriagewayLayer = firstTransportLayer + 1

/** Delete after the next GLB regen. Bake carriageway `#272c2e` (`#525c60` × 0.48) into COLOR_0. */
export function carriagewayTint(
  metadata: { category?: string; groundLayer?: number; transport?: string },
  tint: string,
): string {
  if (
    metadata.category !== 'Roads' ||
    metadata.transport === 'rail' ||
    metadata.transport === 'ballast' ||
    metadata.groundLayer !== carriagewayLayer
  )
    return tint
  return '#' + new THREE.Color(tint).multiplyScalar(0.48).getHexString()
}

/** Multiply on the roads photo drape (vehicle-paint style). */
export const ROADS_DRAPE_TINT = '#c2c2c2'

export function groundDepthBias(layer: number) {
  return {
    polygonOffset: true,
    polygonOffsetFactor: -layer,
    polygonOffsetUnits: -layer,
  }
}
