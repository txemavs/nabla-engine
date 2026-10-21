import * as THREE from 'three'

/**
 * Shared look of the WebGL smoke and fire (the WebGPU backend keeps its legacy sprites):
 *
 * - **Soft particles.** Between the opaque and the transparent passes, one depth blit copies the
 *   frame's depth buffer into a texture ({@link SoftDepth}); smoke, dust and flames fade where
 *   they meet the ground, walls or cars instead of cutting a hard line. No extra scene pass and
 *   no extra draw: a `blitFramebuffer` (a GPU copy) only on frames where a soft effect drew in
 *   the last half second. If the driver refuses the copy (depth format mismatch), particles
 *   stay hard, as before.
 * - **Procedural puffs.** A 4×4 atlas of fbm smoke puffs baked once at load (no asset): density,
 *   light from above through the puff (self-shadow) and light from below (fire), so a flat
 *   sprite reads as a lit volume. Density thresholds erode the puff as it ages.
 * - **Fire.** A tileable noise texture for flames and a black-body colour ramp driven by
 *   temperature.
 */

const TILE = 128
const GRID = 4

function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
/** Tileable value noise with period `period` cells. */
function noise(x: number, y: number, seed: number, period: number): number {
  const xi = Math.floor(x),
    yi = Math.floor(y)
  const fx = x - xi,
    fy = y - yi
  const ux = fx * fx * (3 - 2 * fx),
    uy = fy * fy * (3 - 2 * fy)
  const m = (v: number) => ((v % period) + period) % period
  const a = hash(m(xi), m(yi), seed),
    b = hash(m(xi + 1), m(yi), seed),
    c = hash(m(xi), m(yi + 1), seed),
    d = hash(m(xi + 1), m(yi + 1), seed)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
function fbm(x: number, y: number, seed: number, period: number, octaves: number): number {
  let sum = 0,
    amp = 0.5,
    f = 1,
    norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * f, y * f, seed + o * 17, period * f)
    norm += amp
    amp *= 0.5
    f *= 2
  }
  return sum / norm
}

let atlas: THREE.DataTexture | undefined
let flameNoise: THREE.DataTexture | undefined

/** The baked puff atlas (R density, G light from above, B light from below). */
export function smokeAtlas(): THREE.DataTexture {
  if (atlas) return atlas
  const size = TILE * GRID
  const data = new Uint8Array(size * size * 4)
  const density = new Float32Array(TILE * TILE)
  for (let t = 0; t < GRID * GRID; t++) {
    const ox = (t % GRID) * TILE,
      oy = Math.floor(t / GRID) * TILE
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const u = (x + 0.5) / TILE - 0.5,
          v = (y + 0.5) / TILE - 0.5
        // Domain-warped fbm on a sphere's thickness: cauliflower billows, wispy rims.
        const wx = fbm(u * 3 + 11, v * 3, t * 7 + 1, 64, 3) - 0.5
        const wy = fbm(u * 3, v * 3 + 5, t * 7 + 2, 64, 3) - 0.5
        const n = fbm(u * 5 + wx * 1.6 + t * 3.1, v * 5 + wy * 1.6, t * 7 + 3, 64, 5)
        // Radius warped by the noise: billowed outline, soft falloff (no disc edge).
        const r = Math.hypot(u + wx * 0.25, v + wy * 0.25) * 2 * (0.85 + (n - 0.5) * 0.9)
        const falloff = 1 - smoothstep(0.15, 1, r)
        const edge = Math.max(0, 1 - Math.max(0, Math.hypot(u, v) * 2 - 0.86) / 0.12)
        const detail = fbm(u * 11 + t, v * 11, t * 7 + 4, 64, 3)
        density[y * TILE + x] = Math.min(
          1,
          Math.max(0, falloff * falloff * (0.3 + 0.9 * n + 0.35 * (detail - 0.5)) * edge * 1.25),
        )
      }
    // Light through the puff: optical depth integrated down from the top (y = TILE − 1 is up in
    // texture space, gl_PointCoord flips it in the shader) and up from the bottom.
    for (let x = 0; x < TILE; x++) {
      let fromTop = 0
      const top = new Float32Array(TILE)
      for (let y = TILE - 1; y >= 0; y--) {
        top[y] = fromTop
        fromTop += density[y * TILE + x] * (6 / TILE) * 2.2
      }
      let fromBottom = 0
      for (let y = 0; y < TILE; y++) {
        const d = density[y * TILE + x]
        const i = ((oy + y) * size + ox + x) * 4
        data[i] = Math.round(d * 255)
        data[i + 1] = Math.round(Math.exp(-top[y] * 2.2) * 255)
        data[i + 2] = Math.round(Math.exp(-fromBottom * 2.2) * 255)
        data[i + 3] = 255
        fromBottom += d * (6 / TILE) * 2.2
      }
    }
  }
  atlas = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  atlas.generateMipmaps = true
  atlas.minFilter = THREE.LinearMipmapLinearFilter
  atlas.magFilter = THREE.LinearFilter
  atlas.needsUpdate = true
  atlas.name = 'Procedural smoke atlas'
  return atlas
}

