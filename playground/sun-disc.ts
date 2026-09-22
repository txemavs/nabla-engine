import { MeshBasicMaterial, Vector3, Color } from 'three'
/** Angular disc and Gaussian halo adapted from Streets GL, StrandedKitty, MIT.
 * See assets/licenses/streets-gl-MIT.txt. No extra render target or bloom pass. */
export function addSunDisc(material: MeshBasicMaterial, direction: Vector3) {
  const color = { value: new Color('#fff1d0') }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.nablaSun = { value: direction }
    shader.uniforms.nablaSunColor = color
    shader.vertexShader =
      'varying vec3 skyRay;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nskyRay = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;',
      )
    shader.fragmentShader =
      'varying vec3 skyRay; uniform vec3 nablaSun; uniform vec3 nablaSunColor;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `float cosine = dot(normalize(skyRay), normalize(nablaSun));
       float edge = cos(radians(0.265));
       float disc = smoothstep(edge - 0.000002, edge + 0.000002, cosine);
       float halo = exp(-max(0.0, edge - cosine) * 100000.0);
       outgoingLight += nablaSunColor * (disc * 3.0 + halo * 0.3);
       #include <opaque_fragment>`,
      )
  }
  return color
}
