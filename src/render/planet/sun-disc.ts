import { MeshBasicMaterial, Vector3, Color } from 'three'
/** Angular disc and Gaussian halo adapted from Streets GL, StrandedKitty, MIT.
 * See assets/licenses/streets-gl-MIT.txt. No extra render target or bloom pass. */
export function addSunDisc(material: MeshBasicMaterial, direction: Vector3) {
  const color = { value: new Color('#ffffff') }
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
       float edge = cos(radians(0.53));
       float aa = max(fwidth(cosine), 0.000001);
       float disc = smoothstep(edge - aa, edge + aa, cosine);
       float halo = exp(-max(0.0, edge - cosine) * 100000.0);
       float glare = exp(-max(0.0, edge - cosine) * 1800.0);
       outgoingLight += nablaSunColor * (disc * 30.0 + halo * 3.0 + glare * 0.35);
       #include <opaque_fragment>`,
      )
  }
  return color
}
