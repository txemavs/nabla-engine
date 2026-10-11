/** White exhaust vapour attached to the authored outlet, with a bounded world-space pool. */
import * as THREE from 'three'

export class ExhaustSmoke {
  private readonly positions = new Float32Array(48 * 3)
  private readonly velocities = new Float32Array(48 * 3)
  private readonly life = new Float32Array(48)
  private readonly geometry = new THREE.BufferGeometry()
  private readonly source = new THREE.Vector3()
  private readonly previous = new THREE.Vector3()
  private readonly direction = new THREE.Vector3()
  private readonly movement = new THREE.Vector3()
  private ready = false
  private carry = 0
  private next = 0
  readonly root: THREE.Points

  constructor(
    private readonly outlet: THREE.Object3D,
    private readonly space: THREE.Object3D,
  ) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setAttribute('life', new THREE.BufferAttribute(this.life, 1))
    this.root = new THREE.Points(
      this.geometry,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float life; varying float age;
        void main(){age=life; vec4 p=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*p;
          gl_PointSize=life>0.0?clamp((1.4-life)*550.0/max(1.0,-p.z),1.0,240.0):0.0;
          #include <logdepthbuf_vertex>
        }`,
        fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        varying float age;
        void main(){
          #include <logdepthbuf_fragment>
          float d=length(gl_PointCoord-0.5)*2.0;
          if(d>1.0||age<=0.0)discard;
          gl_FragColor=vec4(0.95,0.96,0.97,pow(1.0-d,2.0)*(age/1.4)*0.4);
        }`,
      }),
    )
    this.root.name = 'White exhaust smoke'
    this.root.frustumCulled = false
    this.root.visible = false
  }

  update(dt: number, running: boolean, load: number): void {
    dt = Math.min(0.05, Math.max(0, Number.isFinite(dt) ? dt : 0))
    this.outlet.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3().setFromObject(this.outlet)
    bounds.getCenter(this.source)
    this.space.worldToLocal(this.source)
    this.direction.set(0, 0.559, 0.829).transformDirection(this.outlet.matrixWorld)
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
  }

  dispose(): void {
    this.root.removeFromParent()
    this.geometry.dispose()
    ;(this.root.material as THREE.ShaderMaterial).dispose()
  }
}
