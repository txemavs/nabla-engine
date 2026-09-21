import * as THREE from 'three'

/** Replace the model group with a GLB later; input and hits belong to the host/simulation. */
export class Sidearm {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.01, 5)
  readonly model = new THREE.Group()
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
    this.flash = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.13, 6),
      new THREE.MeshBasicMaterial({ color: '#ffe7ac' }),
    )
    this.flash.rotation.x = -Math.PI / 2
    this.flash.position.z = -0.2
    this.model.add(this.flash)
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
    this.model.position.set(0.23, -0.22, -0.48 + Math.max(0, 1 - age / 160) * 0.045)
    this.flash.visible = age < 65
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.render(this.scene, this.camera)
    renderer.autoClear = autoClear
  }
}
