/** White exhaust vapour attached to the authored outlet, with a bounded world-space pool. */
import * as THREE from 'three'
export interface ExhaustSmokeOptions {
  direction?: readonly [number, number, number]
  color?: THREE.ColorRepresentation
  clearColor?: THREE.ColorRepresentation
  clearAtKmh?: number
  size?: number
}

export class ExhaustSmoke {
  private readonly positions = new Float32Array(48 * 3)
  private readonly velocities = new Float32Array(48 * 3)
  private readonly life = new Float32Array(48)
  private readonly tints = new Float32Array(48 * 3)
  private readonly geometry = new THREE.BufferGeometry()
  private readonly source = new THREE.Vector3()
  private readonly previous = new THREE.Vector3()
  private readonly direction = new THREE.Vector3()
  private readonly movement = new THREE.Vector3()
  private ready = false
  private carry = 0
  private next = 0
  private enabled = true
  private readonly color: THREE.Color
  private readonly clearColor: THREE.Color
  readonly root: THREE.Points

  constructor(
    private readonly outlet: THREE.Object3D,
    private readonly space: THREE.Object3D,
    private readonly options: ExhaustSmokeOptions = {},
  ) {
    this.color = new THREE.Color(options.color ?? '#fafbfc')
    this.clearColor = new THREE.Color(options.clearColor ?? options.color ?? '#fafbfc')
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setAttribute('life', new THREE.BufferAttribute(this.life, 1))
    this.geometry.setAttribute('tint', new THREE.BufferAttribute(this.tints, 3))
    this.root = new THREE.Points(
      this.geometry,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { size: { value: options.size ?? 550 } },
        vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float life; attribute vec3 tint; varying vec3 smokeTint; varying float age; uniform float size;
        void main(){age=life; smokeTint=tint; vec4 p=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*p;
          gl_PointSize=life>0.0?clamp((1.4-life)*size/max(1.0,-p.z),1.0,240.0):0.0;
          #include <logdepthbuf_vertex>
        }`,
        fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        varying float age; varying vec3 smokeTint;
        void main(){
          #include <logdepthbuf_fragment>
          float d=length(gl_PointCoord-0.5)*2.0;
          if(d>1.0||age<=0.0)discard;
          gl_FragColor=vec4(smokeTint,pow(1.0-d,2.0)*(age/1.4)*0.4);
        }`,
      }),
    )
    this.root.name = 'Engine exhaust smoke'
    this.root.frustumCulled = false
    this.root.visible = false
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.life.fill(0)
      this.carry = 0
      this.root.visible = false
    }
  }

  update(dt: number, running: boolean, load: number, speedKmh = 0): void {
    if (!this.enabled) return
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
    for (let i = 0; i < this.life.length; i++) {
      this.life[i] = Math.max(0, this.life[i] - dt)
      if (!this.life[i]) continue
      for (let j = 0; j < 3; j++) this.positions[i * 3 + j] += this.velocities[i * 3 + j] * dt
      this.velocities[i * 3 + 1] += dt * 0.2
    }
    this.carry = running ? this.carry + dt * (10 + 22 * THREE.MathUtils.clamp(load, 0, 1)) : 0
    while (this.carry >= 1) {
      this.carry--
      const i = this.next++ % this.life.length
      this.color
        .clone()
        .lerp(
          this.clearColor,
          THREE.MathUtils.clamp(Math.abs(speedKmh) / (this.options.clearAtKmh ?? 60), 0, 1),
        )
        .toArray(this.tints, i * 3)
      this.source.toArray(this.positions, i * 3)
      const jet = 0.4 + 0.3 * THREE.MathUtils.clamp(load, 0, 1)
      this.direction
        .clone()
        .multiplyScalar(jet)
        .add(this.movement)
        .add(new THREE.Vector3(Math.sin(i * 2.4) * 0.18, 0.08, Math.cos(i * 2.4) * 0.18))
        .toArray(this.velocities, i * 3)
      this.life[i] = 1.4
    }
    this.root.visible = this.life.some((v) => v > 0)
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.life.needsUpdate = true
    this.geometry.attributes.tint.needsUpdate = true
  }

  dispose(): void {
    this.root.removeFromParent()
    this.geometry.dispose()
    ;(this.root.material as THREE.ShaderMaterial).dispose()
  }
}
