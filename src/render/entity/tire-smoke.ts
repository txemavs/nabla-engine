import { smokeDensity } from './smoke-density.js'
import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three'
import type { Vec3Tuple } from '../../entity/schema.js'
import {
  analyticParticles,
  EPOCH_SECONDS,
  markRange,
  ParticleClock,
  PARTICLE_MOTION_GLSL,
  TIRE_SMOKE_RISE,
} from './gpu-particles.js'
import { LegacyTireSmoke } from './legacy-particles.js'
import { cullOffscreen, pixelsToWorld, SpawnBounds } from './effect-culling.js'

const CAPACITY = 96
const LIFETIME = 1.2

/** Analytic GPU tyre smoke: spawn data written once, rise evaluated in the vertex shader. */
class AnalyticTireSmoke {
  private readonly origins = new Float32Array(CAPACITY * 3)
  /** `(birth s, lifetime)` relative to the clock epoch. */
  private readonly spawn = new Float32Array(CAPACITY * 2)
  private readonly births = new Float64Array(CAPACITY)
  private readonly lifetimes = new Float32Array(CAPACITY)
  private readonly geometry = new BufferGeometry()
  private readonly clock = new ParticleClock()
  private readonly clockUniform = { value: 0 }
  private lastDeath = -Infinity
  private next = 0
  private carry = 0
  /** Live puffs' paths in the root's (world) frame, for off-screen culling. */
  private readonly bounds = new SpawnBounds(LIFETIME)
  readonly root: Points
  constructor() {
    const position = new BufferAttribute(this.origins, 3).setUsage(DynamicDrawUsage)
    const spawn = new BufferAttribute(this.spawn, 2).setUsage(DynamicDrawUsage)
    this.geometry.setAttribute('position', position)
    this.geometry.setAttribute('spawn', spawn)
    this.root = new Points(
      this.geometry,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { smokeDensity, pixelRatio: { value: 1 }, clock: this.clockUniform },
        vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        ${PARTICLE_MOTION_GLSL}
        attribute vec2 spawn; varying float age; uniform float pixelRatio; uniform float clock;
        void main(){ float t=clock-spawn.x; float life=nablaLife(spawn.y,t); age=life;
          vec4 p=modelViewMatrix*vec4(nablaTireSmokePosition(position,t),1.0);
          gl_Position=projectionMatrix*p; gl_PointSize=life>0.0 ? clamp((1.8-life)*160.0*pixelRatio/max(1.0,-p.z),1.0,80.0) : 0.0;
          #include <logdepthbuf_vertex>
        }`,
        fragmentShader: `
        uniform float smokeDensity;
        #include <logdepthbuf_pars_fragment>
        varying float age; void main(){
        #include <logdepthbuf_fragment>
 float d=length(gl_PointCoord-0.5)*2.0;
        if(d>1.0 || age<=0.0) discard; gl_FragColor=vec4(0.65,0.67,0.69,(1.0-d)*(1.0-d)*age*0.24*smokeDensity); }`,
      }),
    )
    // Off-screen culling through the spawn bounds; three's sphere stays the sort centre.
    this.root.frustumCulled = false
    const material = this.root.material as ShaderMaterial
    cullOffscreen(this.root, {
      box: (target) => this.bounds.unionInto(target),
      // Point diameter: (1.8 − life)·160·pixelRatio / max(1, depth), clamped to [1, 80] px.
      pad: (camera, height, distance) =>
        pixelsToWorld(
          camera,
          height,
          distance,
          1 +
            Math.min(
              80,
              Math.max(1, (1.8 * 160 * material.uniforms.pixelRatio.value) / Math.max(1, distance)),
            ),
        ),
    })
    this.root.visible = false
  }
  update(dt: number, contacts: Vec3Tuple[], slip: number, origin: Vector3): void {
    dt = Math.min(0.05, Math.max(0, dt))
    this.clock.step(dt)
    this.bounds.advance(this.clock.s)
    if (this.clock.span > EPOCH_SECONDS) this.rebase()
    this.carry = contacts.length && slip > 0.2 ? this.carry + dt * 30 * slip : 0
    while (this.carry >= 1) {
      this.carry--
      const i = this.next++ % CAPACITY
      const p = contacts[i % contacts.length]
      this.origins.set([p[0], p[1] + 0.08, p[2]], i * 3)
      // Rises 0.4 m/s for its lifetime.
      this.bounds.expand(
        p[0],
        p[1] + 0.08,
        p[2],
        p[0],
        p[1] + 0.08 + TIRE_SMOKE_RISE * LIFETIME,
        p[2],
      )
      this.births[i] = this.clock.s
      this.lifetimes[i] = LIFETIME
      this.spawn[i * 2] = this.clock.relS(this.clock.s)
      this.spawn[i * 2 + 1] = LIFETIME
      this.lastDeath = Math.max(this.lastDeath, this.clock.s + LIFETIME)
      markRange(this.geometry.attributes.position as BufferAttribute, i)
      markRange(this.geometry.attributes.spawn as BufferAttribute, i)
    }
    this.clockUniform.value = this.clock.relS()
    this.root.position.copy(origin).negate()
    this.root.visible = this.clock.s < this.lastDeath
  }
  /** Current life of each particle, evaluated with the shader's maths. */
  life(): Float32Array {
    const life = new Float32Array(CAPACITY)
    for (let i = 0; i < CAPACITY; i++)
      life[i] = Math.max(0, this.lifetimes[i] - (this.clock.s - this.births[i]))
    return life
  }
  clear(): void {
    if (this.root.visible || this.lastDeath > this.clock.s) {
      this.lifetimes.fill(0)
      for (let i = 0; i < CAPACITY; i++) this.spawn[i * 2 + 1] = 0
      markRange(this.geometry.attributes.spawn as BufferAttribute, 0, CAPACITY)
    }
    this.lastDeath = -Infinity
    this.carry = 0
    this.bounds.clear()
    this.root.visible = false
  }
  dispose(): void {
    this.geometry.dispose()
    ;(this.root.material as ShaderMaterial).dispose()
  }
  private rebase(): void {
    this.clock.rebase()
    for (let i = 0; i < CAPACITY; i++) this.spawn[i * 2] = this.clock.relS(this.births[i])
    markRange(this.geometry.attributes.spawn as BufferAttribute, 0, CAPACITY)
  }
}

/**
 * Bounded particle pool, one draw call. World positions stay independent of the floating origin.
 * Under WebGL the motion is analytic on the GPU (gpu-particles.ts); under WebGPU the former CPU
 * simulation feeds its sprite substitute (legacy-particles.ts).
 */
export class TireSmoke {
  private readonly impl = analyticParticles() ? new AnalyticTireSmoke() : new LegacyTireSmoke()
  readonly root: Points = this.impl.root
  update(dt: number, contacts: Vec3Tuple[], slip: number, origin: Vector3): void {
    this.impl.update(dt, contacts, slip, origin)
  }
  /** Current life of each particle (0 when dead). */
  life(): Float32Array {
    return this.impl instanceof AnalyticTireSmoke
      ? this.impl.life()
      : (this.root.geometry.getAttribute('life').array as Float32Array)
  }
  clear(): void {
    this.impl.clear()
  }
  dispose(): void {
    this.impl.dispose()
  }
}
