import * as THREE from 'three'
import type { Vec3Tuple } from '../../entity/schema.js'
import { analyticParticles } from './gpu-particles.js'
import { LegacyShotTracers } from './legacy-particles.js'

/** Longest a tracer lives, ms (a far shot is clipped to this). */
const LIFE_MS = 90
const MAX = 24
/** Apparent travel speed of the streak along the shot, m/s (slowed from muzzle velocity so a
 * 60 Hz frame still shows it moving rather than a full-length line). */
export const TRACER_SPEED = 320
/** Streak length per m/s of travel, s (the motion-blur shutter: 320 m/s gives 3.2 m). */
export const TRACER_SHUTTER = 0.01

const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 tracerEnd; attribute vec2 tracerData;
uniform float tracerNow;
varying float vAlong; varying float vFade;
void main(){
  // tracerData: birth (ms, epoch-relative), head flag. The head travels at TRACER_SPEED from
  // origin to end; the tail trails it by the shutter, both clamped to the segment.
  float age = (tracerNow - tracerData.x) / 1000.0;
  float span = length(tracerEnd - position);
  float head = clamp(age * ${TRACER_SPEED.toFixed(1)}, 0.0, span);
  float tail = clamp(head - ${(TRACER_SPEED * TRACER_SHUTTER).toFixed(3)}, 0.0, span);
  if (age < 0.0 || age * 1000.0 > ${LIFE_MS.toFixed(1)} || tail >= span) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;
  }
  float d = tracerData.y > 0.5 ? head : tail;
  vec3 p = position + (tracerEnd - position) * (span > 0.0 ? d / span : 0.0);
  vAlong = tracerData.y;
  vFade = 1.0 - age * 1000.0 / ${LIFE_MS.toFixed(1)};
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}
`
const FRAGMENT = /* glsl */ `
#include <logdepthbuf_pars_fragment>
varying float vAlong; varying float vFade;
void main(){
  #include <logdepthbuf_fragment>
  // Hot white core at the head fading to a warm tail; HDR so bloom (if on) picks it up.
  vec3 c = mix(vec3(1.0, 0.55, 0.18), vec3(1.0, 0.95, 0.8) * 2.5, vAlong);
  gl_FragColor = vec4(c * (0.25 + 0.75 * vAlong) * (0.4 + 0.6 * vFade), 1.0);
}
`

/**
 * Muzzle-to-impact streaks for sidearm shots: a short bright segment that travels along the shot
 * with a length tied to its speed, evaluated on the GPU from each shot's origin, end and birth.
 * One additive draw for all live tracers; JS only writes the two vertices of a new shot.
 */
class AnalyticShotTracers {
  readonly root = new THREE.Group()
  private readonly geometry = new THREE.BufferGeometry()
  private readonly now = { value: 0 }
  private readonly material = new THREE.ShaderMaterial({
    uniforms: { tracerNow: this.now },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  private readonly line: THREE.LineSegments
  private readonly positions = new Float32Array(MAX * 6)
  private readonly ends = new Float32Array(MAX * 6)
  private readonly data = new Float32Array(MAX * 4).fill(-1e30)
  private readonly births = new Float64Array(MAX).fill(-Infinity)
  private epoch = 0
  private next = 0
  private disposed = false

  constructor() {
    this.root.name = 'Shot tracers'
    for (let v = 0; v < MAX * 2; v++) this.data[v * 2 + 1] = v % 2
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setAttribute('tracerEnd', new THREE.BufferAttribute(this.ends, 3))
    this.geometry.setAttribute('tracerData', new THREE.BufferAttribute(this.data, 2))
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity)
    this.line = new THREE.LineSegments(this.geometry, this.material)
    this.line.frustumCulled = false
    this.line.renderOrder = 4
    this.line.visible = false
    this.root.add(this.line)
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
    for (let k = 0; k < 2; k++) {
      const v = slot * 2 + k
      this.positions.set(origin, v * 3)
      this.ends.set(end, v * 3)
      this.data[v * 2] = now - this.epoch
    }
    for (const name of ['position', 'tracerEnd', 'tracerData'] as const) {
      const attribute = this.geometry.getAttribute(name) as THREE.BufferAttribute
      attribute.addUpdateRange(slot * 2 * attribute.itemSize, 2 * attribute.itemSize)
      attribute.needsUpdate = true
    }
  }

  update(now: number): void {
    if (this.disposed) return
    this.now.value = now - this.epoch
    this.line.visible = this.count(now) > 0
  }

  clear(): void {
    this.births.fill(-Infinity)
    this.line.visible = false
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
    for (let v = 0; v < MAX * 2; v++) if (this.data[v * 2] > -1e29) this.data[v * 2] += shift
    const attribute = this.geometry.getAttribute('tracerData') as THREE.BufferAttribute
    attribute.clearUpdateRanges()
    attribute.needsUpdate = true
  }
}

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
