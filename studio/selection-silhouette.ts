import * as THREE from 'three'

/** Object-mode selection: outline the union of rendered mesh silhouettes, never mesh edges. */
export class SelectionSilhouette {
  private readonly maskScene = new THREE.Scene()
  private readonly screen = new THREE.Scene()
  private readonly screenCamera = new THREE.Camera()
  private readonly size = new THREE.Vector2()
  private target?: THREE.WebGLRenderTarget
  private readonly proxies = new Map<THREE.Mesh, THREE.Mesh>()
  private readonly materials = new Map<THREE.Material, THREE.MeshBasicMaterial>()
  private readonly geometry = new THREE.PlaneGeometry(2, 2)
  private readonly edge = new THREE.ShaderMaterial({
    uniforms: {
      mask: { value: null },
      pixel: { value: new THREE.Vector2() },
      color: { value: new THREE.Color('#ffcf33') },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
    fragmentShader: `
      uniform sampler2D mask; uniform vec2 pixel; uniform vec3 color; varying vec2 vUv;
      void main(){
        float center=texture2D(mask,vUv).a;
        float nearby=0.0;
        for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++)
          nearby=max(nearby,texture2D(mask,vUv+vec2(float(x),float(y))*pixel).a);
        float line=max(0.0,nearby-center);
        if(line<0.01) discard;
        gl_FragColor=vec4(color,line);
        #include <colorspace_fragment>
      }`,
  })
  constructor() {
    const quad = new THREE.Mesh(this.geometry, this.edge)
    quad.frustumCulled = false
    this.screen.add(quad)
  }
  private maskMaterial(source: THREE.Material): THREE.MeshBasicMaterial {
    let material = this.materials.get(source)
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false })
      this.materials.set(source, material)
    }
    const surface = source as THREE.MeshBasicMaterial
    material.side = source.side
    material.visible = source.visible
    material.map = surface.map ?? null
    material.alphaMap = surface.alphaMap ?? null
    material.alphaTest = Math.max(source.alphaTest, source.transparent ? 0.1 : 0)
    return material
  }
  /** Called after the main view (and its postprocessing), using the same floating-origin camera. */
  render(
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
    object?: THREE.Object3D,
    includeBatchedSurface = false,
  ): void {
    if (!object || !object.visible) {
      this.clearSelection()
      return
    }
    object.updateWorldMatrix(true, true)
    const live = new Set<THREE.Mesh>()
    // Building batches hide their direct surface meshes. Use that source surface
    // explicitly without exposing other hidden equipment or modifying the scene.
    const visit = (node: THREE.Object3D) => {
      if (
        !node.visible &&
        !(
          includeBatchedSurface &&
          node.parent === object &&
          node instanceof THREE.Mesh &&
          node.material instanceof THREE.MeshStandardMaterial
        )
      )
        return
      if (node instanceof THREE.Mesh) {
        live.add(node)
        let proxy = this.proxies.get(node)
        if (!proxy) {
          proxy = node.clone(false)
          proxy.matrixAutoUpdate = false
          proxy.onBeforeRender = () => {}
          proxy.onAfterRender = () => {}
          this.proxies.set(node, proxy)
          this.maskScene.add(proxy)
        }
        proxy.geometry = node.geometry
        proxy.material = Array.isArray(node.material)
          ? node.material.map((material) => this.maskMaterial(material))
          : this.maskMaterial(node.material)
        proxy.matrix.copy(node.matrixWorld)
        proxy.matrixWorldNeedsUpdate = true
        proxy.visible = true
        proxy.layers.mask = camera.layers.mask
      }
      for (const child of node.children) visit(child)
    }
    visit(object)
    for (const [source, proxy] of this.proxies)
      if (!live.has(source)) {
        proxy.removeFromParent()
        this.proxies.delete(source)
      }
    const used = new Set(
      [...live].flatMap((node) => (Array.isArray(node.material) ? node.material : [node.material])),
    )
    for (const [source, material] of this.materials)
      if (!used.has(source)) {
        material.dispose()
        this.materials.delete(source)
      }
    if (!live.size) return
    renderer.getDrawingBufferSize(this.size)
    if (!this.target)
      this.target = new THREE.WebGLRenderTarget(this.size.x, this.size.y, { samples: 4 })
    else this.target.setSize(this.size.x, this.size.y)
    this.edge.uniforms.mask.value = this.target.texture
    this.edge.uniforms.pixel.value.set(
      (2 * renderer.getPixelRatio()) / this.size.x,
      (2 * renderer.getPixelRatio()) / this.size.y,
    )
    const target = renderer.getRenderTarget(),
      autoClear = renderer.autoClear
    const clear = renderer.getClearColor(new THREE.Color()),
      alpha = renderer.getClearAlpha()
    const shadows = renderer.shadowMap.enabled
    try {
      renderer.shadowMap.enabled = false
      renderer.autoClear = true
      renderer.setClearColor(0x000000, 0)
      renderer.setRenderTarget(this.target)
      renderer.render(this.maskScene, camera)
      renderer.setRenderTarget(target)
      renderer.autoClear = false
      renderer.render(this.screen, this.screenCamera)
    } finally {
      renderer.setRenderTarget(target)
      renderer.setClearColor(clear, alpha)
      renderer.autoClear = autoClear
      renderer.shadowMap.enabled = shadows
    }
  }
  private clearSelection() {
    this.maskScene.clear()
    this.proxies.clear()
    for (const material of this.materials.values()) material.dispose()
    this.materials.clear()
    this.target?.dispose()
    this.target = undefined
  }
  dispose(): void {
    this.clearSelection()
    this.target?.dispose()
    this.target = undefined
    this.geometry.dispose()
    this.edge.dispose()
  }
}
