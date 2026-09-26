import * as THREE from 'three'

/**
 * Slight far-field blur. The center of the frame stays sharp. Off skips the
 * extra target entirely. Logarithmic depth is decoded with the same scale
 * Three writes into gl_FragDepth.
 */
export class DepthOfField {
  private target: THREE.WebGLRenderTarget | null = null
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.Camera()
  private readonly material: THREE.ShaderMaterial
  private readonly size = new THREE.Vector2()

  constructor() {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    )
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2))
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        colorTex: { value: null },
        depthTex: { value: null },
        texel: { value: new THREE.Vector2(1, 1) },
        cameraFar: { value: 1000 },
        radius: { value: 5 },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D colorTex;
        uniform sampler2D depthTex;
        uniform vec2 texel;
        uniform float cameraFar;
        uniform float radius;
        varying vec2 vUv;
        float viewDistance(float depth) {
          return pow(cameraFar + 1.0, depth) - 1.0;
        }
        void gather(vec2 offset, float dist, float radiusPx, inout vec3 sum, inout float weight) {
          vec2 uv = vUv + offset * radiusPx * texel;
          if (viewDistance(texture2D(depthTex, uv).x) + 0.5 < dist) return;
          sum += texture2D(colorTex, uv).rgb;
          weight += 1.0;
        }
        void main() {
          float dist = viewDistance(texture2D(depthTex, vUv).x);
          float center = viewDistance(texture2D(depthTex, vec2(0.5)).x);
          float coc = smoothstep(center, center * 3.0 + 120.0, dist);
          vec3 color = texture2D(colorTex, vUv).rgb;
          if (coc > 0.02) {
            vec3 sum = color;
            float weight = 1.0;
            float radiusPx = coc * radius;
            gather(vec2(1.0, 0.0), dist, radiusPx, sum, weight);
            gather(vec2(-1.0, 0.0), dist, radiusPx, sum, weight);
            gather(vec2(0.0, 1.0), dist, radiusPx, sum, weight);
            gather(vec2(0.0, -1.0), dist, radiusPx, sum, weight);
            gather(vec2(0.707, 0.707), dist, radiusPx, sum, weight);
            gather(vec2(-0.707, 0.707), dist, radiusPx, sum, weight);
            gather(vec2(0.707, -0.707), dist, radiusPx, sum, weight);
            gather(vec2(-0.707, -0.707), dist, radiusPx, sum, weight);
            color = sum / weight;
          }
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
    })
    const mesh = new THREE.Mesh(geometry, this.material)
    mesh.frustumCulled = false
    this.scene.add(mesh)
  }

  /** Next draws land in the effect buffer. */
  begin(renderer: THREE.WebGLRenderer): void {
    renderer.getDrawingBufferSize(this.size)
    const width = Math.max(1, this.size.x)
    const height = Math.max(1, this.size.y)
    if (!this.target || this.target.width !== width || this.target.height !== height) {
      this.release()
      const depthTexture = new THREE.DepthTexture(width, height)
      this.target = new THREE.WebGLRenderTarget(width, height, {
        depthTexture,
        samples: 4,
      })
      this.target.texture.colorSpace = THREE.SRGBColorSpace
      this.material.uniforms.colorTex.value = this.target.texture
      this.material.uniforms.depthTex.value = depthTexture
      this.material.uniforms.texel.value.set(1 / width, 1 / height)
    }
    renderer.setRenderTarget(this.target)
  }

  /** Draw the blurred frame to the canvas. The caller renders HUD after this. */
  present(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    renderer.setRenderTarget(null)
    this.material.uniforms.cameraFar.value = camera.far
    this.material.uniforms.radius.value = 5 * renderer.getPixelRatio()
    const autoClear = renderer.autoClear
    renderer.autoClear = true
    renderer.render(this.scene, this.camera)
    renderer.autoClear = autoClear
  }

  release(): void {
    this.target?.dispose()
    this.target = null
  }
}
