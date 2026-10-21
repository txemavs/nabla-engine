import * as THREE from 'three'
import type { Vec3Tuple } from '../../entity/schema.js'
import { analyticParticles, EPOCH_MS, markRange, NEVER, SPARK_DROP } from './gpu-particles.js'
import { LegacyShotSparks } from './legacy-particles.js'
import { cullOffscreen, pixelsToWorld, SpawnBounds } from './effect-culling.js'

const MAX_BURSTS = 32
/** Streak slots per burst (a metal hit fills them all). */
const PER_BURST = 24
/** Dust and flash slots per burst: slot 0 is the hit flash, the rest dust. */
const PUFF_PER_BURST = 8
/** Longest a spark or puff lives, ms (bounds the "anything alive" check). */
const MAX_LIFE_MS = 900
/** Air drag on the random part of a spark's velocity, 1/s (analytic `v0·e^(−k·t)`). */
export const SPARK_DRAG = 2.2
/** Fraction of the vertical speed a spark keeps on each bounce off the ground plane. */
export const SPARK_RESTITUTION = 0.35
/** Fraction of the horizontal speed a spark keeps on each bounce (scrape against the floor). */
export const SPARK_FRICTION = 0.5
/** Seconds of motion the streak spans behind its head (the motion-blur shutter). */
export const SPARK_SHUTTER = 0.018
/** Ground plane value meaning "no bounce" (hits on walls do not know where the floor is). */
const NO_GROUND = -1e9

/** What a hit struck, which decides how much it sparks and how much dust it throws. */
export type SparkSurface = 'metal' | 'concrete' | 'ground'

interface SurfaceProfile {
  sparks: number
  speed: [number, number]
  life: [number, number]
  dust: number
  dustRgb: [number, number, number]
  flash: number
}

/** Per-surface look of an impact burst. Footpeg scrapes (no surface) use `scrape`. */
export const SPARK_PROFILES: Record<SparkSurface | 'scrape', SurfaceProfile> = {
  metal: {
    sparks: 24,
    speed: [3, 9],
    life: [260, 620],
    dust: 2,
    dustRgb: [0.32, 0.3, 0.28],
    flash: 1,
  },
  concrete: {
    sparks: 6,
    speed: [2, 5.5],
    life: [120, 300],
    dust: 7,
    dustRgb: [0.62, 0.6, 0.55],
    flash: 0.6,
  },
  ground: {
    sparks: 2,
    speed: [1.5, 3.5],
    life: [90, 200],
    dust: 7,
    dustRgb: [0.45, 0.38, 0.3],
    flash: 0.35,
  },
  scrape: {
    sparks: 10,
    speed: [1.2, 3.6],
    life: [140, 280],
    dust: 0,
    dustRgb: [0, 0, 0],
    flash: 0,
  },
}

/** Optional shaping of one burst (e.g. a footpeg scrape): spark count, carried velocity, spread. */
export interface SparkBurstOptions {
  /** Sparks in the burst, 1…`PER_BURST` (default: the surface's count). */
  count?: number
  /** World velocity every spark carries, m/s (e.g. part of the vehicle's, so they trail). */
  drift?: Vec3Tuple
  /** Scales the random spark speed (default 1). */
  speed?: number
  /** Struck surface; omitted for scrapes (no dust, no flash). */
  surface?: SparkSurface
  /** Direction the bullet travelled; sparks fan out in a cone around its reflection. */
  incoming?: Vec3Tuple
}

/**
 * Seconds-domain spark path, shared by the shader and {@link sparkPosition}: drag on the random
 * velocity, undragged drift, gravity, and two analytic hops on a horizontal plane, each losing
 * vertical speed (restitution) and horizontal speed (friction); after the second it rests.
 */
