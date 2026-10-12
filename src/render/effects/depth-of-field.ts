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
        tunnel: { value: 0 },
        farBlur: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: true,
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
        uniform float tunnel;
        uniform float farBlur;
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
          float sides = smoothstep(0.18, 0.49, abs(vUv.x - 0.5));
          float nearField = 1.0 - smoothstep(2.0, 18.0, dist);
          float peripheral = sides * nearField * tunnel;
          float coc = max(farBlur * smoothstep(center, center * 3.0 + 120.0, dist), peripheral);
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
          gl_FragColor = vec4(color, texture2D(colorTex, vUv).a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    })
    const mesh = new THREE.Mesh(geometry, this.material)
    mesh.frustumCulled = false
    this.scene.add(mesh)
  }

  /** Peripheral focus follows the weapon aim animation; ordinary far blur stays optional. */
  setFocus(tunnel: number, farBlur: boolean): void {
    this.material.uniforms.tunnel.value = THREE.MathUtils.clamp(tunnel, 0, 1)
    this.material.uniforms.farBlur.value = farBlur ? 1 : 0
  }

  get depthTexture(): THREE.DepthTexture | null {
    return this.target?.depthTexture ?? null
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
        type: THREE.HalfFloatType,
        samples: 4,
      })
      // Keep scene radiance linear and unclipped; apply display tone mapping exactly once in present().
      this.target.texture.colorSpace = THREE.LinearSRGBColorSpace
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
    try {
      renderer.render(this.scene, this.camera)
    } finally {
      renderer.autoClear = autoClear
    }
  }

  dispose(): void {
    this.release()
    this.material.dispose()
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose()
    })
    this.scene.clear()
  }
  release(): void {
    this.target?.dispose()
    this.target = null
  }
}