/** Tileable fbm noise (R, G two decorrelated layers) for flames. */
export function fireNoise(): THREE.DataTexture {
  if (flameNoise) return flameNoise
  const size = 128
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      data[i] = Math.round(fbm((x / size) * 8, (y / size) * 8, 5, 8, 4) * 255)
      data[i + 1] = Math.round(fbm((x / size) * 8, (y / size) * 8, 9, 8, 4) * 255)
      data[i + 2] = 0
      data[i + 3] = 255
    }
  flameNoise = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  flameNoise.wrapS = flameNoise.wrapT = THREE.RepeatWrapping
  flameNoise.generateMipmaps = true
  flameNoise.minFilter = THREE.LinearMipmapLinearFilter
  flameNoise.magFilter = THREE.LinearFilter
  flameNoise.needsUpdate = true
  flameNoise.name = 'Procedural flame noise'
  return flameNoise
}

/** Uniforms shared by every soft smoke/fire material (same objects, so one update serves all). */
export const softUniforms = {
  softDepth: { value: null as THREE.Texture | null },
  /** x 1 when the depth texture holds this pass's depth, y 1 for a logarithmic depth buffer. */
  softState: { value: new THREE.Vector2(0, 0) },
  /** near, far, 1/width, 1/height of the depth texture. */
  softCamera: { value: new THREE.Vector4(0.1, 1000, 1, 1) },
  smokeAtlas: { value: null as THREE.Texture | null },
  fireNoise: { value: null as THREE.Texture | null },
}

/** Fill the textures lazily (bakes the atlas on first use, ~tens of ms, once). */
export function softSmokeUniforms(): typeof softUniforms {
  softUniforms.smokeAtlas.value ??= smokeAtlas()
  softUniforms.fireNoise.value ??= fireNoise()
  return softUniforms
}

/** Vertex side: pass the view depth (`mvPosition` must be the view-space position). */
export const SOFT_VERTEX_PARS = /* glsl */ `varying float vSoftZ;`
export const softVertex = (mv: string) => /* glsl */ `vSoftZ = -(${mv}).z;`

/** Fragment helpers. */
export const SOFT_FRAGMENT_PARS = /* glsl */ `
varying float vSoftZ;
uniform sampler2D softDepth; uniform vec2 softState; uniform vec4 softCamera;
uniform sampler2D smokeAtlas; uniform sampler2D fireNoise;
/** 0 where the particle touches the scene behind it, 1 once \`softness\` metres in front. */
float nablaSoft(float softness){
  if (softState.x < 0.5) return 1.0;
  float d = texture2D(softDepth, gl_FragCoord.xy * softCamera.zw).x;
  if (d >= 1.0) return 1.0;
  float sceneZ;
  if (softState.y > 0.5) sceneZ = exp2(d * log2(softCamera.y + 1.0)) - 1.0;
  else { float n = softCamera.x, f = softCamera.y; sceneZ = (n * f) / (f - d * (f - n)); }
  float gap = sceneZ - vSoftZ;
  // Negative: the copy holds a nearer surface than this fragment. Only multisampled edges get
  // here (the depth test drops truly hidden fragments); keep them, no halo around silhouettes.
  return gap < 0.0 ? 1.0 : clamp(gap / softness, 0.0, 1.0);
}
/** Puff texel from the atlas: point coordinate, seed (0..1) picks a tile and a rotation. */
vec4 nablaPuff(vec2 pc, float seed, float spin){
  float a = seed * 6.2831 + spin;
  vec2 q = pc - 0.5;
  q = vec2(cos(a) * q.x - sin(a) * q.y, sin(a) * q.x + cos(a) * q.y);
  if (dot(q, q) > 0.25) return vec4(0.0);
  float tile = floor(seed * 16.0);
  vec2 cell = vec2(mod(tile, 4.0), floor(tile / 4.0));
  // Up in the atlas is +v; gl_PointCoord.y grows downward.
  vec2 uv = (cell + vec2(q.x, -q.y) + 0.5) / 4.0;
  return texture2D(smokeAtlas, uv);
}
/**
 * Grey smoke sprite: puff from the atlas eroding with age \`k\` (0..1), lit from above through
 * itself, faded softly against the scene. Straight alpha (rgb, a).
 */
vec4 nablaSmoke(vec3 tint, float alpha, float k, float seed, float spin, float softness){
  vec4 p = nablaPuff(gl_PointCoord, seed, spin);
  float e = 0.02 + 0.3 * k;
  float shape = clamp((p.r - e) * 2.4, 0.0, 1.0);
  return vec4(tint * mix(0.62, 1.18, p.g), alpha * shape * 1.15 * nablaSoft(softness));
}
/** Approximate black body: dull red at t=0.25, orange, yellow, white-yellow at t=1; HDR. */
vec3 nablaBlackbody(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 c = vec3(1.0, smoothstep(0.15, 0.85, t) * 0.88 + 0.04, smoothstep(0.55, 1.0, t) * 0.75 + 0.01);
  return c * (t * t * 4.5);
}
`

