import * as THREE from 'three'
import { cullOffscreen, pixelsToWorld, SpawnBounds } from './effect-culling.js'
import { NEVER } from './gpu-particles.js'
import {
  SOFT_FRAGMENT_PARS,
  SOFT_VERTEX_PARS,
  softConsumer,
  softSmokeUniforms,
  softVertex,
} from './soft-smoke.js'

/**
 * Analytic GPU explosions (WebGL): fireball, rising smoke, ground shockwave dust, embers, hot
 * metal and dirt chunks and glass shards. Every particle's spawn data is written once, when it is
 * born, and the vertex shader evaluates where it is and how hot it is from its age; JS only
 * advances one clock per frame and uploads the newly written slots (`addUpdateRange`).
 *
 * Three draws in total, whatever the number of explosions:
 * - one premultiplied point draw for fireball, smoke, dust and embers (light adds, smoke covers);
 * - one lit instanced draw for metal/dirt chunks (ballistic, two ground bounces, slide to rest,
 *   glowing while hot, sinking away at the end of their life);
 * - one transparent instanced draw for glass shards.
 *
 * The clock is epoch-relative in float; on a rebase every live birth is rewritten and the whole
 * buffer is uploaded (a partial upload there would revive old particles).
 */

const MAX_PUFFS = 768
const MAX_CHUNKS = 192
const MAX_SHARDS = 96
const SHARDS_PER_PANE = 24
const SHARD_LIFE = 1.5
const SHARD_RADIUS = 0.035
const CHUNK_LIFE = 14
const PUFF_LIFE_MAX = 9
const EPOCH_SECONDS = 60

/** Particle kinds in the point draw. */
const FIREBALL = 0,
  DUST = 1,
  EMBER = 2,
  SMOKE = 3

