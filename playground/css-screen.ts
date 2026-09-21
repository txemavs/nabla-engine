import * as THREE from 'three'
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js'

/** Real DOM behind an alpha aperture: WebGL depth still occludes the panel. */
export class CssScreens {
  private readonly renderer = new CSS3DRenderer()
  private readonly scene = new THREE.Scene()
  private entries: {
    mesh: THREE.Mesh
    object: CSS3DObject
    drawing: HTMLElement
    fallback: THREE.Material | THREE.Material[]
  }[] = []
  private readonly aperture = new THREE.MeshBasicMaterial({
    color: 0x000000,
    blending: THREE.NoBlending,
    opacity: 0,
    side: THREE.FrontSide,
  })
  constructor(viewport: HTMLElement) {
    this.renderer.domElement.className = 'css-world-layer'
    viewport.prepend(this.renderer.domElement)
  }
  bind(screens: Map<string, THREE.Mesh>): void {
    for (const entry of this.entries) this.scene.remove(entry.object)
    this.entries = []
    for (const [id, mesh] of screens) {
      const element = document.createElement('div')
      element.className = 'carrier-css-screen'
      element.dataset.carrier = id
      element.innerHTML =
        '<header>NABLA / LABORATORIO CSS <small>Superficie espacial · HTML real</small></header><div class="css-drawing"><div class="css-demo-card">CSS<br><small>Haz clic para dibujar</small></div></div><footer>Perspectiva de la cámara · Clic: punto · Mayús + clic: borrar</footer>'
      const object = new CSS3DObject(element)
      object.matrixAutoUpdate = false
      element.style.pointerEvents = 'none'
      this.scene.add(object)
      this.entries.push({
        mesh,
        object,
        drawing: element.querySelector('.css-drawing')!,
        fallback: mesh.material,
      })
    }
  }
  /** Only the main view gets a DOM aperture; portal textures retain a solid screen. */
  prepare(camera: THREE.Camera, width: number, height: number): void {
    this.renderer.setSize(width, height)
    for (const entry of this.entries) {
      entry.mesh.updateWorldMatrix(true, false)
      entry.object.matrix
        .copy(entry.mesh.matrixWorld)
        .multiply(new THREE.Matrix4().makeScale(0.0025, 0.0025, 0.0025))
      entry.object.matrixWorldNeedsUpdate = true
      entry.mesh.material = this.aperture
    }
    this.renderer.render(this.scene, camera)
  }
  finish(): void {
    for (const entry of this.entries) entry.mesh.material = entry.fallback
  }
  draw(ray: THREE.Raycaster, roots: THREE.Object3D[], clear = false): boolean {
    if (
      !ray.intersectObjects(
        this.entries.map((entry) => entry.mesh),
        false,
      ).length
    )
      return false
    const hit = ray.intersectObjects(roots, true).find((h) => {
      if (!(h.object instanceof THREE.Mesh || h.object instanceof THREE.Sprite)) return false
      for (let object: THREE.Object3D | null = h.object; object; object = object.parent)
        if (!object.visible) return false
      return true
    })
    const entry = this.entries.find((e) => e.mesh === hit?.object)
    if (!entry || !hit?.uv) return false
    if (clear) entry.drawing.querySelectorAll('.css-ink').forEach((node) => node.remove())
    else {
      const x = hit.uv.x * 960,
        y = (1 - hit.uv.y) * 520 - 68
      if (y < 0 || y > 410) return true
      const dot = document.createElement('i')
      dot.className = 'css-ink'
      dot.style.left = `${x}px`
      dot.style.top = `${y}px`
      entry.drawing.append(dot)
      if (entry.drawing.querySelectorAll('.css-ink').length > 256)
        entry.drawing.querySelector('.css-ink')?.remove()
    }
    return true
  }
}
