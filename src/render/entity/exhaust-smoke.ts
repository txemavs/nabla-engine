import { laserSmokePools, type LaserSmokePool } from './laser-smoke.js'
import { smokeDensity } from './smoke-density.js'
/** White exhaust vapour attached to the authored outlet, with a bounded world-space pool. */
import * as THREE from 'three'
import {
  analyticParticles,
  drawnIn,
  EPOCH_SECONDS,
  markRange,
  ParticleClock,
  PARTICLE_MOTION_GLSL,
  smokePosition,
} from './gpu-particles.js'
import { LegacyExhaustSmoke } from './legacy-particles.js'
export interface ExhaustSmokeOptions {
  /** Fixed emission rate at 100% quantity; omitted uses engine load. */
  lifetime?: number
  riseSpeed?: number
  emissionRate?: number
  capacity?: number
  direction?: readonly [number, number, number]
  color?: THREE.ColorRepresentation
  clearColor?: THREE.ColorRepresentation
  clearAtKmh?: number
  size?: number
  /** Fraction of one emission interval to delay this outlet, for alternating twin exhausts. */
  emissionPhase?: number
}

/** Current state of an emitter's particles, evaluated on the CPU (tests, laser sampling). */
export interface SmokeParticles {
  positions: Float32Array
  life: Float32Array
  tints: Float32Array
}

/** Emitters sharing one draw call; their clocks live in one uniform array. */
const BATCH_EMITTERS = 64
/** Particles of one shared draw call. */
const BATCH_PARTICLES = 4096

/**
 * One shared `THREE.Points` for up to {@link BATCH_EMITTERS} emitters of one scene space. Each
 * emitter leases a contiguous range of slots (its ring) and one clock slot while it has live
 * particles. The index buffer draws the leased rings in emitter creation order, which is the
 * order the former one-object-per-emitter draws had.
 */
class SmokeBatch {
  readonly geometry = new THREE.BufferGeometry()
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  readonly position = new THREE.BufferAttribute(new Float32Array(BATCH_PARTICLES * 3), 3)
  readonly velocity = new THREE.BufferAttribute(new Float32Array(BATCH_PARTICLES * 3), 3)
  readonly tint = new THREE.BufferAttribute(new Float32Array(BATCH_PARTICLES * 3), 3)
  /** `(birth s, birth q, lifetime, clock slot)`. */
  readonly spawn = new THREE.BufferAttribute(new Float32Array(BATCH_PARTICLES * 4), 4)
  private readonly index = new THREE.BufferAttribute(new Uint16Array(BATCH_PARTICLES), 1)
  /** `(clock s, clock q, size, drawn)` per clock slot. */
  readonly clocks = Array.from({ length: BATCH_EMITTERS }, () => new THREE.Vector4())
  readonly slots: (AnalyticExhaustSmoke | undefined)[] = new Array(BATCH_EMITTERS)
  forced = 0

