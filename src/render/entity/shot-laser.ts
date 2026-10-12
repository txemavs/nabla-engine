import * as THREE from 'three'
import type { Vec3Tuple } from '../../entity/schema.js'

/** World-space laser sight: thin beam from muzzle to aim point plus a surface pin. */
export class ShotLaser {
  readonly root = new THREE.Group()
  private readonly beamGeom = new THREE.PlaneGeometry(1, 1)
  private readonly beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      start: { value: new THREE.Vector3() },
      end: { value: new THREE.Vector3() },
      resolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: `uniform vec3 start; uniform vec3 end; uniform vec2 resolution; varying vec2 laserUv;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main(){laserUv=uv; vec4 a=projectionMatrix*modelViewMatrix*vec4(start,1.); vec4 b=projectionMatrix*modelViewMatrix*vec4(end,1.);
    vec2 direction=(b.xy/b.w-a.xy/a.w)*resolution;
    vec2 perpendicular=normalize(vec2(-direction.y,direction.x)+vec2(0.00001));
    gl_Position=mix(a,b,uv.y); gl_Position.xy+=perpendicular*(uv.x-.5)*6./resolution*gl_Position.w;
    #include <logdepthbuf_vertex>
    }`,
    fragmentShader: `varying vec2 laserUv;
    #include <logdepthbuf_pars_fragment>
    void main(){
    #include <logdepthbuf_fragment>
    float d=abs(laserUv.x-.5)*2.;float halo=exp(-d*d*3.);float core=exp(-d*d*35.);
    gl_FragColor=vec4(mix(vec3(1.,.015,.01),vec3(1.,.5,.35),core),(.22*halo+.55*core)*(1.-smoothstep(.8,1.,d)));}`,
  })
  private readonly beam: THREE.Mesh
  private readonly halo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.025, 0.025),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexShader: `varying vec2 vHalo; void main(){vHalo=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 vHalo; void main(){float r=length(vHalo-.5)*2.;float a=exp(-r*r*4.)*(1.-smoothstep(.65,1.,r));gl_FragColor=vec4(1.,.015,.005,a*.85);}`,
    }),
  )
  private readonly pin: THREE.Mesh
  private disposed = false
  private on = false

  constructor() {
    this.root.name = 'Shot laser'
    this.beam = new THREE.Mesh(this.beamGeom, this.beamMat)
    this.beam.onBeforeRender = (renderer) => {
      renderer.getDrawingBufferSize(this.beamMat.uniforms.resolution.value)
    }
    this.beam.frustumCulled = false
    this.beam.renderOrder = 6
    this.pin = new THREE.Mesh(
      new THREE.SphereGeometry(0.003, 16, 10),
      new THREE.MeshBasicMaterial({
        color: '#ff4444',
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    this.pin.renderOrder = 7
    this.halo.renderOrder = 6
    this.halo.onBeforeRender = (_renderer, _scene, camera) => {
      this.halo.quaternion.copy(camera.quaternion)
      this.halo.updateMatrixWorld()
    }
    this.root.add(this.beam, this.pin, this.halo)
    this.root.visible = false
    this.root.raycast = () => undefined
  }

  set enabled(value: boolean) {
    this.on = value
    this.root.visible = value
  }

  get enabled(): boolean {
    return this.on
  }

  /** Update beam from muzzle to end; pin sits on the end when `hit` is true. */
  set(origin: Vec3Tuple, end: Vec3Tuple, hit: boolean): void {
    if (this.disposed || !this.on) return
    this.beamMat.uniforms.start.value.fromArray(origin)
    this.beamMat.uniforms.end.value.fromArray(end)
    this.pin.position.set(end[0], end[1], end[2])
    const distance = Math.hypot(end[0] - origin[0], end[1] - origin[1], end[2] - origin[2])
    this.pin.scale.setScalar(1 + Math.min(2, distance * 0.015))
    this.pin.visible = hit
    this.halo.visible = hit
    this.halo.position
      .copy(this.pin.position)
      .addScaledVector(new THREE.Vector3(...origin).sub(this.pin.position).normalize(), 0.012)
    this.halo.scale.copy(this.pin.scale)
  }

  clear(): void {
    this.pin.visible = false
    this.halo.visible = false
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.root.removeFromParent()
    this.beamGeom.dispose()
    this.beamMat.dispose()
    this.halo.geometry.dispose()
    this.halo.material.dispose()
    this.pin.geometry.dispose()
    ;(this.pin.material as THREE.Material).dispose()
  }
}