const SPARK_GLSL = /* glsl */ `
float nablaDragged(float t){ return (1.0 - exp(-${SPARK_DRAG.toFixed(4)} * t)) / ${SPARK_DRAG.toFixed(4)}; }
vec3 nablaSparkPath(vec3 p0, vec3 v0, vec3 drift, float groundY, float t){
  vec3 p = p0 + v0 * nablaDragged(t) + drift * t;
  p.y -= ${SPARK_DROP.toFixed(4)} * t * t;
  if (p.y < groundY) {
    // Bounce time from the undragged vertical motion (cheap closed form), then damped hops.
    float vy = v0.y + drift.y;
    float c = p0.y - groundY;
    float tb = (vy + sqrt(max(0.0, vy * vy + 4.0 * ${SPARK_DROP.toFixed(4)} * c))) / (2.0 * ${SPARK_DROP.toFixed(4)});
    tb = clamp(tb, 0.0, t);
    vec3 at = p0 + v0 * nablaDragged(tb) + drift * tb;
    float up1 = ${SPARK_RESTITUTION.toFixed(4)} * max(0.0, 2.0 * ${SPARK_DROP.toFixed(4)} * tb - vy);
    float up2 = ${SPARK_RESTITUTION.toFixed(4)} * up1;
    float t1 = up1 / ${SPARK_DROP.toFixed(4)};
    float t2 = up2 / ${SPARK_DROP.toFixed(4)};
    vec3 h1 = (v0 * exp(-${SPARK_DRAG.toFixed(4)} * tb) + drift) * ${SPARK_FRICTION.toFixed(4)};
    vec3 h2 = h1 * ${SPARK_FRICTION.toFixed(4)};
    float s = t - tb;
    float s1 = min(s, t1);
    float s2 = clamp(s - t1, 0.0, t2);
    float y = s < t1 ? up1 * s1 - ${SPARK_DROP.toFixed(4)} * s1 * s1 : up2 * s2 - ${SPARK_DROP.toFixed(4)} * s2 * s2;
    p = vec3(at.x + h1.x * s1 + h2.x * s2, groundY + max(0.0, y), at.z + h1.z * s1 + h2.z * s2);
  }
  return p;
}
`

/** JS twin of `nablaSparkPath`. */
export function sparkPosition(
  p0: ArrayLike<number>,
  v0: ArrayLike<number>,
  drift: ArrayLike<number>,
  groundY: number,
  t: number,
): [number, number, number] {
  const d = (x: number) => (1 - Math.exp(-SPARK_DRAG * x)) / SPARK_DRAG
  const p: [number, number, number] = [0, 1, 2].map(
    (i) => p0[i]! + v0[i]! * d(t) + drift[i]! * t,
  ) as [number, number, number]
  p[1] -= SPARK_DROP * t * t
  if (p[1] >= groundY) return p
  const vy = v0[1]! + drift[1]!
  const c = p0[1]! - groundY
  const tb = Math.min(
    t,
    Math.max(0, (vy + Math.sqrt(Math.max(0, vy * vy + 4 * SPARK_DROP * c))) / (2 * SPARK_DROP)),
  )
  const up1 = SPARK_RESTITUTION * Math.max(0, 2 * SPARK_DROP * tb - vy)
  const up2 = SPARK_RESTITUTION * up1
  const t1 = up1 / SPARK_DROP
  const t2 = up2 / SPARK_DROP
  const s = t - tb
  const s1 = Math.min(s, t1)
  const s2 = Math.min(Math.max(s - t1, 0), t2)
  const y = s < t1 ? up1 * s1 - SPARK_DROP * s1 * s1 : up2 * s2 - SPARK_DROP * s2 * s2
  const e = Math.exp(-SPARK_DRAG * tb) * SPARK_FRICTION
  const h = (i: number) => (v0[i]! * e + drift[i]! * SPARK_FRICTION) * (s1 + SPARK_FRICTION * s2)
  return [
    p0[0]! + v0[0]! * d(tb) + drift[0]! * tb + h(0),
    groundY + Math.max(0, y),
    p0[2]! + v0[2]! * d(tb) + drift[2]! * tb + h(2),
  ]
}

