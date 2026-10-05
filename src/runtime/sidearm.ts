import * as THREE from 'three'
import { weaponPresets, type WeaponPreset } from '../catalog/weapons/library.js'
import { assets, disposeObject } from '../render/entity/assets.js'

/** Hip (default) and ADS viewmodel poses — centred for upcoming iron sights, no UI reticle. */
const HIP_POSE = { position: [0.1, -0.125, -0.34] as const, fov: 55 }
const ADS_POSE = { position: [0, -0.038, -0.2] as const, fov: 42 }

/** Viewmodel, cadence, ADS, recoil and laser. Equipped preset comes from assets. */
export class Sidearm {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(HIP_POSE.fov, 1, 0.01, 5)
  readonly model = new THREE.Group()
  private slide: THREE.Group | null = null
  private readonly flash: THREE.Mesh
  private readonly flashAt: [number, number, number]
  private readonly laserLine: THREE.Line
  private lastShot = -Infinity
  private hit = false
  private enabled = false
  private disposed = false
  private aiming = false
  private aimBlend = 0
  private laserOn = false
  private recoilPitch = 0
  private recoilYaw = 0
  readonly range: number
  readonly impulse: number
  private readonly intervalMs: number
  private readonly slideTravel: number
  private readonly kick: number
  private readonly pitch: number

