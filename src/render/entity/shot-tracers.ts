import * as THREE from 'three'
import type { Vec3Tuple } from '../../entity/schema.js'
import { analyticParticles } from './gpu-particles.js'
import { LegacyShotTracers } from './legacy-particles.js'
import { cullOffscreen, pixelsToWorld, SpawnBounds } from './effect-culling.js'

/** How long an air thread lingers after the shot, ms. */
const LIFE_MS = 160
const MAX = 24
/** Apparent travel speed of the wake front along the shot, m/s (so a 60 Hz frame sees it grow). */
export const TRACER_SPEED = 320
/** Thread width at birth and once diffused, m. */
const WIDTH: [number, number] = [0.004, 0.014]
/** Peak opacity of the thread: a faint, desaturated haze lighter than the background. */
export const TRACER_ALPHA = 0.1

const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec2 corner; attribute vec3 tracerStart; attribute vec3 tracerEnd; attribute float tracerBirth;
uniform float tracerNow; uniform float pixelScale;
varying vec2 vQuad; varying float vAlpha;
void main(){
  // corner: x along (0 muzzle side, 1 front), y side (-1, 1). The wake runs from the muzzle to a
  // front moving at TRACER_SPEED, clamped to the impact, and the whole thread fades and widens.
  float age = (tracerNow - tracerBirth) / 1000.0;
  float k = age * 1000.0 / ${LIFE_MS.toFixed(1)};
  if (age < 0.0 || k > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 span = tracerEnd - tracerStart;
  float len = length(span);
  float front = len > 0.0 ? min(1.0, age * ${TRACER_SPEED.toFixed(1)} / len) : 1.0;
  vec4 a = modelViewMatrix * vec4(tracerStart, 1.0);
  vec4 b = modelViewMatrix * vec4(tracerStart + span * front, 1.0);
  vec4 p = mix(a, b, corner.x);
  vec2 axis = b.xy / max(0.05, -b.z) - a.xy / max(0.05, -a.z);
  axis = length(axis) > 1e-6 ? normalize(axis) : vec2(1.0, 0.0);
  float width = mix(${WIDTH[0].toFixed(4)}, ${WIDTH[1].toFixed(4)}, sqrt(k));
  // At least ~1.5 px wide; a thinner thread keeps its light by lowering opacity, not by aliasing.
  float minWidth = 1.5 * max(0.05, -p.z) / pixelScale;
  float w = max(width, minWidth);
  p.xy += vec2(-axis.y, axis.x) * corner.y * 0.5 * w;
  vQuad = vec2(corner.x, corner.y);
  vAlpha = ${TRACER_ALPHA.toFixed(3)} * (width / w) * (1.0 - k) * (1.0 - k);
  gl_Position = projectionMatrix * p;
  #include <logdepthbuf_vertex>
}
`
const FRAGMENT = /* glsl */ `
#include <logdepthbuf_pars_fragment>
varying vec2 vQuad; varying float vAlpha;
void main(){
  #include <logdepthbuf_fragment>
  // Soft across the thread, thinning out at both ends; pale neutral grey, no glow.
  float across = 1.0 - vQuad.y * vQuad.y;
  float ends = smoothstep(0.0, 0.15, vQuad.x) * smoothstep(1.0, 0.85, vQuad.x);
  gl_FragColor = vec4(vec3(0.86, 0.88, 0.9), vAlpha * across * across * ends);
}
`

/**
 * Air threads along sidearm shots: a faint, thin, desaturated wake from the muzzle to the impact
 * that widens and fades within LIFE_MS, like the heat haze a bullet leaves. Camera-facing quads
 * expanded on the GPU from each shot's start, end and birth; one alpha-blended draw for all of
 * them, and JS only writes one instance per shot. No refraction (no scene texture is available).
 */
class AnalyticShotTracers {
  readonly root = new THREE.Group()
  private readonly geometry = new THREE.InstancedBufferGeometry()
  private readonly now = { value: 0 }
  private readonly pixelScale = { value: 600 }
  private readonly material = new THREE.ShaderMaterial({
    uniforms: { tracerNow: this.now, pixelScale: this.pixelScale },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
  private readonly mesh: THREE.Mesh
  private readonly starts = new Float32Array(MAX * 3)
  private readonly ends = new Float32Array(MAX * 3)
  private readonly data = new Float32Array(MAX).fill(-1e30)
  private readonly births = new Float64Array(MAX).fill(-Infinity)
  private epoch = 0
  private next = 0
  private disposed = false
  /** Live threads (muzzle to impact), for off-screen culling. */
  private readonly bounds = new SpawnBounds(LIFE_MS)

  constructor() {
    this.root.name = 'Shot tracers'
    const g = this.geometry
    g.setAttribute(
      'corner',
      new THREE.BufferAttribute(new Float32Array([0, -1, 1, -1, 1, 1, 0, 1]), 2),
    )
    // three needs a `position` attribute to size the draw; the shader ignores it.
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3))
    g.setIndex([0, 1, 2, 0, 2, 3])
    g.setAttribute('tracerStart', new THREE.InstancedBufferAttribute(this.starts, 3))
    g.setAttribute('tracerEnd', new THREE.InstancedBufferAttribute(this.ends, 3))
    g.setAttribute('tracerBirth', new THREE.InstancedBufferAttribute(this.data, 1))
    g.instanceCount = MAX
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity)
    this.mesh = new THREE.Mesh(g, this.material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 4
    this.mesh.visible = false
    this.mesh.onBeforeRender = (renderer, _scene, camera) => {
      const height = renderer.getDrawingBufferSize(scratch).y
      const fov = (camera as THREE.PerspectiveCamera).fov ?? 55
      this.pixelScale.value = height / (2 * Math.tan((fov * Math.PI) / 360))
    }
    // Keeps its infinite sort sphere; skips GPU work when no thread can be seen. Pad: the widest
    // thread, or its 1.5 px minimum.
    cullOffscreen(this.mesh, {
      box: (target) => this.bounds.unionInto(target),
      pad: (camera, height, distance) => WIDTH[1] / 2 + pixelsToWorld(camera, height, distance, 2),
    })
    this.root.add(this.mesh)
    this.root.raycast = () => undefined
  }

  /** Live tracers at `now` (after `update`). */
  count(now: number): number {
    let n = 0
    for (const birth of this.births) if (now - birth <= LIFE_MS) n++
    return n
  }

  add(origin: Vec3Tuple, end: Vec3Tuple, now: number): void {
    if (this.disposed || !Number.isFinite(now)) return
    if (now - this.epoch > 60000 || this.count(now) === 0) this.rebase(now)
    const slot = this.next++ % MAX
    this.births[slot] = now
    this.starts.set(origin, slot * 3)
    this.ends.set(end, slot * 3)
    this.data[slot] = now - this.epoch
    this.bounds.advance(now)
    this.bounds.expand(
      Math.min(origin[0], end[0]),
      Math.min(origin[1], end[1]),
      Math.min(origin[2], end[2]),
      Math.max(origin[0], end[0]),
      Math.max(origin[1], end[1]),
      Math.max(origin[2], end[2]),
    )
    for (const name of ['tracerStart', 'tracerEnd', 'tracerBirth'] as const) {
      const attribute = this.geometry.getAttribute(name) as THREE.BufferAttribute
      attribute.addUpdateRange(slot * attribute.itemSize, attribute.itemSize)
      attribute.needsUpdate = true
    }
  }

  update(now: number): void {
    if (this.disposed) return
    this.now.value = now - this.epoch
    this.mesh.visible = this.count(now) > 0
  }

  clear(): void {
    this.births.fill(-Infinity)
    this.bounds.clear()
    this.mesh.visible = false
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clear()
    this.root.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }

  private rebase(now: number): void {
    const shift = this.epoch - now
    this.epoch = now
    for (let v = 0; v < MAX; v++) if (this.data[v] > -1e29) this.data[v] += shift
    const attribute = this.geometry.getAttribute('tracerBirth') as THREE.BufferAttribute
    attribute.clearUpdateRanges()
    attribute.needsUpdate = true
  }
}

const scratch = new THREE.Vector2()

/** GPU tracers under WebGL; the former CPU line under WebGPU (see gpu-particles.ts). */
export class ShotTracers {
  private readonly impl = analyticParticles() ? new AnalyticShotTracers() : new LegacyShotTracers()
  readonly root: THREE.Group = this.impl.root
  add(origin: Vec3Tuple, end: Vec3Tuple, now: number): void {
    this.impl.add(origin, end, now)
  }
  update(now: number): void {
    this.impl.update(now)
  }
  clear(): void {
    this.impl.clear()
  }
  dispose(): void {
    this.impl.dispose()
  }
}
