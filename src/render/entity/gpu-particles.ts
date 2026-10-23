import * as THREE from 'three'

/**
 * Analytic GPU particles: each particle's spawn data (position, velocity, birth clock, lifetime)
 * is written once, when it is born, and the vertex shader evaluates where it is now. JS no longer
 * walks the particles every frame and only the newly written slots are uploaded
 * (`addUpdateRange`).
 *
 * The motion reproduces the former per-frame integration exactly, including its frame-rate
 * dependence: an emitter keeps a clock `S` (the sum of its clamped frame steps) and
 * `Q = Σ dt_k · S_k` (each step times the clock before it). The former explicit Euler update
 * `p += v·dt; v.y += a·dt` then gives, for any sequence of steps since birth at `(S_b, Q_b)`,
 * `p = p0 + v0·T` and `p.y += a·((Q − Q_b) − S_b·T)` with `T = S − S_b`.
 *
 * All the motion maths lives here, once in GLSL ({@link PARTICLE_MOTION_GLSL}) and once in JS
 * (for CPU queries such as laser beams crossing smoke), so a TSL port has a single source.
 *
 * The WebGPU backend keeps the former CPU simulations (legacy-particles.ts) because its sprite
 * substitutes read CPU-integrated attributes; {@link setAnalyticParticles} switches.
 */
let analytic = true

/** Use the analytic GPU pools (WebGL) or the former CPU simulations (WebGPU). */
export function setAnalyticParticles(enabled: boolean): void {
  analytic = enabled
}

/** Whether particle effects created from now on use the analytic GPU pools. */
export function analyticParticles(): boolean {
  return analytic
}

/** Upward acceleration of exhaust smoke after each step (the former `v.y += dt * 0.2`). */
export const SMOKE_RISE_ACCELERATION = 0.2
/** Constant rise of tyre smoke (the former `y += dt * 0.4`). */
export const TIRE_SMOKE_RISE = 0.4
/** Spark gravity term (the former `y -= 4.5 · age²`). */
export const SPARK_DROP = 4.5

/** GLSL of the motion, shared by every analytic particle shader. */
export const PARTICLE_MOTION_GLSL = /* glsl */ `
vec3 nablaSmokePosition(vec3 p0, vec3 v0, float t, float clockQ, float birthS, float birthQ){
  vec3 p = p0 + v0 * t;
  p.y += ${SMOKE_RISE_ACCELERATION.toFixed(4)} * ((clockQ - birthQ) - birthS * t);
  return p;
}
float nablaLife(float lifetime, float t){ return max(0.0, lifetime - t); }
vec3 nablaTireSmokePosition(vec3 p0, float t){ return p0 + vec3(0.0, ${TIRE_SMOKE_RISE.toFixed(4)} * t, 0.0); }
vec3 nablaSparkPosition(vec3 p0, vec3 v0, float age){
  vec3 p = p0 + v0 * age;
  p.y -= ${SPARK_DROP.toFixed(4)} * age * age;
  return p;
}
vec3 nablaMuzzleSmokePosition(vec3 p0, float slot, float age){
  return p0 + vec3(sin(slot * 2.4) * age * 0.025, age * 0.07, -age * 0.14);
}
`

/** JS twin of `nablaSmokePosition`. */
export function smokePosition(
  p0: ArrayLike<number>,
  v0: ArrayLike<number>,
  t: number,
  clockQ: number,
  birthS: number,
  birthQ: number,
  out: Float32Array,
  offset: number,
): void {
  out[offset] = p0[0] + v0[0] * t
  out[offset + 1] = p0[1] + v0[1] * t + SMOKE_RISE_ACCELERATION * (clockQ - birthQ - birthS * t)
  out[offset + 2] = p0[2] + v0[2] * t
}

/**
 * The `(S, Q)` clock of one emitter in doubles, with a float-safe epoch for the shader. Values
 * sent to the GPU are relative to the epoch: `s = S − S_E`, `q = Q − Q_E − S_E·s`; the motion
 * term `(q − q_b) − s_b·t` is invariant under that change.
 */
export class ParticleClock {
  s = 0
  q = 0
  private epochS = 0
  private epochQ = 0
  /** Advance by one clamped frame step, as the former integration did. */
  step(dt: number): void {
    this.q += dt * this.s
    this.s += dt
  }
  relS(s = this.s): number {
    return s - this.epochS
  }
  relQ(q = this.q, s = this.s): number {
    return q - this.epochQ - this.epochS * (s - this.epochS)
  }
  /** Seconds since the epoch; rebase when it grows past float-safe ranges. */
  get span(): number {
    return this.s - this.epochS
  }
  rebase(): void {
    this.epochS = this.s
    this.epochQ = this.q
  }
}

/** Seconds of clock after which an emitter rebases its float epoch. */
export const EPOCH_SECONDS = 30
/** Milliseconds after which a millisecond-clock effect rebases its float epoch. */
export const EPOCH_MS = 60000
/** Birth that is never alive. */
export const NEVER = Math.fround(-1e30)

/** True when `object` and all its ancestors are visible and it hangs from `scene`. */
export function drawnIn(object: THREE.Object3D, scene: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object
  let top: THREE.Object3D = object
  while (node) {
    if (!node.visible) return false
    top = node
    node = node.parent
  }
  return top === scene
}

/** Add one update range of `count` items starting at `index` on an attribute. */
export function markRange(attribute: THREE.BufferAttribute, index: number, count = 1): void {
  attribute.addUpdateRange(index * attribute.itemSize, count * attribute.itemSize)
  attribute.needsUpdate = true
}
