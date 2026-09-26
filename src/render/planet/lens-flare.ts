import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three'
/** Screen-space ghosts along the sun, drawn after the world. No extra render target. */
export function createLensFlare(direction: Vector3) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2))
  const material = new ShaderMaterial({
    uniforms: { sunDirection: { value: direction }, aspect: { value: 1 } },
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    fog: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.999, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 sunDirection;
      uniform float aspect;
      uniform mat4 projectionMatrix;
      varying vec2 vUv;
      float blob(vec2 uv, vec2 at, float sharp) {
        vec2 d = (uv - at) * vec2(aspect, 1.0);
        return exp(-dot(d, d) * sharp);
      }
      void main() {
        vec3 viewDir = mat3(viewMatrix) * normalize(sunDirection);
        if (viewDir.z > -0.001 || sunDirection.y < -0.02) discard;
        vec2 ndc = vec2(
          viewDir.x / -viewDir.z * projectionMatrix[0][0],
          viewDir.y / -viewDir.z * projectionMatrix[1][1]
        );
        float radial = length(ndc);
        if (radial > 1.4) discard;
        vec2 sun = ndc * 0.5 + 0.5;
        float aimed = 1.0 - smoothstep(0.15, 0.9, radial);
        float cover = (1.0 - smoothstep(0.95, 1.3, radial)) * mix(0.35, 1.0, aimed);
        vec2 axis = sun - vec2(0.5);
        vec2 across = normalize(vec2(-axis.y, axis.x) * vec2(aspect, 1.0) + vec2(0.0001));
        vec2 rel = (vUv - sun) * vec2(aspect, 1.0);
        float side = dot(rel, across);
        float streak = exp(-side * side * 900.0) * exp(-dot(rel, rel) * 22.0);
        vec3 color = vec3(1.0, 0.94, 0.8) * (blob(vUv, sun, 18.0) * 0.42 + blob(vUv, sun, 5.5) * 0.1 + streak * 0.08);
        gl_FragColor = vec4(color * cover, 1.0);
      }
    `,
  })
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = 1000
  const scene = new Scene()
  scene.add(mesh)
  return {
    scene,
    mesh,
    aspect: material.uniforms.aspect,
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
