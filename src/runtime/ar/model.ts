import * as THREE from 'three'
import {
  buildDrapes,
  photoFrameTransform,
  drapeMaterialAlpha,
  bakedDrapeLayers,
  type DrapeSource,
} from '../../render/planet/drape.js'
import { planetTileFrame } from '../../planet/tiles.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export function atlasModelPaths(manifest: {
  files?: Record<string, { path?: string }>
  roadCandidates?: { layers?: Record<string, { path?: string }> }
}): string[] {
  return [
    ...new Set(
      [
        manifest.files?.terrain?.path,
        manifest.files?.['buildings-osm']?.path,

        manifest.roadCandidates?.layers?.supports?.path,
      ].filter((p): p is string => !!p),
    ),
  ]
}
export function miniature(content: THREE.Object3D, terrain = false): THREE.Group {
  const root = new THREE.Group()
  content.updateWorldMatrix(true, true)
  const bounds = new THREE.Box3()
  content.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    if (terrain && /^skirt(?:_|$)/i.test(object.name)) {
      object.visible = false
      return
    }
    bounds.union(new THREE.Box3().setFromObject(object))
  })
  if (!bounds.isEmpty()) {
    const center = bounds.getCenter(new THREE.Vector3())
    content.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z))
  }
  root.add(content)
  root.scale.setScalar(0.01)
  return root
}
function disposeModel(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>()
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    geometries.add(o.geometry)
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      materials.add(m)
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value)
    }
  })
  geometries.forEach((g) => g.dispose())
  materials.forEach((m) => m.dispose())
  textures.forEach((t) => t.dispose())
  root.removeFromParent()
}
export class ARModel {
  root: THREE.Group | null = null
  private generation = 0
  private fallSpeed = 0
  private atlas = false
  private readonly pan = new THREE.Vector2()
  private stickDown = false
  private cells = new Map<string, THREE.Group>()
  private pending = new Set<string>()
  onStatus?: (text: string) => void
  private atlasBase: { x: number; y: number; prefix: string } | null = null
  constructor(
    private scene: THREE.Scene,
    private readonly resolveUrl: (url: string) => string = (url) => url,
  ) {}
  async load(source: string | File): Promise<void> {
    const generation = ++this.generation
    const loader = new GLTFLoader()
    const content = new THREE.Group()
    try {
      if (source instanceof File)
        content.add((await loader.parseAsync(await source.arrayBuffer(), '')).scene)
      else if (typeof source === 'string' && /\/z\/15\/\d+\/\d+\/manifest\.json$/.test(source)) {
        const response = await fetch(this.resolveUrl(source), { cache: 'no-store' })
        if (!response.ok) throw new Error(`No se pudo cargar la celda (${response.status})`)
        const manifest = await response.json()
        for (const path of atlasModelPaths(manifest)) {
          content.add((await loader.loadAsync(this.resolveUrl(new URL(path, source).href))).scene)
        }
        content.traverse((o) => {
          if (
            o instanceof THREE.Mesh &&
            (['Roads', 'RoadInspect'].includes(o.userData.category) ||
              /^Roads(?:_|$)/.test(o.name) ||
              o.userData.drape === 'roads')
          )
            o.visible = false
        })
        if (manifest.z15Package?.file) {
          const packageResponse = await fetch(
            this.resolveUrl(new URL(manifest.z15Package.file, source).href),
            { cache: 'no-store' },
          )
          if (!packageResponse.ok)
            throw new Error('No se pudo cargar el paquete de techos de Atlas')
          const pkg = await packageResponse.json()
          const roof =
            pkg.files.find((f: { role: string }) => f.role === 'roof.lo') ??
            pkg.files.find((f: { role: string }) => f.role === 'roof')
          if (roof) {
            const meshes: THREE.Mesh[] = []
            content.updateWorldMatrix(true, true)
            content.traverse((o) => {
              if (o instanceof THREE.Mesh) meshes.push(o)
            })
            const baked = bakedDrapeLayers(
              meshes.map((m) => ({
                name: m.name,
                metadata: m.userData,
                hasMap: (Array.isArray(m.material) ? m.material : [m.material]).some(
                  (mat) => !!(mat as THREE.MeshStandardMaterial).map,
                ),
              })),
              manifest.cellVersion,
            )
            const geometries = meshes.map((m) => m.geometry.clone().applyMatrix4(m.matrixWorld))
            let drapes
            try {
              drapes = buildDrapes(
                meshes.map((m, i): DrapeSource => {
                  const g = geometries[i]
                  if (!g.getAttribute('normal')) g.computeVertexNormals()
                  return {
                    name: m.name,
                    metadata: m.userData,
                    position: g.getAttribute('position').array as Float32Array,
                    normal: g.getAttribute('normal').array as Float32Array,
                    index: g.index?.array as Uint32Array | undefined,
                  }
                }),
                { width: planetTileFrame(manifest.tile).width, layers: new Set(['roofs']), baked },
              )
            } finally {
              geometries.forEach((g) => g.dispose())
            }
            if (drapes.length) {
              const texture = await new THREE.TextureLoader().loadAsync(
                this.resolveUrl(new URL(roof.path, source).href),
              )
              texture.colorSpace = THREE.SRGBColorSpace
              const { repeat, offset } = photoFrameTransform(roof.frame)
              texture.repeat.set(repeat, repeat)
              texture.offset.set(offset, offset)
              texture.anisotropy = 4
              for (const drape of drapes) {
                const geometry = new THREE.BufferGeometry()
                geometry.setAttribute('position', new THREE.BufferAttribute(drape.position, 3))
                geometry.setAttribute('uv', new THREE.BufferAttribute(drape.uv, 2))
                geometry.computeVertexNormals()
                const material = new THREE.MeshStandardMaterial({
                  map: texture,
                  roughness: 1,
                  depthWrite: false,
                  polygonOffset: true,
                  polygonOffsetFactor: -2,
                  polygonOffsetUnits: -2,
                  ...drapeMaterialAlpha('roofs', true),
                })
                const mesh = new THREE.Mesh(geometry, material)
                mesh.name = 'Drape'
                mesh.userData.drape = 'roofs'
                mesh.renderOrder = 2
                content.add(mesh)
              }
            }
          }
        }
        if (!content.children.length) throw new Error('La celda no contiene GLB')
      } else content.add((await loader.loadAsync(source)).scene)
      if (generation !== this.generation) {
        disposeModel(content)
        return
      }
      const root = miniature(
        content,
        typeof source === 'string' && /\/z\/15\/\d+\/\d+\/manifest\.json$/.test(source),
      )
      const cell =
        typeof source === 'string'
          ? /^(.*\/z\/15\/)(\d+)\/(\d+)\/manifest\.json$/.exec(source)
          : null
      this.atlasBase = cell ? { prefix: cell[1], x: Number(cell[2]), y: Number(cell[3]) } : null
      this.atlas = !!this.atlasBase
      this.pan.set(0, 0)
      this.cells.clear()
      this.pending.clear()
      if (this.atlas) {
        content.position.x = 0
        content.position.z = 0
      }
      if (this.root) disposeModel(this.root)
      this.root = root
      this.scene.add(root)
    } catch (error) {
      disposeModel(content)
      throw error
    }
  }
  stick(x: number, z: number): void {
    const down = Math.max(Math.abs(x), Math.abs(z)) > 0.65
    if (!down) {
      if (Math.max(Math.abs(x), Math.abs(z)) < 0.3) this.stickDown = false
      return
    }
    if (this.stickDown || !this.root) return
    this.stickDown = true
    const dx = Math.abs(x) >= Math.abs(z) ? Math.sign(x) * 100 : 0
    const dz = dx === 0 ? Math.sign(z) * 100 : 0
    this.pan.x += dx
    this.pan.y += dz
    this.root.position.add(
      new THREE.Vector3(dx * 0.01, 0, dz * 0.01).applyQuaternion(this.root.quaternion),
    )
    if (this.atlas) void this.ensureCell()
  }
  private async ensureCell(): Promise<void> {
    const root = this.root!
    const base = this.atlasBase!
    const width = planetTileFrame({ z: 15, x: base.x, y: base.y }).width
    const x = base.x + Math.floor(0.5 - this.pan.x / width),
      y = base.y + Math.floor(0.5 - this.pan.y / width)
    const key = `${x}/${y}`
    if (key === `${base.x}/${base.y}` || this.cells.has(key) || this.pending.has(key)) return
    this.pending.add(key)
    this.onStatus?.(`Cargando celda ${key}…`)
    const temporary = new ARModel(new THREE.Scene(), this.resolveUrl)
    try {
      await temporary.load(`${base.prefix}${key}/manifest.json`)
      if (this.root !== root) {
        temporary.dispose()
        return
      }
      const cell = temporary.root!
      cell.removeFromParent()
      cell.scale.set(1, 1, 1)
      const content = cell.children[0]
      content.position.set(0, root.children[0].position.y, 0)
      const neighborWidth = planetTileFrame({ z: 15, x, y }).width
      cell.scale.set(width / neighborWidth, 1, width / neighborWidth)
      cell.position.set((x - base.x) * width, 0, (y - base.y) * width)
      root.add(cell)
      this.cells.set(key, cell)
      temporary.root = null
      // Bound the geometry retained on Quest; the initial cell stays available.
      if (this.cells.size > 8) {
        const oldest = this.cells.keys().next().value!
        disposeModel(this.cells.get(oldest)!)
        this.cells.delete(oldest)
      }
      this.onStatus?.(`Celda ${key} lista · paso 100 m`)
    } catch (error) {
      if (this.root === root) this.onStatus?.(`No se pudo cargar ${key}: ${String(error)}`)
    } finally {
      if (this.root === root) this.pending.delete(key)
    }
  }
  place(camera: THREE.Camera): void {
    if (!this.root) return
    const yaw = new THREE.Euler().setFromQuaternion(
      camera.getWorldQuaternion(new THREE.Quaternion()),
      'YXZ',
    ).y
    const p = new THREE.Vector3(0, 0, -1)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      .add(camera.getWorldPosition(new THREE.Vector3()))
    p.y = 0
    this.fallSpeed = 0
    this.pan.set(0, 0)
    this.root.position.copy(p)
    this.root.rotation.set(0, yaw, 0)
  }
  update(dt: number): void {
    if (!this.root || this.root.position.y <= 0) return
    const step = Math.min(Math.max(dt, 0), 0.05)
    this.fallSpeed += 9.81 * step
    this.root.position.y = Math.max(0, this.root.position.y - this.fallSpeed * step)
    if (this.root.position.y === 0) this.fallSpeed = 0
  }
  dispose(): void {
    this.generation++
    if (this.root) disposeModel(this.root)
    this.root = null
    this.cells.clear()
    this.pending.clear()
  }
}
