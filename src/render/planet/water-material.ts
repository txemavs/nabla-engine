import * as THREE from 'three'
/** The river's three drifting normal samples, shared with the sea. No reflection pass.
 * Adapted from Streets GL (MIT); assets/licenses/streets-gl-MIT.txt.
 */
export function waterWaves(
  material: THREE.MeshStandardMaterial,
  texture: THREE.Texture,
  time: { value: number },
  offset?: { value: THREE.Vector3 },
): void {
  material.customProgramCacheKey = () => `river-waves-v1-${offset ? 'world' : 'local'}`
  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterTime = time
    shader.uniforms.waterNormal = { value: texture }
    shader.uniforms.waterOrigin = offset ?? { value: new THREE.Vector3() }
    shader.vertexShader =
      'varying vec2 waterXZ; uniform vec3 waterOrigin;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nwaterXZ = ' +
          (offset ? '(modelMatrix * vec4(transformed, 1.0)).xz + waterOrigin.xz;' : 'position.xz;'),
      )
    shader.fragmentShader =
      'varying vec2 waterXZ; uniform float waterTime; uniform sampler2D waterNormal;\n' +
      shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
       vec2 waveUV = waterXZ / 256.0;
       float waveTime = waterTime / 256.0;
       vec3 waves = (texture2D(waterNormal, (waveUV+waveTime)*3.0).xyz * 0.25
         + texture2D(waterNormal, (waveUV+waveTime)*16.0).xyz * 0.25
         + texture2D(waterNormal, (waveUV-waveTime)*8.0).xyz * 0.5) * 2.0 - 1.0;
       waves = normalize(mix(waves, vec3(0.0,0.0,1.0),0.9).xzy);
       ${offset ? 'normal = normalize(normal + mat3(viewMatrix) * vec3(waves.x, 0.0, waves.z));' : 'normal = normalize(mat3(viewMatrix) * waves);'}`,
      )
  }
}