/**
 * One depth blit per pass between the opaque and transparent lists. Add {@link grabber} to the
 * scene; consumers call {@link mark} from their material's `onBeforeRender`.
 */
export class SoftDepth {
  readonly grabber: THREE.Mesh
  private targets: THREE.WebGLRenderTarget[] = []
  /** Formats tried in order; the first the driver blits into wins. */
  private formats: [THREE.TextureDataType, THREE.DepthTexturePixelFormat][] = [
    [THREE.UnsignedInt248Type, THREE.DepthStencilFormat],
    [THREE.UnsignedIntType, THREE.DepthFormat],
    [THREE.FloatType, THREE.DepthFormat],
  ]
  private failed = false
  private lastUse = -Infinity
  /** Blits done (diagnostics and benchmarks). */
  blits = 0
  constructor() {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
    geometry.setDrawRange(0, 0)
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
    this.grabber = new THREE.Mesh(geometry, material)
    this.grabber.name = 'Soft particle depth copy'
    this.grabber.frustumCulled = false
    // First of the transparent list: the opaque depth is complete, no particle has drawn yet.
    this.grabber.renderOrder = -1e9
    this.grabber.raycast = () => undefined
    // Reachable from the scene graph for diagnostics and benchmarks.
    this.grabber.userData.softDepth = this
    this.grabber.onBeforeRender = (renderer, _scene, camera) => this.grab(renderer, camera)
  }
  /** A soft consumer is drawing; keeps the blit on for the next half second. */
  mark(): void {
    this.lastUse = performance.now()
  }
  private grab(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const state = softUniforms.softState.value
    state.x = 0
    if (this.failed || (camera as THREE.ArrayCamera).isArrayCamera) return
    if (performance.now() - this.lastUse > 500) return
    const gl = renderer.getContext() as WebGL2RenderingContext
    if (!(gl instanceof WebGL2RenderingContext)) return
    const target = renderer.getRenderTarget()
    let width: number, height: number
    let source: WebGLFramebuffer | null = null
    const props = renderer.properties as unknown as {
      get(o: object): {
        __webglFramebuffer?: WebGLFramebuffer
        __webglMultisampledFramebuffer?: WebGLFramebuffer
      }
    }
    if (target) {
      if (!target.depthBuffer) return
      width = target.width
      height = target.height
      const p = props.get(target)
      source = p.__webglMultisampledFramebuffer ?? p.__webglFramebuffer ?? null
      if (!source || Array.isArray(source)) return
    } else {
      width = gl.drawingBufferWidth
      height = gl.drawingBufferHeight
    }
    let rt = this.targets.find((t) => t.width === width && t.height === height)
    if (!rt) {
      const [type, format] = this.formats[0]
      rt = new THREE.WebGLRenderTarget(width, height, {
        depthBuffer: true,
        stencilBuffer: format === THREE.DepthStencilFormat,
        depthTexture: new THREE.DepthTexture(width, height, type),
      })
      rt.depthTexture!.format = format
      rt.depthTexture!.minFilter = rt.depthTexture!.magFilter = THREE.NearestFilter
      renderer.initRenderTarget(rt)
      this.targets.push(rt)
      // Several passes (mirrors, portals, main) at different sizes: keep a few.
      if (this.targets.length > 4) this.targets.shift()!.dispose()
    }
    const destination = props.get(rt).__webglFramebuffer
    if (!destination) return
    const scissor = gl.isEnabled(gl.SCISSOR_TEST)
    if (scissor) gl.disable(gl.SCISSOR_TEST)
    while (gl.getError() !== gl.NO_ERROR) {
      /* clear stale errors */
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, source)
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destination)
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.DEPTH_BUFFER_BIT, gl.NEAREST)
    const error = gl.getError()
    gl.bindFramebuffer(gl.FRAMEBUFFER, source)
    if (scissor) gl.enable(gl.SCISSOR_TEST)
    if (error !== gl.NO_ERROR) {
      // Try the next depth format; give up (hard particles, as before) when none works.
      this.targets.splice(this.targets.indexOf(rt), 1)
      rt.dispose()
      this.formats.shift()
      if (!this.formats.length) this.failed = true
      return
    }
    this.blits++
    softUniforms.softDepth.value = rt.depthTexture
    const cam = camera as THREE.PerspectiveCamera
    softUniforms.softCamera.value.set(cam.near ?? 0.1, cam.far ?? 1000, 1 / width, 1 / height)
    state.set(1, renderer.capabilities.logarithmicDepthBuffer ? 1 : 0)
  }
  dispose(): void {
    for (const t of this.targets) t.dispose()
    this.targets = []
    this.grabber.geometry.dispose()
    ;(this.grabber.material as THREE.Material).dispose()
  }
}

/** The page's shared depth copy (one per renderer is enough; the game has one). */
export const softDepth = new SoftDepth()

/** Mark the soft depth as needed whenever `material` draws. */
export function softConsumer<M extends THREE.Material>(material: M): M {
  const before = material.onBeforeRender
  material.onBeforeRender = function (...args) {
    softDepth.mark()
    before.apply(this, args)
  }
  return material
}
