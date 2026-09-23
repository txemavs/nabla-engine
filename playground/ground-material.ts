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