  constructor(_viewport: HTMLElement, preset: WeaponPreset | undefined = weaponPresets()[0]) {
    this.range = preset?.range ?? 150
    this.impulse = preset?.impulse ?? 12
    this.intervalMs = preset?.intervalMs ?? 220
    this.slideTravel = preset?.slideTravel ?? 0
    this.kick = preset?.view.kick ?? 0.03
    this.pitch = preset?.view.pitch ?? 0.07
    const metal = new THREE.MeshStandardMaterial({
      color: '#354359',
      metalness: 0.7,
      roughness: 0.3,
    })
    const grip = new THREE.MeshStandardMaterial({ color: '#111a28', roughness: 0.85 })
    const part = (
      size: [number, number, number],
      position: [number, number, number],
      material: THREE.Material,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
      mesh.position.set(...position)
      this.model.add(mesh)
      return mesh
    }
    part([0.075, 0.085, 0.27], [0, 0, 0], metal)
    part([0.065, 0.16, 0.09], [0, -0.09, 0.07], grip).rotation.x = -0.18
    part([0.02, 0.02, 0.035], [0, 0.052, -0.1], grip)
    const fallback = [...this.model.children]
    if (preset)
      Promise.allSettled([
        assets.instantiate(preset.body),
        preset.slide ? assets.instantiate(preset.slide) : Promise.resolve(null),
      ])
        .then(([bodyResult, slideResult]) => {
          if (bodyResult.status === 'rejected' || slideResult.status === 'rejected') {
            if (bodyResult.status === 'fulfilled') disposeObject(bodyResult.value)
            if (slideResult.status === 'fulfilled' && slideResult.value)
              disposeObject(slideResult.value)
            throw new Error('Weapon asset failed to load')
          }
          const body = bodyResult.value,
            slide = slideResult.value
          if (this.disposed) {
            disposeObject(body)
            if (slide) disposeObject(slide)
            return
          }
          const assembly = new THREE.Group()
          assembly.scale.setScalar(preset.scale)
          assembly.position.set(...preset.assembly)
          assembly.add(body)
          if (slide) {
            assembly.add(slide)
            this.slide = slide
          }
          this.model.add(assembly)
          for (const object of fallback) {
            this.model.remove(object)
            const mesh = object as THREE.Mesh
            mesh.geometry.dispose()
          }
          metal.dispose()
          grip.dispose()
        })
        .catch(() => {
          /* procedural fallback already in the scene */
        })
    this.flashAt = (preset?.flash.position ?? [0, 0, -0.135]) as [number, number, number]
    this.flash = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.13, 6),
      new THREE.MeshBasicMaterial({ color: '#ffe7ac' }),
    )
    this.flash.rotation.x = -Math.PI / 2
    this.flash.position.set(...this.flashAt)
    this.model.add(this.flash)
    const laserPositions = new Float32Array([
      this.flashAt[0],
      this.flashAt[1],
      this.flashAt[2],
      this.flashAt[0],
      this.flashAt[1],
      this.flashAt[2] - 2.5,
    ])
    this.laserLine = new THREE.Line(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(laserPositions, 3)),
      new THREE.LineBasicMaterial({
        color: '#ff2a2a',
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    this.laserLine.visible = false
    this.laserLine.frustumCulled = false
    this.model.add(this.laserLine)
    const key = new THREE.DirectionalLight('#ffffff', 2)
    key.position.set(-1, 2, 1)
    this.scene.add(key)
    this.scene.add(this.model, new THREE.HemisphereLight('#d3edff', '#27374f', 3))
  }

  dispose(): void {
    if (this.disposed) return
    this.visible = false
    this.disposed = true
    disposeObject(this.model)
    this.model.clear()
    this.scene.clear()
  }

  set visible(value: boolean) {
    this.enabled = value && !this.disposed
    if (!this.enabled) {
      this.aiming = false
      this.aimBlend = 0
    }
  }
  get visible(): boolean {
    return this.enabled
  }

  setAiming(value: boolean): void {
    this.aiming = value && this.enabled
  }
  get isAiming(): boolean {
    return this.aiming
  }

  /** Toggle the laser sight; returns the new state. */
  toggleLaser(): boolean {
    this.laserOn = !this.laserOn
    this.laserLine.visible = this.laserOn && this.enabled
    return this.laserOn
  }
  get laserEnabled(): boolean {
    return this.laserOn
  }

  reset(): void {
    this.lastShot = -Infinity
    this.recoilPitch = 0
    this.recoilYaw = 0
    this.aiming = false
    this.aimBlend = 0
  }

  fire(now: number): boolean {
    if (this.disposed || !Number.isFinite(now) || now - this.lastShot < this.intervalMs)
      return false
    this.lastShot = now
    const ads = this.aimBlend > 0.5
    this.recoilPitch += ads ? 0.04 : 0.065
    this.recoilYaw += (Math.random() - 0.5) * (ads ? 0.014 : 0.03)
    this.recoilPitch = Math.min(this.recoilPitch, ads ? 0.09 : 0.14)
    this.recoilYaw = THREE.MathUtils.clamp(this.recoilYaw, -0.05, 0.05)
    return true
  }

  impact(hit: boolean): void {
    this.hit = hit
  }

  /**
   * Current muzzle tip in the viewmodel camera's local space (eye-relative), including
   * hip/ADS blend, kick and recoil — used for the world laser and hit rays.
   */
  muzzleViewOffset(now = this.lastShot): THREE.Vector3 {
    const age = Math.max(0, now - this.lastShot)
    const kick = Math.max(0, 1 - age / 160)
    const hip = new THREE.Vector3(...HIP_POSE.position)
    const ads = new THREE.Vector3(...ADS_POSE.position)
    const pos = hip.lerp(ads, this.aimBlend)
    pos.z += kick * this.kick * (0.7 + this.aimBlend * 0.4)
    const flash = new THREE.Vector3(...this.flashAt)
    const rx = kick * this.pitch + this.recoilPitch
    const ry = this.recoilYaw
    flash.applyEuler(new THREE.Euler(rx, ry, 0, 'YXZ'))
    return pos.add(flash)
  }

  render(renderer: THREE.WebGLRenderer, now: number, aspect: number, firstPerson: boolean): void {
    if (!this.enabled) return
    const age = now - this.lastShot
    this.aimBlend += ((this.aiming ? 1 : 0) - this.aimBlend) * 0.28
    this.recoilPitch *= 0.84
    this.recoilYaw *= 0.84
    if (Math.abs(this.recoilPitch) < 1e-4) this.recoilPitch = 0
    if (Math.abs(this.recoilYaw) < 1e-4) this.recoilYaw = 0
    this.laserLine.visible = this.laserOn
    if (!firstPerson) return
    this.camera.aspect = aspect
    this.camera.fov = THREE.MathUtils.lerp(HIP_POSE.fov, ADS_POSE.fov, this.aimBlend)
    this.camera.updateProjectionMatrix()
    const kick = Math.max(0, 1 - age / 160)
    const hip = new THREE.Vector3(...HIP_POSE.position)
    const ads = new THREE.Vector3(...ADS_POSE.position)
    const pos = hip.lerp(ads, this.aimBlend)
    pos.z += kick * this.kick * (0.7 + this.aimBlend * 0.4)
    this.model.position.copy(pos)
    this.model.rotation.set(
      kick * this.pitch + this.recoilPitch,
      this.recoilYaw,
      -this.recoilYaw * 0.35,
      'YXZ',
    )
    const slideCycle = age < 100 ? Math.sin((Math.PI * Math.max(0, age)) / 100) : 0
    if (this.slide) this.slide.position.z = slideCycle * this.slideTravel
    this.flash.visible = age < 65
    if (this.hit && age < 90) this.flash.scale.setScalar(1.15)
    else this.flash.scale.setScalar(1)
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    try {
      renderer.clearDepth()
      renderer.render(this.scene, this.camera)
    } finally {
      renderer.autoClear = autoClear
    }
  }
}
