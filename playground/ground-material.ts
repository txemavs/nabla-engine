import { SURFACE_LAYERS } from '../src/planet/land/surface.js'
import * as THREE from 'three'

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

/** Paths sit above the carriageway. Published tiles still store the old lower layer. */
export function liftFootLayer(layer: number): number {
  return layer === firstTransportLayer ? firstTransportLayer + 5 : layer
}

/** Order only coplanar transport surfaces; physical bridge/tunnel heights still apply. */
export function transportLayer(entity: {
  railway?: { part: string }
  source?: { tags?: Record<string, string> }
}): number {
  if (entity.railway) return firstTransportLayer + (entity.railway.part === 'ballast' ? 2 : 3)
  const highway = entity.source?.tags?.highway
  return firstTransportLayer + (highway && footHighways.includes(highway) ? 5 : 1)
}

export function groundDepthBias(layer: number) {
  return {
    polygonOffset: true,
    polygonOffsetFactor: -layer,
    polygonOffsetUnits: -layer,
  }
}
