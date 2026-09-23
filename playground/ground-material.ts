import { SURFACE_LAYERS } from '../src/landcover.js'
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

/** Roads sit above every draped land-use layer, in both editor and batches. */
export const roadDepthBias = {
  polygonOffset: true,
  polygonOffsetFactor: -(Math.max(...Object.values(SURFACE_LAYERS)) + 1),
  polygonOffsetUnits: -(Math.max(...Object.values(SURFACE_LAYERS)) + 1),
}