const STREAK_VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
${SPARK_GLSL}
attribute vec2 corner;
attribute vec3 sparkOrigin; attribute vec3 sparkVelocity; attribute vec3 sparkDrift; attribute vec4 sparkData;
uniform float sparkNow; uniform float pixelScale;
varying float vHeat; varying vec2 vQuad; varying float vCap; varying float vGlow;
void main(){
  // sparkData: birth (ms, epoch-relative), life (ms), ground plane y, seed (0..1).
  // corner: x 0 tail / 1 head, y side -1 / 1. The quad spans head and a shutter-delayed tail, so
  // its length follows speed (slow sparks are round dots); it faces the camera, capped by width.
  float age = (sparkNow - sparkData.x) / 1000.0;
  float life = sparkData.y / 1000.0;
  if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float seed = sparkData.w;
  vec4 head = modelViewMatrix * vec4(nablaSparkPath(sparkOrigin, sparkVelocity, sparkDrift, sparkData.z, age), 1.0);
  vec4 tail = modelViewMatrix * vec4(nablaSparkPath(sparkOrigin, sparkVelocity, sparkDrift, sparkData.z,
    max(0.0, age - ${SPARK_SHUTTER.toFixed(4)})), 1.0);
  vHeat = 1.0 - age / life;
  // Width: per-spark size, thinning as it cools; never under ~1.2 px (the light is kept by
  // dimming instead, so far sparks do not shimmer).
  float width = mix(0.0012, 0.0036, vHeat) * (0.6 + 0.8 * seed);
  float minWidth = 1.2 * max(0.05, -head.z) / pixelScale;
  float w = max(width, minWidth);
  vec2 axis = head.xy / max(0.05, -head.z) - tail.xy / max(0.05, -tail.z);
  float screenLen = length(axis) * max(0.05, -head.z);
  axis = length(axis) > 1e-7 ? normalize(axis) : vec2(1.0, 0.0);
  vec4 p = mix(tail, head, corner.x);
  // Round ends: push each end out by half a width along the streak.
  p.xy += axis * (corner.x * 2.0 - 1.0) * 0.5 * w + vec2(-axis.y, axis.x) * corner.y * 0.5 * w;
  vQuad = corner;
  vCap = w / (screenLen + w);
  // Flash of light at birth, a brief flicker while hot, and the width-clamp dimming.
  float flicker = 0.8 + 0.2 * sin(age * (70.0 + 50.0 * seed) + seed * 31.0);
  vGlow = (1.0 + 2.5 * exp(-age / 0.03)) * mix(1.0, flicker, smoothstep(0.3, 0.9, vHeat)) * (width / w);
  gl_Position = projectionMatrix * p;
  #include <logdepthbuf_vertex>
}
`
const STREAK_FRAGMENT = /* glsl */ `
varying float vHeat; varying vec2 vQuad; varying float vCap; varying float vGlow;
#include <logdepthbuf_pars_fragment>
void main(){
  #include <logdepthbuf_fragment>
  // Black-body-ish cooling: white-yellow, orange, dull red; HDR while hot, fading out.
  vec3 hot = vec3(1.0, 0.92, 0.7) * 3.0;
  vec3 warm = vec3(1.0, 0.42, 0.08) * 1.6;
  vec3 dull = vec3(0.45, 0.06, 0.02) * 0.7;
  vec3 c = vHeat > 0.6 ? mix(warm, hot, (vHeat - 0.6) / 0.4) : mix(dull, warm, vHeat / 0.6);
  // Hot core with a soft falloff across, rounded caps, dimmer towards the tail.
  float x2 = vQuad.y * vQuad.y;
  float profile = exp(-x2 * 7.0) + 0.3 * (1.0 - x2);
  float caps = smoothstep(0.0, vCap, vQuad.x) * smoothstep(1.0, 1.0 - vCap, vQuad.x);
  float along = mix(0.3, 1.0, vQuad.x);
  // Cooler sparks shed their white core.
  vec3 core = mix(c, vec3(1.0, 0.97, 0.9) * 3.0, exp(-x2 * 14.0) * smoothstep(0.5, 1.0, vHeat));
  float fade = smoothstep(0.0, 0.25, vHeat);
  gl_FragColor = vec4(core * profile * caps * along * fade * vGlow, 1.0);
}
`
const PUFF_VERTEX = /* glsl */ `
#include <common>
attribute vec3 puffVelocity; attribute vec4 puffData; attribute vec3 puffColor;
uniform float sparkNow; uniform float pixelScale;
varying vec4 vColor; varying float vFlash;
#include <logdepthbuf_pars_vertex>
void main(){
  // puffData: birth (ms), life (ms), size (m), flash flag.
  float age = (sparkNow - puffData.x) / 1000.0;
  float life = puffData.y / 1000.0;
  if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float k = age / life;
  vec3 p = position + puffVelocity * ((1.0 - exp(-4.0 * age)) / 4.0) + vec3(0.0, 0.12 * age, 0.0);
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  vFlash = puffData.w;
  float size = puffData.z * (vFlash > 0.5 ? (0.6 + 0.8 * k) : (0.5 + 1.8 * sqrt(k)));
  float alpha = vFlash > 0.5 ? (1.0 - k) * (1.0 - k) : 0.55 * (1.0 - k) * smoothstep(0.0, 0.08, k);
  vColor = vec4(puffColor, alpha);
  gl_Position = projectionMatrix * view;
  gl_PointSize = size * pixelScale / max(0.05, -view.z);
  #include <logdepthbuf_vertex>
}
`
const PUFF_FRAGMENT = /* glsl */ `
varying vec4 vColor; varying float vFlash;
#include <logdepthbuf_pars_fragment>
void main(){
  #include <logdepthbuf_fragment>
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  float soft = vFlash > 0.5 ? pow(1.0 - r, 2.5) : (1.0 - r * r);
  float a = vColor.a * soft;
  // Premultiplied blend in one draw: the flash adds light (alpha 0), dust covers (alpha a).
  gl_FragColor = vFlash > 0.5 ? vec4(vColor.rgb * a, 0.0) : vec4(vColor.rgb * a, a);
}
`

function range([lo, hi]: [number, number]): number {
  return lo + Math.random() * (hi - lo)
}

/**
 * Analytic GPU sparks: each burst writes its spawn data once into a ring of `MAX_BURSTS` slots;
 * the vertex shader evaluates the ballistic path with drag and two bounces. Sparks draw as
 * camera-facing, velocity-aligned quads (head to a shutter-delayed tail, so slow ones are dots)
 * with a hot core and soft edges, thinning and cooling from white to dull red, additive HDR; dust and the hit flash share one premultiplied point draw. Two draws in total.
 */
class AnalyticShotSparks {
  enabled = true
  readonly root = new THREE.Group()
  private readonly geometry = new THREE.InstancedBufferGeometry()
  private readonly puffGeometry = new THREE.BufferGeometry()
  private readonly now = { value: 0 }
  private readonly pixelScale = { value: 600 }
  private readonly material = new THREE.ShaderMaterial({
    uniforms: { sparkNow: this.now, pixelScale: this.pixelScale },
    vertexShader: STREAK_VERTEX,
    fragmentShader: STREAK_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  private readonly puffMaterial = new THREE.ShaderMaterial({
    uniforms: { sparkNow: this.now, pixelScale: this.pixelScale },
    vertexShader: PUFF_VERTEX,
    fragmentShader: PUFF_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    toneMapped: false,
  })
  private readonly streaks: THREE.Mesh
  private readonly puffs: THREE.Points
  // One instance per spark; the shader expands it into a camera-facing quad.
  private readonly origins = new Float32Array(MAX_BURSTS * PER_BURST * 3)
  private readonly velocities = new Float32Array(MAX_BURSTS * PER_BURST * 3)
  private readonly drifts = new Float32Array(MAX_BURSTS * PER_BURST * 3)
  private readonly data = new Float32Array(MAX_BURSTS * PER_BURST * 4)
  private readonly puffOrigins = new Float32Array(MAX_BURSTS * PUFF_PER_BURST * 3)
  private readonly puffVelocities = new Float32Array(MAX_BURSTS * PUFF_PER_BURST * 3)
  private readonly puffData = new Float32Array(MAX_BURSTS * PUFF_PER_BURST * 4)
  private readonly puffColors = new Float32Array(MAX_BURSTS * PUFF_PER_BURST * 3)
  /** Wall-clock birth and the longest life per burst, for liveness and CPU queries. */
  private readonly births = new Float64Array(MAX_BURSTS).fill(-Infinity)
  private readonly lives = new Float64Array(MAX_BURSTS)
  private epoch = 0
  private next = 0
  private disposed = false
  /** Every live burst's reach (sparks with bounces, dust, flash), for off-screen culling. */
  private readonly bounds = new SpawnBounds(MAX_LIFE_MS)

  constructor() {
    this.root.name = 'Shot sparks'
    for (let v = 0; v < this.data.length / 4; v++) this.data[v * 4] = NEVER
    for (let v = 0; v < this.puffData.length / 4; v++) this.puffData[v * 4] = NEVER
    const g = this.geometry
    g.setAttribute(
      'corner',
      new THREE.BufferAttribute(new Float32Array([0, -1, 1, -1, 1, 1, 0, 1]), 2),
    )
    // three sizes the draw from `position`; the shader ignores it.
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3))
    g.setIndex([0, 1, 2, 0, 2, 3])
    g.setAttribute('sparkOrigin', new THREE.InstancedBufferAttribute(this.origins, 3))
    g.setAttribute('sparkVelocity', new THREE.InstancedBufferAttribute(this.velocities, 3))
    g.setAttribute('sparkDrift', new THREE.InstancedBufferAttribute(this.drifts, 3))
    g.setAttribute('sparkData', new THREE.InstancedBufferAttribute(this.data, 4))
    g.instanceCount = MAX_BURSTS * PER_BURST
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity)
    const pg = this.puffGeometry
    pg.setAttribute('position', new THREE.BufferAttribute(this.puffOrigins, 3))
    pg.setAttribute('puffVelocity', new THREE.BufferAttribute(this.puffVelocities, 3))
    pg.setAttribute('puffData', new THREE.BufferAttribute(this.puffData, 4))
    pg.setAttribute('puffColor', new THREE.BufferAttribute(this.puffColors, 3))
    pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity)
    this.streaks = new THREE.Mesh(g, this.material)
    this.puffs = new THREE.Points(pg, this.puffMaterial)
    for (const object of [this.streaks, this.puffs]) {
      object.frustumCulled = false
      object.visible = false
    }
    this.streaks.renderOrder = 5
    this.puffs.renderOrder = 5
    // Both draws keep their infinite sort sphere; they skip GPU work when no burst can be seen.
    // Pad: streaks are at least 1.2 px wide, dust and flash are world-sized (in the radius).
    const cull = {
      box: (target: THREE.Box3) => this.bounds.unionInto(target),
      pad: (camera: THREE.Camera, height: number, distance: number) =>
        pixelsToWorld(camera, height, distance, 3),
    }
    cullOffscreen(this.streaks, cull)
    cullOffscreen(this.puffs, cull)
    // Point size in pixels needs the drawing-buffer height and vertical FOV.
    // Shared by both draws (streak width clamp and point size).
    const measure = (renderer: THREE.WebGLRenderer, camera: THREE.Camera) => {
      const height = renderer.getDrawingBufferSize(scratch).y
      const fov = (camera as THREE.PerspectiveCamera).fov ?? 55
      this.pixelScale.value = height / (2 * Math.tan((fov * Math.PI) / 360))
    }
    this.streaks.onBeforeRender = (renderer, _scene, camera) => measure(renderer, camera)
    this.puffs.onBeforeRender = (renderer, _scene, camera) => measure(renderer, camera)
    this.root.add(this.streaks, this.puffs)
    this.root.raycast = () => undefined
  }

  add(origin: Vec3Tuple, now: number, normal?: Vec3Tuple, options: SparkBurstOptions = {}): void {
    if (!this.enabled) return
    if (this.disposed || !Number.isFinite(now)) return
    const n = normal ? tmpN.set(...normal).normalize() : tmpN.set(0, 1, 0)
    if (n.lengthSq() < 1e-8) n.set(0, 1, 0)
    const tangent = Math.abs(n.y) > 0.9 ? tmpT.set(1, 0, 0) : tmpT.set(0, 1, 0)
    const bitangent = tmpB.crossVectors(n, tangent).normalize()
    tangent.crossVectors(bitangent, n).normalize()
    const profile = SPARK_PROFILES[options.surface ?? 'scrape']
    const count = Math.max(1, Math.min(PER_BURST, Math.round(options.count ?? profile.sparks)))
    const drift = options.drift ?? ZERO
    // Bounce on the struck plane when it is floor-like; walls do not know where the floor is.
    const groundY = n.y > 0.7 ? origin[1] - 0.002 : NO_GROUND
    const burst = this.next++ % MAX_BURSTS
    if (now - this.epoch > EPOCH_MS || !this.live(now)) this.rebase(now)
    this.births[burst] = now
    const rel = now - this.epoch
    // Emission axis: the bullet's reflection off the surface, tipped out of grazing angles;
    // without an incoming direction (scrapes, sidearm-less callers) the normal, wider.
    let cone = 0.95
    const axis = tmpA.copy(n)
    if (options.incoming) {
      const d = tmpV.set(...options.incoming)
      if (d.lengthSq() > 1e-8) {
        d.normalize()
        axis
          .copy(d)
          .addScaledVector(n, -2 * d.dot(n))
          .addScaledVector(n, 0.35)
          .normalize()
        cone = 0.6
      }
    }
    const side = Math.abs(axis.y) > 0.9 ? tmpT2.set(1, 0, 0) : tmpT2.set(0, 1, 0)
    const ax = tmpB2.crossVectors(axis, side).normalize()
    const ay = side.crossVectors(ax, axis).normalize()
    let longest = 0
    let fastest = 0
    let reach = 0
    for (let i = 0; i < PER_BURST; i++) {
      const s = burst * PER_BURST + i
      if (i >= count) {
        this.data[s * 4] = NEVER
        continue
      }
      // Uniform direction in the cone (sqrt keeps it from bunching at the axis).
      const r = cone * Math.sqrt(Math.random())
      const phi = Math.random() * Math.PI * 2
      // Most sparks are mid-speed, a few fast ones carry far; size and life vary per spark.
      const speed =
        (profile.speed[0] + (profile.speed[1] - profile.speed[0]) * Math.random() ** 1.6) *
        (options.speed ?? 1)
      tmpV
        .copy(axis)
        .multiplyScalar(Math.cos(r))
        .addScaledVector(ax, Math.sin(r) * Math.cos(phi))
        .addScaledVector(ay, Math.sin(r) * Math.sin(phi))
      // Keep every spark on the struck side.
      if (tmpV.dot(n) < 0.05) tmpV.addScaledVector(n, 0.05 - tmpV.dot(n))
      tmpV.normalize().multiplyScalar(speed)
      const life = range(profile.life) * (Math.random() < 0.15 ? 1.35 : 1)
      longest = Math.max(longest, life)
      fastest = Math.max(fastest, speed)
      this.origins.set(origin, s * 3)
      tmpV.toArray(this.velocities, s * 3)
      this.drifts.set(drift, s * 3)
      this.data[s * 4] = rel
      this.data[s * 4 + 1] = life
      this.data[s * 4 + 2] = groundY
      this.data[s * 4 + 3] = Math.random()
    }
    const pstart = burst * PUFF_PER_BURST
    for (let i = 0; i < PUFF_PER_BURST; i++) {
      const p = pstart + i
      const flash = i === 0
      const alive = flash ? profile.flash > 0 : i <= profile.dust
      if (!alive) {
        this.puffData[p * 4] = NEVER
        continue
      }
      this.puffOrigins.set(origin, p * 3)
      if (flash) {
        n.toArray(this.puffVelocities, p * 3)
        this.puffVelocities[p * 3] *= 0.05
        this.puffVelocities[p * 3 + 1] *= 0.05
        this.puffVelocities[p * 3 + 2] *= 0.05
        this.puffColors.set([3 * profile.flash, 2.5 * profile.flash, 1.6 * profile.flash], p * 3)
        this.puffData.set([rel, 70, 0.09 * (0.7 + 0.6 * profile.flash), 1], p * 4)
      } else {
        tmpV
          .copy(n)
          .multiplyScalar(0.8 + Math.random())
          .addScaledVector(tangent, Math.random() * 1.6 - 0.8)
          .addScaledVector(bitangent, Math.random() * 1.6 - 0.8)
          .multiplyScalar(0.6 + Math.random() * 1.2)
          .toArray(this.puffVelocities, p * 3)
        const shade = 0.85 + Math.random() * 0.3
        this.puffColors.set(
          profile.dustRgb.map((c) => c * shade),
          p * 3,
        )
        const life = 450 + Math.random() * 400
        longest = Math.max(longest, life)
        // Dust drifts at most |v|/4 plus its rise; its sprite is at most 2.3 × 0.15 m wide.
        reach = Math.max(reach, tmpV.length() / 4 + 0.12 * (life / 1000) + 0.18)
        this.puffData.set([rel, life, 0.07 + Math.random() * 0.08, 0], p * 4)
      }
    }
    this.lives[burst] = Math.max(longest, 70)
    {
      // A spark's dragged part goes at most |v0|/k; drift and gravity act for its whole life.
      const seconds = Math.max(longest, 70) / 1000
      const d = drift as ArrayLike<number>
      const driftSpeed = Math.hypot(d[0], d[1], d[2])
      reach = Math.max(
        reach,
        0.1,
        fastest / SPARK_DRAG + driftSpeed * seconds + SPARK_DROP * seconds * seconds + 0.01,
      )
      this.bounds.advance(now)
      this.bounds.expandSphere(origin[0], origin[1], origin[2], reach)
    }
    for (const name of ['sparkOrigin', 'sparkVelocity', 'sparkDrift', 'sparkData'] as const)
      markRange(
        this.geometry.getAttribute(name) as THREE.BufferAttribute,
        burst * PER_BURST,
        PER_BURST,
      )
    for (const name of ['position', 'puffVelocity', 'puffData', 'puffColor'] as const)
      markRange(
        this.puffGeometry.getAttribute(name) as THREE.BufferAttribute,
        pstart,
        PUFF_PER_BURST,
      )
  }

  update(now: number): void {
    if (!this.enabled) {
      this.clear()
      return
    }
    if (this.disposed) return
    this.now.value = now - this.epoch
    const visible = this.live(now)
    this.streaks.visible = visible
    this.puffs.visible = visible
  }

  clear(): void {
    this.births.fill(-Infinity)
    this.bounds.clear()
    this.streaks.visible = false
    this.puffs.visible = false
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clear()
    this.root.removeFromParent()
    this.geometry.dispose()
    this.puffGeometry.dispose()
    this.material.dispose()
    this.puffMaterial.dispose()
  }

  /** Head positions of the live sparks at `now`, oldest burst first (the shader's maths). */
  livePositions(now: number): Float32Array {
    const out: number[] = []
    const order = [...this.births.keys()]
      .filter((b) => now - this.births[b] <= MAX_LIFE_MS)
      .sort((a, b) => this.births[a] - this.births[b])
    for (const b of order)
      for (let v = b * PER_BURST; v < (b + 1) * PER_BURST; v++) {
        if (this.data[v * 4] === NEVER) continue
        const ageMs = now - this.births[b]
        if (ageMs > this.data[v * 4 + 1]) continue
        out.push(
          ...sparkPosition(
            this.origins.subarray(v * 3, v * 3 + 3),
            this.velocities.subarray(v * 3, v * 3 + 3),
            this.drifts.subarray(v * 3, v * 3 + 3),
            this.data[v * 4 + 2],
            ageMs / 1000,
          ),
        )
      }
    return Float32Array.from(out)
  }

  private live(now: number): boolean {
    for (let b = 0; b < MAX_BURSTS; b++) if (now - this.births[b] <= this.lives[b]) return true
    return false
  }

  /** Start a new float epoch at `now`: rewrite every live birth against it (rare). */
  private rebase(now: number): void {
    const shift = this.epoch - now
    this.epoch = now
    for (let v = 0; v < this.data.length / 4; v++)
      if (this.data[v * 4] !== NEVER) this.data[v * 4] += shift
    for (let p = 0; p < this.puffData.length / 4; p++)
      if (this.puffData[p * 4] !== NEVER) this.puffData[p * 4] += shift
    for (const [geometry, name] of [
      [this.geometry, 'sparkData'],
      [this.puffGeometry, 'puffData'],
    ] as const) {
      // A range over every slot, not an empty range list: the burst written right after this
      // adds its own range, and three would then upload only that one, leaving the GPU with
      // births on the old epoch that replay as the clock catches up with them.
      const attribute = geometry.getAttribute(name) as THREE.BufferAttribute
      markRange(attribute, 0, attribute.count)
    }
  }
}

const ZERO: Vec3Tuple = [0, 0, 0]
const scratch = new THREE.Vector2()
const tmpN = new THREE.Vector3()
const tmpT = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const tmpV = new THREE.Vector3()
const tmpA = new THREE.Vector3()
const tmpT2 = new THREE.Vector3()
const tmpB2 = new THREE.Vector3()

/**
 * Spark streaks, dust and a hit flash at bullet impacts (also footpeg scrapes, via `options`). Under
 * WebGL the paths are analytic on the GPU; under WebGPU the former pin-spark CPU update
 * runs (legacy-particles.ts), because `onBeforeCompile` does not apply there.
 */
export class ShotSparks {
  private readonly impl = analyticParticles() ? new AnalyticShotSparks() : new LegacyShotSparks()
  readonly root: THREE.Group = this.impl.root
  get enabled(): boolean {
    return this.impl.enabled
  }
  set enabled(enabled: boolean) {
    this.impl.enabled = enabled
  }
  add(origin: Vec3Tuple, now: number, normal?: Vec3Tuple, options: SparkBurstOptions = {}): void {
    this.impl.add(origin, now, normal, options)
  }
  update(now: number): void {
    this.impl.update(now)
  }
  /** Positions of the live sparks at `now` (after `update(now)`). */
  livePositions(now: number): Float32Array {
    if (this.impl instanceof AnalyticShotSparks) return this.impl.livePositions(now)
    const points = this.root.children[0] as THREE.Points
    const array = points.geometry.getAttribute('position').array as Float32Array
    return array.slice(0, points.geometry.drawRange.count * 3)
  }
  clear(): void {
    this.impl.clear()
  }
  dispose(): void {
    this.impl.dispose()
  }
}
