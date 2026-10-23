import * as THREE from 'three'
import { addWebGPUMaterialNodes } from '../webgpu-substitutes.js'
import { riverWaveNodes } from './surface-nodes.js'
import { softDepth, softUniforms } from '../entity/soft-smoke.js'
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
  addWebGPUMaterialNodes(material, (kit, twin) =>
    riverWaveNodes(twin as never, kit, texture, time, offset),
  )
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

/**
 * Water thickness from the opaque depth copy (WebGL only): Beer-Lambert opacity over the metres
 * of water the view ray crosses before the scene behind it. The draped bed sits on the surface
 * (thickness ~0) and stays opaque, as before; something sunk below it (a vehicle) shows through,
 * tinted by the water and fading out with depth and with distance. Without the copy (first
 * frame, WebGPU, a failed blit) the water stays opaque. Call after {@link waterWaves}.
 */
export function waterThickness(material: THREE.MeshStandardMaterial): void {
  const key = material.customProgramCacheKey
  const compile = material.onBeforeCompile
  material.customProgramCacheKey = () => `${key.call(material)}-thick-v1`
  // After the opaque list and the depth copy; still writes depth for the transparents after it.
  material.transparent = true
  material.depthWrite = true
  // One draw, not a back then front pass.
  material.forceSinglePass = true
  const before = material.onBeforeRender
  material.onBeforeRender = function (...args) {
    softDepth.mark()
    before.apply(this, args)
  }
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer)
    shader.uniforms.softDepth = softUniforms.softDepth
    shader.uniforms.softState = softUniforms.softState
    shader.uniforms.softCamera = softUniforms.softCamera
    shader.fragmentShader =
      'uniform sampler2D softDepth; uniform vec2 softState; uniform vec4 softCamera;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\n' + THICKNESS_FRAGMENT,
      )
  }
}

/** Absorption per metre of path, the floor once something shows, and where it fades out. */
const THICKNESS_FRAGMENT = /* glsl */ `
{
  float waterAlpha = 1.0;
  if (softState.x > 0.5) {
    float d = texture2D(softDepth, gl_FragCoord.xy * softCamera.zw).x;
    float waterZ = vViewPosition.z;
    if (d < 1.0 && waterZ > 0.0) {
      float sceneZ;
      if (softState.y > 0.5) sceneZ = exp2(d * log2(softCamera.y + 1.0)) - 1.0;
      else { float n = softCamera.x, f = softCamera.y; sceneZ = (n * f) / (f - d * (f - n)); }
      // Metres along the view ray, not along z.
      float path = max(sceneZ - waterZ, 0.0) * length(vViewPosition) / waterZ;
      float beer = 1.0 - exp(-path * 1.1);
      // The coplanar bed (draped polygons, depth noise) and far water stay as they were.
      float shallow = smoothstep(0.1, 0.35, path) * (1.0 - smoothstep(120.0, 220.0, waterZ));
      waterAlpha = mix(1.0, max(beer, 0.45), shallow);
    }
  }
  gl_FragColor.a *= waterAlpha;
}`
