import * as THREE from 'three'
import { assets } from './assets.js'

/** User-supplied body and slide; input and hits remain owned by the host/simulation. */
export class Sidearm {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.01, 5)
  readonly model = new THREE.Group()
  private slide: THREE.Group | null = null
  private readonly flash: THREE.Mesh
  private readonly reticle = document.createElement('div')
  private lastShot = -Infinity
  private hit = false
  private enabled = false

  constructor(viewport: HTMLElement) {
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
    this.reticle.dataset.weapon = 'loading'
    Promise.all([
      assets.instantiate('/weapons/hk_usp_compact_9mm.glb'),
      assets.instantiate('/weapons/hk_usp_compact_9mm_c.glb'),
    ])
      .then(([body, slide]) => {
        // Both files share their authored millimetre coordinates; preserve their relative origins.
        const assembly = new THREE.Group()
        assembly.scale.setScalar(0.001)
        assembly.position.set(0, -0.107, 0.025)
        assembly.add(body, slide)
        this.slide = slide
        this.model.add(assembly)
        for (const object of fallback) {
          this.model.remove(object)
          const mesh = object as THREE.Mesh
          mesh.geometry.dispose()
        }
        metal.dispose()
        grip.dispose()
        this.reticle.dataset.weapon = 'loaded'
      })
      .catch(() => {
        this.reticle.dataset.weapon = 'fallback'
        this.reticle.title = 'No se pudo cargar la pistola; se muestra el modelo provisional'
      })
    this.flash = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.13, 6),
      new THREE.MeshBasicMaterial({ color: '#ffe7ac' }),
    )
    this.flash.rotation.x = -Math.PI / 2
    this.flash.position.set(0, 0, -0.135)
    this.model.add(this.flash)
    const key = new THREE.DirectionalLight('#ffffff', 2)
    key.position.set(-1, 2, 1)
    this.scene.add(key)
    this.scene.add(this.model, new THREE.HemisphereLight('#d3edff', '#27374f', 3))
    this.reticle.setAttribute('aria-label', 'Punto de mira')
    this.reticle.dataset.shots = '0'
    Object.assign(this.reticle.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      font: '24px monospace',
      color: 'white',
      textShadow: '0 1px 3px black',
      zIndex: '5',
    })
    this.reticle.textContent = '+'
    this.reticle.hidden = true
    viewport.append(this.reticle)
  }
  set visible(value: boolean) {
    this.enabled = value
    this.reticle.hidden = !value
  }
  get visible(): boolean {
    return this.enabled
  }
  reset(): void {
    this.lastShot = -Infinity
    this.reticle.dataset.shots = '0'
  }
  fire(now: number): boolean {
    if (now - this.lastShot < 220) return false
    this.lastShot = now
    this.reticle.dataset.shots = String(Number(this.reticle.dataset.shots) + 1)
    return true
  }
  impact(hit: boolean): void {
    this.hit = hit
  }
  render(renderer: THREE.WebGLRenderer, now: number, aspect: number, firstPerson: boolean): void {
    if (!this.enabled) return
    const age = now - this.lastShot
    this.reticle.textContent = this.hit && age < 140 ? '×' : '+'
    if (!firstPerson) return
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
    const kick = Math.max(0, 1 - age / 160)
    this.model.position.set(0.13, -0.105, -0.3 + kick * 0.025)
    this.model.rotation.x = kick * 0.06
    // Presentation-only slide cycle, in the original asset units (millimetres).
    const slideCycle = age < 100 ? Math.sin((Math.PI * Math.max(0, age)) / 100) : 0
    if (this.slide) this.slide.position.z = slideCycle * 12
    this.flash.visible = age < 65
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.render(this.scene, this.camera)
    renderer.autoClear = autoClear
  }
}
