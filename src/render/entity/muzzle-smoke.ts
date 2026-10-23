import { smokeDensity } from './smoke-density.js'
import {
  SOFT_FRAGMENT_PARS,
  SOFT_VERTEX_PARS,
  softConsumer,
  softSmokeUniforms,
  softVertex,
} from './soft-smoke.js'
/** Small bounded powder-smoke bursts, in the pistol presentation's local space. */
import * as THREE from 'three'
import { analyticParticles, EPOCH_MS, NEVER, PARTICLE_MOTION_GLSL } from './gpu-particles.js'
import { LegacyMuzzleSmoke } from './legacy-particles.js'

const SLOTS = 32
const LIFE_S = 0.7

/** Analytic GPU powder smoke: births written per burst, drift evaluated in the vertex shader. */
class AnalyticMuzzleSmoke {
  private readonly births = new Float64Array(SLOTS).fill(-Infinity)
  private readonly origins = new Float32Array(SLOTS * 3)
  /** Birth in ms relative to {@link epoch}. */
  private readonly relativeBirths = new Float32Array(SLOTS).fill(NEVER)
  private readonly slots = Float32Array.from({ length: SLOTS }, (_, i) => i)
  private epoch = 0
  private next = 0
  private readonly geometry = new THREE.BufferGeometry()
  private readonly material: THREE.ShaderMaterial
  readonly root: THREE.Points
  constructor() {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.origins, 3))
    this.geometry.setAttribute('birth', new THREE.BufferAttribute(this.relativeBirths, 1))
    this.geometry.setAttribute('slot', new THREE.BufferAttribute(this.slots, 1))
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { smokeDensity, height: { value: 750 }, now: { value: 0 }, ...softSmokeUniforms() },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        ${PARTICLE_MOTION_GLSL}
        attribute float birth; attribute float slot; varying float t; uniform float height; uniform float now; varying float smokeSeed;
        ${SOFT_VERTEX_PARS}
        void main(){smokeSeed=fract(slot*0.618+0.13);float age=(now-birth)/1000.0; age=age>=0.0&&age<${LIFE_S.toFixed(1)}?age:-1.0; t=age;
          vec4 p=modelViewMatrix*vec4(age>=0.0?nablaMuzzleSmokePosition(position,slot,age):position,1.0);
          gl_Position=projectionMatrix*p;
          ${softVertex('p')}
          gl_PointSize=age>=0.0?clamp((0.009+age*0.06)*height*projectionMatrix[1][1]/max(0.05,-p.z),1.0,100.0):0.0;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        uniform float smokeDensity;
        #include <logdepthbuf_pars_fragment>
        varying float t; varying float smokeSeed;
        ${SOFT_FRAGMENT_PARS}
        void main(){
          if(t<0.0)discard;
          vec4 c=nablaSmoke(vec3(0.85,0.87,0.89),(1.0-t/0.7)*0.32*smokeDensity,t/0.7,smokeSeed,t*1.5,0.05);
          if(c.a<0.002)discard;
          gl_FragColor=c;
          #include <logdepthbuf_fragment>
        }`,
    })
    this.root = new THREE.Points(this.geometry, this.material)
    this.root.name = 'Muzzle powder smoke'
    softConsumer(this.material)
    this.root.visible = false
    this.root.frustumCulled = false
  }
  burst(now: number, muzzle: readonly number[]): void {
    const rebase = now - this.epoch > EPOCH_MS || !this.live(now)
    if (rebase) this.epoch = now
    for (let n = 0; n < 6; n++) {
      const i = this.next++ % SLOTS
      this.births[i] = now - n * 8
      this.origins.set(muzzle, i * 3)
    }
    this.writeBirths()
    this.geometry.attributes.position.needsUpdate = true
    this.update(now)
  }
  update(now: number, height = 750): void {
    this.material.uniforms.now.value = now - this.epoch
    this.root.visible = this.live(now)
    this.material.uniforms.height.value = height
  }
  /** Current positions and ages (−1 when dead), evaluated with the shader's maths. */
  particles(now: number): { positions: Float32Array; ages: Float32Array } {
    const positions = new Float32Array(SLOTS * 3)
    const ages = new Float32Array(SLOTS)
    for (let i = 0; i < SLOTS; i++) {
      const age = (now - this.births[i]) / 1000
      ages[i] = age >= 0 && age < LIFE_S ? age : -1
      const a = Math.max(0, ages[i])
      positions[i * 3] = this.origins[i * 3] + Math.sin(i * 2.4) * a * 0.025
      positions[i * 3 + 1] = this.origins[i * 3 + 1] + a * 0.07
      positions[i * 3 + 2] = this.origins[i * 3 + 2] - a * 0.14
    }
    return { positions, ages }
  }
  dispose(): void {
    this.root.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }
  clear(): void {
    this.births.fill(-Infinity)
    this.writeBirths()
    this.update(0)
  }
  private live(now: number): boolean {
    for (let i = 0; i < SLOTS; i++) {
      const age = (now - this.births[i]) / 1000
      if (age >= 0 && age < LIFE_S) return true
    }
    return false
  }
  /** All 32 births against the current epoch (one 128-byte upload). */
  private writeBirths(): void {
    for (let i = 0; i < SLOTS; i++)
      this.relativeBirths[i] = Number.isFinite(this.births[i]) ? this.births[i] - this.epoch : NEVER
    this.geometry.attributes.birth.needsUpdate = true
  }
}

/**
 * Powder smoke of the pistol. Under WebGL the drift is analytic on the GPU (gpu-particles.ts);
 * under WebGPU the former CPU update feeds its sprite substitute (legacy-particles.ts).
 */
export class MuzzleSmoke {
  private readonly impl = analyticParticles() ? new AnalyticMuzzleSmoke() : new LegacyMuzzleSmoke()
  readonly root: THREE.Points = this.impl.root
  constructor(density = smokeDensity) {
    ;(this.root.material as THREE.ShaderMaterial).uniforms.smokeDensity = density
  }
  burst(now: number, muzzle: readonly number[]): void {
    this.impl.burst(now, muzzle)
  }
  update(now: number, height = 750): void {
    this.impl.update(now, height)
  }
  /** Positions and ages (−1 when dead) at `now`. */
  particles(now: number): { positions: Float32Array; ages: Float32Array } {
    if (this.impl instanceof AnalyticMuzzleSmoke) return this.impl.particles(now)
    this.impl.update(now)
    return {
      positions: this.root.geometry.getAttribute('position').array as Float32Array,
      ages: this.root.geometry.getAttribute('age').array as Float32Array,
    }
  }
  dispose(): void {
    this.impl.dispose()
  }
  clear(): void {
    this.impl.clear()
  }
}