  constructor() {
    for (const attribute of [this.position, this.velocity, this.tint, this.spawn])
      attribute.setUsage(THREE.DynamicDrawUsage)
    this.index.setUsage(THREE.DynamicDrawUsage)
    this.geometry.setAttribute('position', this.position)
    this.geometry.setAttribute('velocity', this.velocity)
    this.geometry.setAttribute('tint', this.tint)
    this.geometry.setAttribute('spawn', this.spawn)
    this.geometry.setIndex(this.index)
    this.geometry.setDrawRange(0, 0)
    // A fixed sort centre at the space origin, where the former per-emitter roots sat.
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity)
    this.points = new THREE.Points(
      this.geometry,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { smokeDensity, clocks: { value: this.clocks } },
        vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        ${PARTICLE_MOTION_GLSL}
        attribute vec3 velocity; attribute vec3 tint; attribute vec4 spawn;
        uniform vec4 clocks[${BATCH_EMITTERS}];
        varying vec3 smokeTint; varying float age; varying float smokeLifetime;
        void main(){
          vec4 clock=clocks[int(spawn.w+0.5)];
          float t=clock.x-spawn.x;
          float life=clock.w>0.5?nablaLife(spawn.z,t):0.0;
          float lifetime=spawn.z;
          age=life; smokeLifetime=lifetime; smokeTint=tint;
          vec4 p=modelViewMatrix*vec4(nablaSmokePosition(position,velocity,t,clock.y,spawn.x,spawn.y),1.0);
          gl_Position=projectionMatrix*p;
          gl_PointSize=life>0.0?clamp((1.0-life/lifetime)*1.4*clock.z/max(1.0,-p.z),1.0,240.0):0.0;
          #include <logdepthbuf_vertex>
        }`,
        fragmentShader: `
        uniform float smokeDensity;
        #include <logdepthbuf_pars_fragment>
        varying float age; varying vec3 smokeTint; varying float smokeLifetime;
        void main(){
          #include <logdepthbuf_fragment>
          float d=length(gl_PointCoord-0.5)*2.0;
          if(d>1.0||age<=0.0)discard;
          gl_FragColor=vec4(smokeTint,pow(1.0-d,2.0)*(age/smokeLifetime)*0.4*smokeDensity);
        }`,
      }),
    )
    this.points.name = 'Engine exhaust smoke'
    this.points.frustumCulled = false
    this.points.visible = false
    this.points.onBeforeRender = (_renderer, scene) => {
      for (let i = 0; i < BATCH_EMITTERS; i++) {
        const emitter = this.slots[i]
        if (emitter) this.clocks[i].w = drawnIn(emitter.root, scene) ? 1 : 0
      }
      this.points.material.uniformsNeedUpdate = true
    }
  }

  /** First free clock slot and ring offset for `capacity` particles, or undefined. */
  lease(emitter: AnalyticExhaustSmoke): { slot: number; offset: number } | undefined {
    const slot = this.slots.findIndex((s) => !s)
    if (slot < 0) return undefined
    const used = this.slots
      .filter((s): s is AnalyticExhaustSmoke => !!s)
      .map((s) => s.lease!)
      .sort((a, b) => a.offset - b.offset)
    let offset = 0
    for (const range of used) {
      if (range.offset - offset >= emitter.capacity) break
      offset = Math.max(offset, range.offset + range.count)
    }
    if (offset + emitter.capacity > BATCH_PARTICLES) return undefined
    this.slots[slot] = emitter
    this.clocks[slot].set(0, 0, emitter.size, 0)
    return { slot, offset }
  }

  release(slot: number): void {
    this.slots[slot] = undefined
    this.reindex()
  }

  /** Draw the leased rings in emitter creation order. */
  reindex(): void {
    const leased = this.slots
      .filter((s): s is AnalyticExhaustSmoke => !!s)
      .sort((a, b) => a.sequence - b.sequence)
    const array = this.index.array as Uint16Array
    let n = 0
    for (const emitter of leased)
      for (let i = 0; i < emitter.capacity; i++) array[n++] = emitter.lease!.offset + i
    this.index.clearUpdateRanges()
    this.index.needsUpdate = true
    this.geometry.setDrawRange(0, n)
    this.points.visible = n > 0 || this.forced > 0
  }

  get empty(): boolean {
    return this.slots.every((s) => !s)
  }

  dispose(): void {
    this.points.removeFromParent()
    this.geometry.dispose()
    this.points.material.dispose()
  }
}

/** The shared batches of one scene space (the `space` emitters express particles in). */
class SmokePool {
  readonly batches: SmokeBatch[] = []
  emitters = 0
  constructor(private readonly space: THREE.Object3D) {}
  lease(emitter: AnalyticExhaustSmoke): NonNullable<AnalyticExhaustSmoke['lease']> {
    for (const batch of this.batches) {
      const lease = batch.lease(emitter)
      if (lease) return { batch, ...lease, count: emitter.capacity }
    }
    const batch = this.addBatch()
    const lease = batch.lease(emitter)
    if (!lease) throw new Error(`Exhaust smoke capacity ${emitter.capacity} > ${BATCH_PARTICLES}`)
    return { batch, ...lease, count: emitter.capacity }
  }
  addBatch(): SmokeBatch {
    const batch = new SmokeBatch()
    this.batches.push(batch)
    this.space.add(batch.points)
    return batch
  }
  dispose(): void {
    for (const batch of this.batches) batch.dispose()
    this.batches.length = 0
  }
}

const pools = new WeakMap<THREE.Object3D, SmokePool>()
let sequence = 0

/** Analytic GPU exhaust smoke: spawn data written once, motion evaluated in the vertex shader. */
class AnalyticExhaustSmoke {
  readonly sequence = sequence++
  readonly capacity: number
  readonly size: number
  lease?: { batch: SmokeBatch; slot: number; offset: number; count: number }
  private readonly pool: SmokePool
  private readonly smokePool: LaserSmokePool
  private readonly clock = new ParticleClock()
  // CPU copies of the spawn data, for laser sampling and tests.
  private readonly origins: Float32Array
  private readonly velocities: Float32Array
  private readonly tints: Float32Array
  private readonly lifetimes: Float32Array
  private readonly birthS: Float64Array
  private readonly birthQ: Float64Array
  private readonly current: SmokeParticles
  private lastDeath = -Infinity
  private readonly source = new THREE.Vector3()
  private readonly previous = new THREE.Vector3()
  private readonly direction = new THREE.Vector3()
  private readonly movement = new THREE.Vector3()
  private ready = false
  private carry = 0
  private next = 0
  private enabled = true
  private amount = 1
  private disposed = false
  private readonly color: THREE.Color
  private readonly clearColor: THREE.Color
  readonly root = new THREE.Group()

  constructor(
    private readonly outlet: THREE.Object3D,
    private readonly space: THREE.Object3D,
    private readonly options: ExhaustSmokeOptions = {},
  ) {
    this.capacity = options.capacity ?? 48
    this.size = options.size ?? 550
    const capacity = this.capacity
    this.origins = new Float32Array(capacity * 3)
    this.velocities = new Float32Array(capacity * 3)
    this.tints = new Float32Array(capacity * 3)
    this.lifetimes = new Float32Array(capacity)
    this.birthS = new Float64Array(capacity)
    this.birthQ = new Float64Array(capacity)
    this.current = {
      positions: new Float32Array(capacity * 3),
      life: new Float32Array(capacity),
      tints: this.tints,
    }
    this.carry = -THREE.MathUtils.clamp(options.emissionPhase ?? 0, 0, 1)
    this.color = new THREE.Color(options.color ?? '#fafbfc')
    this.clearColor = new THREE.Color(options.clearColor ?? options.color ?? '#fafbfc')
    let pool = pools.get(space)
    if (!pool) pools.set(space, (pool = new SmokePool(space)))
    pool.emitters++
    this.pool = pool
    this.smokePool = {
      root: this.root,
      positions: this.current.positions,
      life: this.current.life,
      lifetime: options.lifetime ?? 1.4,
      size: this.size,
      sync: () => this.particles(),
    }
    laserSmokePools.add(this.smokePool)
    this.root.name = 'Engine exhaust smoke'
    this.root.visible = false
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.lifetimes.fill(0)
      this.lastDeath = -Infinity
      this.releaseLease()
      this.carry = -THREE.MathUtils.clamp(this.options.emissionPhase ?? 0, 0, 1)
      this.root.visible = false
    }
  }

  setAmount(amount: number): void {
    this.amount = THREE.MathUtils.clamp(amount, 0, 2)
  }

  update(dt: number, running: boolean, load: number, speedKmh = 0): void {
    if (!this.enabled || this.disposed) return
    dt = Math.min(0.05, Math.max(0, Number.isFinite(dt) ? dt : 0))
    this.outlet.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3().setFromObject(this.outlet)
    if (bounds.isEmpty()) this.outlet.getWorldPosition(this.source)
    else bounds.getCenter(this.source)
    this.space.worldToLocal(this.source)
    this.direction
      .fromArray(this.options.direction ?? [0, 0.559, 0.829])
      .transformDirection(this.outlet.matrixWorld)
    this.direction.transformDirection(this.space.matrixWorld.clone().invert())
    this.source.addScaledVector(this.direction, 0.03)
    this.movement.copy(this.source).sub(this.previous)
    if (this.ready && dt > 0 && this.movement.length() < 3) this.movement.multiplyScalar(0.8 / dt)
    else this.movement.set(0, 0, 0)
    this.previous.copy(this.source)
    this.ready = true
    // The former per-particle integration step, now one clock step for the whole emitter.
    this.clock.step(dt)
    this.carry = running
      ? this.carry +
        dt *
          (this.options.emissionRate ?? 10 + 22 * THREE.MathUtils.clamp(load, 0, 1)) *
          this.amount
      : -THREE.MathUtils.clamp(this.options.emissionPhase ?? 0, 0, 1)
    if (this.lease && this.clock.span > EPOCH_SECONDS) this.rebase()
    while (this.carry >= 1) {
      this.carry--
      const i = this.next++ % this.capacity
      this.color
        .clone()
        .lerp(
          this.clearColor,
          THREE.MathUtils.clamp(Math.abs(speedKmh) / (this.options.clearAtKmh ?? 60), 0, 1),
        )
        .toArray(this.tints, i * 3)
      this.source.toArray(this.origins, i * 3)
      const jet = this.options.riseSpeed ?? 0.4 + 0.3 * THREE.MathUtils.clamp(load, 0, 1)
      this.direction
        .clone()
        .multiplyScalar(jet)
        .add(this.movement)
        .add(new THREE.Vector3(Math.sin(i * 2.4) * 0.18, 0.08, Math.cos(i * 2.4) * 0.18))
        .toArray(this.velocities, i * 3)
      this.lifetimes[i] = this.options.lifetime ?? 1.4
      this.birthS[i] = this.clock.s
      this.birthQ[i] = this.clock.q
      this.lastDeath = Math.max(this.lastDeath, this.clock.s + this.lifetimes[i])
      this.write(i)
    }
    const live = this.clock.s < this.lastDeath
    if (!live) this.releaseLease()
    this.root.visible = live
    if (this.lease) {
      const c = this.lease.batch.clocks[this.lease.slot]
      c.x = this.clock.relS()
      c.y = this.clock.relQ()
    }
  }

  /** Make the shared draw visible (and compiled) while `on`, even without particles. */
  warmUp(on: boolean): void {
    const batch = this.pool.batches[0] ?? this.pool.addBatch()
    batch.forced = Math.max(0, batch.forced + (on ? 1 : -1))
    batch.reindex()
  }

  /** Current positions and life of the ring, evaluated with the shader's maths. */
  particles(): SmokeParticles {
    const { positions, life } = this.current
    for (let i = 0; i < this.capacity; i++) {
      const t = this.clock.s - this.birthS[i]
      life[i] = this.lifetimes[i] > 0 ? Math.max(0, this.lifetimes[i] - t) : 0
      smokePosition(
        this.origins.subarray(i * 3, i * 3 + 3),
        this.velocities.subarray(i * 3, i * 3 + 3),
        t,
        this.clock.q,
        this.birthS[i],
        this.birthQ[i],
        positions,
        i * 3,
      )
    }
    return this.current
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    laserSmokePools.delete(this.smokePool)
    this.releaseLease()
    this.root.removeFromParent()
    if (--this.pool.emitters === 0) {
      this.pool.dispose()
      pools.delete(this.space)
    }
  }

  private ensureLease(): NonNullable<AnalyticExhaustSmoke['lease']> {
    if (this.lease) return this.lease
    // No live particles: start a fresh float epoch and clear the ring.
    this.clock.rebase()
    const lease = (this.lease = this.pool.lease(this))
    const spawn = lease.batch.spawn.array as Float32Array
    for (let i = 0; i < this.capacity; i++) {
      const o = (lease.offset + i) * 4
      spawn[o] = 0
      spawn[o + 1] = 0
      spawn[o + 2] = 0
      spawn[o + 3] = lease.slot
    }
    markRange(lease.batch.spawn, lease.offset, this.capacity)
    lease.batch.reindex()
    return lease
  }

  private write(i: number): void {
    const { batch, offset, slot } = this.ensureLease()
    const n = offset + i
    ;(batch.position.array as Float32Array).set(this.origins.subarray(i * 3, i * 3 + 3), n * 3)
    ;(batch.velocity.array as Float32Array).set(this.velocities.subarray(i * 3, i * 3 + 3), n * 3)
    ;(batch.tint.array as Float32Array).set(this.tints.subarray(i * 3, i * 3 + 3), n * 3)
    const spawn = batch.spawn.array as Float32Array
    spawn[n * 4] = this.clock.relS(this.birthS[i])
    spawn[n * 4 + 1] = this.clock.relQ(this.birthQ[i], this.birthS[i])
    spawn[n * 4 + 2] = this.lifetimes[i]
    spawn[n * 4 + 3] = slot
    markRange(batch.position, n)
    markRange(batch.velocity, n)
    markRange(batch.tint, n)
    markRange(batch.spawn, n)
  }

  /** Move the float epoch to now and rewrite the ring's birth clocks against it. */
  private rebase(): void {
    const { batch, offset } = this.lease!
    this.clock.rebase()
    const spawn = batch.spawn.array as Float32Array
    for (let i = 0; i < this.capacity; i++) {
      spawn[(offset + i) * 4] = this.clock.relS(this.birthS[i])
      spawn[(offset + i) * 4 + 1] = this.clock.relQ(this.birthQ[i], this.birthS[i])
    }
    markRange(batch.spawn, offset, this.capacity)
  }

  private releaseLease(): void {
    if (!this.lease) return
    this.lease.batch.release(this.lease.slot)
    this.lease = undefined
  }
}

/**
 * Exhaust, damage, burning-wreck and debris-fire smoke. Under WebGL the emitters of one scene
 * space share one analytic GPU draw (gpu-particles.ts); under WebGPU each keeps the former CPU
 * simulation and its sprite substitute (legacy-particles.ts).
 */
export class ExhaustSmoke {
  private readonly impl: AnalyticExhaustSmoke | LegacyExhaustSmoke
  /** Scene-graph handle: add it where the smoke belongs; hiding it hides the smoke. */
  readonly root: THREE.Object3D

  constructor(outlet: THREE.Object3D, space: THREE.Object3D, options: ExhaustSmokeOptions = {}) {
    this.impl = analyticParticles()
      ? new AnalyticExhaustSmoke(outlet, space, options)
      : new LegacyExhaustSmoke(outlet, space, options)
    this.root = this.impl.root
  }

  setEnabled(enabled: boolean): void {
    this.impl.setEnabled(enabled)
  }

  /** Scale particle emission without changing the size or lifetime of each puff. */
  setAmount(amount: number): void {
    this.impl.setAmount(amount)
  }

  update(dt: number, running: boolean, load: number, speedKmh = 0): void {
    this.impl.update(dt, running, load, speedKmh)
  }

  /** Keep the smoke drawable (so its shader compiles) during a warm-up render. */
  warmUp(on: boolean): void {
    if (this.impl instanceof AnalyticExhaustSmoke) this.impl.warmUp(on)
    else this.root.visible = on
  }

  /** Current positions, life and tints of the emitter's particles. */
  particles(): SmokeParticles {
    if (this.impl instanceof AnalyticExhaustSmoke) return this.impl.particles()
    const geometry = (this.root as THREE.Points).geometry
    return {
      positions: geometry.getAttribute('position').array as Float32Array,
      life: geometry.getAttribute('life').array as Float32Array,
      tints: geometry.getAttribute('tint').array as Float32Array,
    }
  }

  dispose(): void {
    this.impl.dispose()
  }
}

/** Loaded S3 quantity rises from 10% at 1000 rpm to 200% at 7000; releasing gas leaves 10%. */
export function s3SmokeAmount(rpm: number, load = 1): number {
  const loaded = THREE.MathUtils.lerp(0.1, 2, THREE.MathUtils.clamp((rpm - 1000) / 6000, 0, 1))
  return THREE.MathUtils.lerp(0.1, loaded, THREE.MathUtils.clamp(load, 0, 1))
}