const PUFF_VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
#include <fog_pars_vertex>
attribute vec3 puffVelocity; attribute vec4 puffData; attribute vec2 puffExtra;
uniform float fxNow; uniform float pixelScale;
varying vec3 vEmit; varying vec4 vCover; varying float vSeed; varying float vKind;
varying float vT; varying float vK; varying float vAge; varying float vSize;
${SOFT_VERTEX_PARS}
void main(){
  // puffData: birth (s, epoch-relative), life (s), size (m), kind. puffExtra: seed, ground y.
  float age = fxNow - puffData.x;
  float life = puffData.y;
  if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float k = age / life;
  float kind = puffData.w, seed = puffExtra.x;
  vKind = kind; vSeed = seed; vK = k; vAge = age; vT = 0.0;
  vec3 p = position;
  float size = puffData.z;
  vEmit = vec3(0.0); vCover = vec4(0.0);
  if (kind < 0.5) {
    // Fireball: fast outward burst braked by drag, buoyant rise, cooling from a white-hot core
    // through orange and deep red to sooty smoke that keeps rolling upward.
    float d = 3.2;
    p += puffVelocity * (1.0 - exp(-d * age)) / d + vec3(0.0, 0.7 * age + 0.12 * age * age, 0.0);
    size *= 0.35 + 1.25 * (1.0 - exp(-6.0 * age)) + 0.45 * age;
    float T = exp(-age / (0.22 + 0.22 * seed));
    vec3 hot = vec3(1.0, 0.93, 0.72) * 4.0;
    vec3 orange = vec3(1.0, 0.45, 0.09) * 2.2;
    vec3 red = vec3(0.55, 0.08, 0.02) * 1.0;
    vec3 c = T > 0.55 ? mix(orange, hot, (T - 0.55) / 0.45) : mix(red, orange, T / 0.55);
    vEmit = c * smoothstep(0.02, 0.25, T) * (1.0 - k);
    vT = T * (1.0 - k * 0.5);
    float soot = smoothstep(0.75, 0.15, T);
    vCover = vec4(vec3(0.07, 0.065, 0.06), 0.82 * soot * pow(1.0 - k, 1.3));
  } else if (kind < 1.5) {
    // Shockwave dust: a ring racing out along the ground, braked hard, billowing and settling.
    float d = 3.8;
    p += puffVelocity * (1.0 - exp(-d * age)) / d + vec3(0.0, 0.18 * age, 0.0);
    size *= 0.4 + 2.2 * sqrt(k);
    vCover = vec4(vec3(0.40, 0.35, 0.29), 0.62 * smoothstep(0.0, 0.04, k) * (1.0 - k) * (1.0 - k));
  } else if (kind < 2.5) {
    // Embers: small hot specks thrown ballistically, cooling, resting on the ground.
    float d = 0.9;
    p += puffVelocity * (1.0 - exp(-d * age)) / d;
    p.y -= 4.9 * age * age * 0.55;
    p.y = max(p.y, puffExtra.y + 0.01);
    float T = 1.0 - k;
    float flicker = 0.75 + 0.25 * sin(age * (40.0 + 30.0 * seed) + seed * 17.0);
    vEmit = mix(vec3(0.6, 0.06, 0.01), vec3(1.0, 0.6, 0.18) * 3.0, T * T) * flicker * smoothstep(0.0, 0.2, T);
  } else {
    // Smoke column fed by the blast: dark, slow, big, drifting up.
    float d = 1.2;
    p += puffVelocity * (1.0 - exp(-d * age)) / d + vec3(0.0, 0.85 * age, 0.0);
    size *= 0.5 + 2.2 * sqrt(k);
    vCover = vec4(vec3(0.06, 0.058, 0.055), 0.6 * smoothstep(0.0, 0.12, k) * (1.0 - k));
    // Its base glows from the fire below for the first instants.
    vEmit = vec3(0.6, 0.18, 0.04) * exp(-age / 0.5) * 0.6;
  }
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  float px = size * pixelScale / max(0.05, -view.z);
  // Embers never shrink under ~1.6 px; their light dims instead (no shimmering dots).
  if (kind > 1.5 && kind < 2.5 && px < 1.6) { vEmit *= px / 1.6; px = 1.6; }
  gl_Position = projectionMatrix * view;
  gl_PointSize = px;
  vSize = size;
  ${softVertex('view')}
  #include <logdepthbuf_vertex>
  vec4 mvPosition = view;
  #include <fog_vertex>
}
`
const PUFF_FRAGMENT = /* glsl */ `
varying vec3 vEmit; varying vec4 vCover; varying float vSeed; varying float vKind;
varying float vT; varying float vK; varying float vAge; varying float vSize;
#include <common>
#include <logdepthbuf_pars_fragment>
#include <fog_pars_fragment>
${SOFT_FRAGMENT_PARS}
void main(){
  #include <logdepthbuf_fragment>
  vec3 rgb; float a;
  if (vKind > 1.5 && vKind < 2.5) {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    float soft = pow(1.0 - r, 2.0);
    rgb = vEmit * soft; a = 0.0;
  } else {
    // Procedural puff: density erodes with age, lit from above through itself, from below by fire.
    vec4 puff = nablaPuff(gl_PointCoord, vSeed, vAge * (vSeed - 0.5) * 0.6);
    float erosion = vKind < 0.5 ? 0.02 + 0.3 * vK : 0.02 + 0.35 * vK;
    float shape = clamp((puff.r - erosion) * 2.2, 0.0, 1.0);
    if (shape <= 0.001) discard;
    float soft = nablaSoft(max(0.15, vSize * 0.4));
    shape *= soft;
    float sky = mix(0.45, 1.3, puff.g);
    vec3 glow = vEmit * puff.b * 0.8;
    vec3 emit = vKind < 0.5 ? nablaBlackbody(vT * (0.62 + 0.7 * puff.r)) * smoothstep(0.03, 0.2, vT) : glow;
    a = vCover.a * shape;
    rgb = vCover.rgb * sky * a + emit * shape * (vKind < 0.5 ? 1.0 - 0.6 * vK : 1.0) + (vKind < 0.5 ? glow * a : vec3(0.0));
  }
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    rgb = mix(rgb, fogColor * a, fogFactor);
  #endif
  gl_FragColor = vec4(rgb, a);
}
`

/** Ballistic path with two ground bounces and a friction slide to rest (GLSL, seconds). */
const CHUNK_GLSL = /* glsl */ `
attribute vec3 chunkOrigin; attribute vec3 chunkVelocity; attribute vec4 chunkData; attribute vec4 chunkSpin;
uniform float fxNow;
varying float vHot;
vec3 nablaChunkPath(vec3 p0, vec3 v0, float groundY, float t, out float tRest){
  vec3 p = p0; vec3 v = v0; float left = t; tRest = 1e9;
  float spent = 0.0;
  for (int b = 0; b < 3; b++) {
    float h = max(0.0, p.y - groundY);
    float hit = (v.y + sqrt(v.y * v.y + 19.6 * h)) / 9.8;
    if (left <= hit) {
      return vec3(p.x + v.x * left, p.y + v.y * left - 4.9 * left * left, p.z + v.z * left);
    }
    p += vec3(v.x * hit, 0.0, v.z * hit); p.y = groundY;
    float vy = v.y - 9.8 * hit;
    v = vec3(v.x * 0.55, -vy * 0.32, v.z * 0.55);
    left -= hit; spent += hit;
    if (v.y < 0.6) break;
  }
  // Slide on the ground with friction 6 m/s^2, then rest.
  float sp = length(v.xz);
  float stopT = sp / 6.0;
  float s = min(left, stopT);
  vec2 dir = sp > 1e-4 ? v.xz / sp : vec2(0.0);
  vec2 xz = p.xz + dir * (sp * s - 3.0 * s * s);
  tRest = spent + stopT;
  return vec3(xz.x, groundY, xz.y);
}
mat3 nablaAxisAngle(vec3 axis, float angle){
  float c = cos(angle), s = sin(angle), t = 1.0 - c;
  vec3 a = normalize(axis);
  return mat3(t*a.x*a.x + c, t*a.x*a.y + s*a.z, t*a.x*a.z - s*a.y,
              t*a.x*a.y - s*a.z, t*a.y*a.y + c, t*a.y*a.z + s*a.x,
              t*a.x*a.z + s*a.y, t*a.y*a.z - s*a.x, t*a.z*a.z + c);
}
`

type Vec3 = THREE.Vector3

const scratch = new THREE.Vector2()
const dir = new THREE.Vector3()

export class ExplosionEffects {
  readonly root = new THREE.Group()
  private readonly now = { value: 0 }
  private readonly pixelScale = { value: 600 }
  /** Seconds since construction (double) and the float epoch the shaders count from. */
  private clock = 0
  private epoch = 0

  private readonly puffOrigins = new Float32Array(MAX_PUFFS * 3)
  private readonly puffVelocities = new Float32Array(MAX_PUFFS * 3)
  private readonly puffData = new Float32Array(MAX_PUFFS * 4).fill(0)
  private readonly puffExtra = new Float32Array(MAX_PUFFS * 2)
  private readonly puffBirths = new Float64Array(MAX_PUFFS).fill(-Infinity)
  private readonly puffGeometry = new THREE.BufferGeometry()
  private readonly puffs: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  private puffNext = 0
  private puffDirty: [number, number] | null = null

  private readonly chunkOrigins = new Float32Array(MAX_CHUNKS * 3)
  private readonly chunkVelocities = new Float32Array(MAX_CHUNKS * 3)
  private readonly chunkData = new Float32Array(MAX_CHUNKS * 4)
  private readonly chunkSpin = new Float32Array(MAX_CHUNKS * 4)
  private readonly chunkBirths = new Float64Array(MAX_CHUNKS).fill(-Infinity)
  private readonly chunkGeometry = new THREE.InstancedBufferGeometry()
  private readonly chunkMaterial: THREE.MeshStandardMaterial
  private readonly chunks: THREE.Mesh
  private chunkNext = 0
  private chunkDirty: [number, number] | null = null

  private readonly shardOrigins = new Float32Array(MAX_SHARDS * 3)
  private readonly shardVelocities = new Float32Array(MAX_SHARDS * 3)
  private readonly shardData = new Float32Array(MAX_SHARDS * 2)
  private readonly shardBirths = new Float64Array(MAX_SHARDS).fill(-Infinity)
  private readonly shardGeometry = new THREE.InstancedBufferGeometry()
  private readonly shardMaterial: THREE.MeshBasicMaterial
  private readonly shards: THREE.Mesh
  private shardNext = 0
  private shardDirty: [number, number] | null = null

  private readonly puffBounds = new SpawnBounds(PUFF_LIFE_MAX)
  private readonly chunkBounds = new SpawnBounds(CHUNK_LIFE)
  private readonly shardBounds = new SpawnBounds(SHARD_LIFE)

  constructor() {
    this.root.name = 'Explosion effects'
    this.root.raycast = () => undefined
    for (let i = 0; i < MAX_PUFFS; i++) this.puffData[i * 4] = NEVER
    for (let i = 0; i < MAX_CHUNKS; i++) this.chunkData[i * 4] = NEVER
    for (let i = 0; i < MAX_SHARDS; i++) this.shardData[i * 2] = NEVER

    const pg = this.puffGeometry
    pg.setAttribute('position', dynamic(new THREE.BufferAttribute(this.puffOrigins, 3)))
    pg.setAttribute('puffVelocity', dynamic(new THREE.BufferAttribute(this.puffVelocities, 3)))
    pg.setAttribute('puffData', dynamic(new THREE.BufferAttribute(this.puffData, 4)))
    pg.setAttribute('puffExtra', dynamic(new THREE.BufferAttribute(this.puffExtra, 2)))
    pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity)
    this.puffs = new THREE.Points(
      pg,
      new THREE.ShaderMaterial({
        uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...softSmokeUniforms() },
        vertexShader: PUFF_VERTEX,
        fragmentShader: PUFF_FRAGMENT,
        transparent: true,
        depthWrite: false,
        fog: true,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        toneMapped: false,
      }),
    )
    softConsumer(this.puffs.material)
    this.puffs.material.uniforms.fxNow = this.now
    this.puffs.material.uniforms.pixelScale = this.pixelScale
    this.puffs.name = 'Explosion fire, smoke and dust'

    // Chunks: one irregular low-poly rock-like solid, non-uniformly scaled per instance.
    const base = new THREE.DodecahedronGeometry(1, 0)
    const cg = this.chunkGeometry
    cg.index = base.index
    for (const name of ['position', 'normal'] as const)
      cg.setAttribute(name, base.getAttribute(name))
    cg.setAttribute(
      'chunkOrigin',
      dynamicI(new THREE.InstancedBufferAttribute(this.chunkOrigins, 3)),
    )
    cg.setAttribute(
      'chunkVelocity',
      dynamicI(new THREE.InstancedBufferAttribute(this.chunkVelocities, 3)),
    )
    cg.setAttribute('chunkData', dynamicI(new THREE.InstancedBufferAttribute(this.chunkData, 4)))
    cg.setAttribute('chunkSpin', dynamicI(new THREE.InstancedBufferAttribute(this.chunkSpin, 4)))
    cg.instanceCount = MAX_CHUNKS
    cg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity)
    this.chunkMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.85,
      metalness: 0.25,
      flatShading: true,
    })
    this.chunkMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.fxNow = this.now
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${CHUNK_GLSL}\nvarying vec3 vChunkTint;`)
        .replace(
          '#include <beginnormal_vertex>',
          `// chunkData: birth (s), ground y, size (m), kind (0 metal, 1 dirt). chunkSpin: axis, rad/s.
          float chunkAge = fxNow - chunkData.x;
          bool chunkAlive = chunkAge >= 0.0 && chunkAge <= ${CHUNK_LIFE.toFixed(1)};
          float chunkRest;
          vec3 chunkAt = nablaChunkPath(chunkOrigin, chunkVelocity, chunkData.y, max(0.0, chunkAge), chunkRest);
          float seed = fract(chunkSpin.w * 7.31);
          mat3 chunkRot = nablaAxisAngle(chunkSpin.xyz, chunkSpin.w * min(chunkAge, chunkRest) + seed * 6.0);
          vec3 chunkScale = chunkData.z * vec3(1.0, 0.45 + 0.4 * seed, 0.7 + 0.3 * fract(seed * 3.7));
          vec3 objectNormal = chunkRot * normalize(normal / chunkScale);
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(tangent.xyz);
          #endif`,
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = chunkRot * (position * chunkScale) + chunkAt;
          // Rests a moment flat on the ground, then sinks away over the last second.
          transformed.y -= chunkData.z * 2.0 * smoothstep(${(CHUNK_LIFE - 1.2).toFixed(1)}, ${CHUNK_LIFE.toFixed(1)}, chunkAge);
          if (!chunkAlive) transformed = vec3(0.0, -1e5, 0.0);
          // Metal glows from the blast and cools over ~4 s; dirt never glows.
          vHot = chunkData.w < 0.5 ? exp(-chunkAge / (1.2 + 1.5 * seed)) : 0.0;
          vChunkTint = chunkData.w < 0.5 ? vec3(0.16, 0.15, 0.145) * (0.7 + 0.6 * seed) : vec3(0.23, 0.19, 0.15) * (0.8 + 0.4 * seed);`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying float vHot; varying vec3 vChunkTint;',
        )
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.rgb *= vChunkTint;',
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance += mix(vec3(0.5, 0.05, 0.01), vec3(1.0, 0.45, 0.12) * 2.5, vHot * vHot) * smoothstep(0.03, 0.3, vHot);`,
        )
    }
    this.chunkMaterial.customProgramCacheKey = () => 'explosion-chunks-v1'
    this.chunks = new THREE.Mesh(cg, this.chunkMaterial)
    this.chunks.name = 'Explosion chunks'

    // Glass: the former tetrahedra, now evaluated on the GPU (same motion and spin).
    const tetra = new THREE.TetrahedronGeometry(SHARD_RADIUS)
    const sg = this.shardGeometry
    sg.setAttribute('position', tetra.getAttribute('position'))
    sg.setAttribute('normal', tetra.getAttribute('normal'))
    sg.setAttribute(
      'shardOrigin',
      dynamicI(new THREE.InstancedBufferAttribute(this.shardOrigins, 3)),
    )
    sg.setAttribute(
      'shardVelocity',
      dynamicI(new THREE.InstancedBufferAttribute(this.shardVelocities, 3)),
    )
    sg.setAttribute('shardData', dynamicI(new THREE.InstancedBufferAttribute(this.shardData, 2)))
    sg.instanceCount = MAX_SHARDS
    sg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity)
    this.shardMaterial = new THREE.MeshBasicMaterial({
      color: '#b8e5ff',
      transparent: true,
      opacity: 0.65,
    })
    this.shardMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.fxNow = this.now
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec3 shardOrigin; attribute vec3 shardVelocity; attribute vec2 shardData;
          uniform float fxNow;
          mat3 nablaEulerXYZ(vec3 r){
            float a = cos(r.x), b = sin(r.x), c = cos(r.y), d = sin(r.y), e = cos(r.z), f = sin(r.z);
            float ae = a * e, af = a * f, be = b * e, bf = b * f;
            return mat3(c * e, af + be * d, bf - ae * d,  -c * f, ae - bf * d, be + af * d,  d, -b * c, a * c);
          }`,
        )
        .replace(
          '#include <begin_vertex>',
          `float shardAge = fxNow - shardData.x;
          vec3 transformed = nablaEulerXYZ(vec3(shardAge * 8.0, shardData.y, shardAge * 5.0)) * position
            + shardOrigin + shardVelocity * shardAge - vec3(0.0, 4.9 * shardAge * shardAge, 0.0);
          if (shardAge < 0.0 || shardAge > ${SHARD_LIFE.toFixed(2)}) transformed = vec3(0.0, -1e5, 0.0);`,
        )
    }
    this.shardMaterial.customProgramCacheKey = () => 'explosion-shards-v1'
    this.shards = new THREE.Mesh(sg, this.shardMaterial)
    this.shards.name = 'Glass fragments'

    const measure = (renderer: THREE.WebGLRenderer, camera: THREE.Camera) => {
      const height = renderer.getDrawingBufferSize(scratch).y
      const fov = (camera as THREE.PerspectiveCamera).fov ?? 55
      this.pixelScale.value = height / (2 * Math.tan((fov * Math.PI) / 360))
    }
    this.puffs.onBeforeRender = (renderer, _s, camera) => measure(renderer, camera)
    for (const [object, bounds] of [
      [this.puffs, this.puffBounds],
      [this.chunks, this.chunkBounds],
      [this.shards, this.shardBounds],
    ] as const) {
      object.frustumCulled = false
      object.visible = false
      object.renderOrder = 4
      cullOffscreen(object, {
        box: (target) => bounds.unionInto(target),
        pad: (camera, height, distance) => pixelsToWorld(camera, height, distance, 3),
      })
    }
    this.chunks.renderOrder = 0
    this.root.add(this.chunks, this.shards, this.puffs)
  }

  /** Clock in the shaders' float epoch. */
  private rel(t: number): number {
    return Math.fround(t - this.epoch)
  }

  /**
   * A vehicle-sized blast at `center` (scene space) over ground height `groundY`, `scale` times
   * a car. Fireball, smoke column, shockwave dust ring, embers and hot chunks.
   */
  explode(center: Vec3, groundY: number, scale = 1): void {
    this.maybeRebase()
    const t = this.clock
    const s = scale
    // Fireball: ~30 puffs from a small core, up-biased.
    for (let i = 0; i < 30; i++) {
      randomDir(dir, 0.25)
      const speed = (3 + Math.random() * 6) * s
      this.puff(
        FIREBALL,
        center.x + dir.x * 0.3 * s,
        center.y + dir.y * 0.2 * s,
        center.z + dir.z * 0.3 * s,
        dir.x * speed,
        dir.y * speed * 0.8,
        dir.z * speed,
        t + Math.random() * 0.06,
        1.8 + Math.random() * 1.4,
        (1.1 + Math.random() * 0.9) * s,
        groundY,
      )
    }
    // Smoke column: delayed, rising out of the fireball.
    for (let i = 0; i < 22; i++) {
      randomDir(dir, 0.6)
      this.puff(
        SMOKE,
        center.x + dir.x * 0.6 * s,
        center.y + 0.6 * s,
        center.z + dir.z * 0.6 * s,
        dir.x * 1.2 * s,
        0.8 * s,
        dir.z * 1.2 * s,
        t + 0.3 + (i / 22) * 3 + Math.random() * 0.2,
        5 + Math.random() * 3.5,
        (2.2 + Math.random() * 1.4) * s,
        groundY,
      )
    }
    // Shockwave dust: a ring along the ground.
    const ring = 28
    for (let i = 0; i < ring; i++) {
      const a = ((i + Math.random() * 0.5) / ring) * Math.PI * 2
      const speed = (9 + Math.random() * 4) * s
      this.puff(
        DUST,
        center.x + Math.cos(a) * 0.8 * s,
        groundY + 0.25 * s,
        center.z + Math.sin(a) * 0.8 * s,
        Math.cos(a) * speed,
        0.4 + Math.random() * 0.6,
        Math.sin(a) * speed,
        t + 0.02 + Math.random() * 0.04,
        2 + Math.random() * 1.2,
        (1.0 + Math.random() * 0.6) * s,
        groundY,
      )
    }
    // Embers.
    for (let i = 0; i < 48; i++) {
      randomDir(dir, 0.1)
      const speed = (4 + Math.random() * 9) * s
      this.puff(
        EMBER,
        center.x,
        center.y + 0.2 * s,
        center.z,
        dir.x * speed,
        Math.abs(dir.y) * speed + 2,
        dir.z * speed,
        t + Math.random() * 0.15,
        1.2 + Math.random() * 1.8,
        0.035 + Math.random() * 0.03,
        groundY,
      )
    }
    // Chunks: hot metal and torn-up dirt.
    for (let i = 0; i < 22; i++) {
      const dirt = i >= 14
      randomDir(dir, dirt ? 0.55 : 0.3)
      const speed = (dirt ? 3 + Math.random() * 4 : 4 + Math.random() * 7) * s
      this.chunk(
        dirt ? center.x + dir.x * 0.8 * s : center.x + dir.x * 0.4 * s,
        dirt ? groundY + 0.05 : center.y + dir.y * 0.3 * s,
        dirt ? center.z + dir.z * 0.8 * s : center.z + dir.z * 0.4 * s,
        dir.x * speed,
        Math.abs(dir.y) * speed + 1.5,
        dir.z * speed,
        groundY,
        (dirt ? 0.05 + Math.random() * 0.07 : 0.06 + Math.random() * 0.1) * s,
        dirt ? 1 : 0,
        t,
      )
    }
    this.puffBounds.advance(t)
    this.puffBounds.expandSphere(center.x, center.y + 4 * s, center.z, 16 * s)
    this.chunkBounds.advance(t)
    this.chunkBounds.expandSphere(center.x, groundY + 4 * s, center.z, 18 * s)
  }

  glass(point: Vec3, direction: Vec3): void {
    this.maybeRebase()
    const t = this.clock
    for (let i = 0; i < SHARDS_PER_PANE; i++) {
      const slot = this.shardNext++ % MAX_SHARDS
      const o = slot * 3
      this.shardOrigins[o] = point.x
      this.shardOrigins[o + 1] = point.y
      this.shardOrigins[o + 2] = point.z
      this.shardVelocities[o] = direction.x * 1.5 + Math.random() * 3 - 1.5
      this.shardVelocities[o + 1] = direction.y * 1.5 + Math.random() * 2
      this.shardVelocities[o + 2] = direction.z * 1.5 + Math.random() * 3 - 1.5
      this.shardData[slot * 2] = this.rel(t)
      this.shardData[slot * 2 + 1] = slot
      this.shardBirths[slot] = t
      this.shardDirty = grow(this.shardDirty, slot)
    }
    this.shardBounds.advance(t)
    this.shardBounds.expandSphere(point.x, point.y, point.z, 6)
  }

  /** Live glass fragments (tests and tools). */
  get shardsAlive(): number {
    let n = 0
    for (const b of this.shardBirths) if (this.clock - b <= SHARD_LIFE) n++
    return n
  }

  private puff(
    kind: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    birth: number,
    life: number,
    size: number,
    groundY: number,
  ): void {
    const slot = this.puffNext++ % MAX_PUFFS
    const o = slot * 3
    this.puffOrigins[o] = x
    this.puffOrigins[o + 1] = y
    this.puffOrigins[o + 2] = z
    this.puffVelocities[o] = vx
    this.puffVelocities[o + 1] = vy
    this.puffVelocities[o + 2] = vz
    this.puffData[slot * 4] = this.rel(birth)
    this.puffData[slot * 4 + 1] = life
    this.puffData[slot * 4 + 2] = size
    this.puffData[slot * 4 + 3] = kind
    this.puffExtra[slot * 2] = Math.random()
    this.puffExtra[slot * 2 + 1] = groundY
    this.puffBirths[slot] = birth + life
    this.puffDirty = grow(this.puffDirty, slot)
  }

  private chunk(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    groundY: number,
    size: number,
    kind: number,
    birth: number,
  ): void {
    const slot = this.chunkNext++ % MAX_CHUNKS
    const o = slot * 3
    this.chunkOrigins[o] = x
    this.chunkOrigins[o + 1] = Math.max(y, groundY + size)
    this.chunkOrigins[o + 2] = z
    this.chunkVelocities[o] = vx
    this.chunkVelocities[o + 1] = vy
    this.chunkVelocities[o + 2] = vz
    this.chunkData[slot * 4] = this.rel(birth)
    this.chunkData[slot * 4 + 1] = groundY + size * 0.4
    this.chunkData[slot * 4 + 2] = size
    this.chunkData[slot * 4 + 3] = kind
    randomDir(dir, 0)
    this.chunkSpin[slot * 4] = dir.x
    this.chunkSpin[slot * 4 + 1] = dir.y
    this.chunkSpin[slot * 4 + 2] = dir.z
    this.chunkSpin[slot * 4 + 3] = 4 + Math.random() * 10
    this.chunkBirths[slot] = birth
    this.chunkDirty = grow(this.chunkDirty, slot)
  }

  /** Rebase the float epoch past {@link EPOCH_SECONDS}; rewrites every birth (full upload). */
  private maybeRebase(): void {
    if (this.clock - this.epoch < EPOCH_SECONDS) return
    this.epoch = this.clock
    for (let i = 0; i < MAX_PUFFS; i++) {
      const end = this.puffBirths[i]
      this.puffData[i * 4] = end > this.clock ? this.rel(end - this.puffData[i * 4 + 1]) : NEVER
    }
    for (let i = 0; i < MAX_CHUNKS; i++)
      this.chunkData[i * 4] =
        this.clock - this.chunkBirths[i] <= CHUNK_LIFE ? this.rel(this.chunkBirths[i]) : NEVER
    for (let i = 0; i < MAX_SHARDS; i++)
      this.shardData[i * 2] =
        this.clock - this.shardBirths[i] <= SHARD_LIFE ? this.rel(this.shardBirths[i]) : NEVER
    this.puffDirty = [0, MAX_PUFFS - 1]
    this.chunkDirty = [0, MAX_CHUNKS - 1]
    this.shardDirty = [0, MAX_SHARDS - 1]
  }

  update(dt: number): void {
    this.clock += dt
    this.now.value = this.rel(this.clock)
    const t = this.clock
    this.puffBounds.advance(t)
    this.chunkBounds.advance(t)
    this.shardBounds.advance(t)
    this.puffDirty = flush(
      this.puffGeometry,
      ['position', 'puffVelocity', 'puffData', 'puffExtra'],
      this.puffDirty,
    )
    this.chunkDirty = flush(
      this.chunkGeometry,
      ['chunkOrigin', 'chunkVelocity', 'chunkData', 'chunkSpin'],
      this.chunkDirty,
    )
    this.shardDirty = flush(
      this.shardGeometry,
      ['shardOrigin', 'shardVelocity', 'shardData'],
      this.shardDirty,
    )
    // Hide whole draws while nothing of theirs is alive (no GL draw at all).
    this.puffs.visible = live(this.puffBirths, t, 0)
    this.chunks.visible = live(this.chunkBirths, t, CHUNK_LIFE)
    this.shards.visible = live(this.shardBirths, t, SHARD_LIFE)
  }

  clear(): void {
    this.puffBirths.fill(-Infinity)
    this.chunkBirths.fill(-Infinity)
    this.shardBirths.fill(-Infinity)
    for (let i = 0; i < MAX_PUFFS; i++) this.puffData[i * 4] = NEVER
    for (let i = 0; i < MAX_CHUNKS; i++) this.chunkData[i * 4] = NEVER
    for (let i = 0; i < MAX_SHARDS; i++) this.shardData[i * 2] = NEVER
    this.puffDirty = [0, MAX_PUFFS - 1]
    this.chunkDirty = [0, MAX_CHUNKS - 1]
    this.shardDirty = [0, MAX_SHARDS - 1]
    this.puffBounds.clear()
    this.chunkBounds.clear()
    this.shardBounds.clear()
    this.puffs.visible = this.chunks.visible = this.shards.visible = false
  }

  /** Objects to draw once during loading so their programs compile ahead of gameplay. */
  warmObjects(): THREE.Object3D[] {
    return [this.puffs, this.chunks, this.shards]
  }

  dispose(): void {
    this.root.removeFromParent()
    this.puffGeometry.dispose()
    this.puffs.material.dispose()
    this.chunkGeometry.dispose()
    this.chunkMaterial.dispose()
    this.shardGeometry.dispose()
    this.shardMaterial.dispose()
  }
}

function dynamic(a: THREE.BufferAttribute): THREE.BufferAttribute {
  return a.setUsage(THREE.DynamicDrawUsage)
}
function dynamicI(a: THREE.InstancedBufferAttribute): THREE.InstancedBufferAttribute {
  return a.setUsage(THREE.DynamicDrawUsage) as THREE.InstancedBufferAttribute
}
function grow(range: [number, number] | null, slot: number): [number, number] {
  if (!range) return [slot, slot]
  range[0] = Math.min(range[0], slot)
  range[1] = Math.max(range[1], slot)
  return range
}
/** Upload the written slots (one contiguous range per attribute; ring wrap widens it). */
function flush(
  geometry: THREE.BufferGeometry,
  names: string[],
  range: [number, number] | null,
): null {
  if (!range) return null
  for (const name of names) {
    const a = geometry.getAttribute(name) as THREE.BufferAttribute
    a.clearUpdateRanges()
    a.addUpdateRange(range[0] * a.itemSize, (range[1] - range[0] + 1) * a.itemSize)
    a.needsUpdate = true
  }
  return null
}
/** Whether any slot is still alive; `ends` holds births (with `life`) or ends (`life` 0). */
function live(ends: Float64Array, now: number, life: number): boolean {
  for (let i = 0; i < ends.length; i++) if (ends[i] + life >= now) return true
  return false
}
/** Random unit vector, biased upward by `up` (0 uniform). */
function randomDir(out: THREE.Vector3, up: number): THREE.Vector3 {
  const z = Math.random() * 2 - 1
  const a = Math.random() * Math.PI * 2
  const r = Math.sqrt(1 - z * z)
  out.set(r * Math.cos(a), z, r * Math.sin(a))
  out.y = Math.abs(out.y) * (1 - up) + up
  return out.normalize()
}
