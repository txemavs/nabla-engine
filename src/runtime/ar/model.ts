import { splitMapQuarters } from './map-quarters.js'
import {
  adaptAtlasManifest,
  validateAtlasZ15Package,
  type AtlasZ15Package,
} from '../../planet/atlas-z15.js'
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
  roads?: { files?: Record<string, { path?: string }> }
  roadCandidates?: { layers?: Record<string, { path?: string }> }
}): string[] {
  return [
    ...new Set(
      [
        manifest.files?.terrain?.path,
        manifest.files?.['buildings-osm']?.path,

        manifest.roads?.files?.asphalt?.path ?? manifest.roadCandidates?.layers?.asphalt?.path,
        manifest.roads?.files?.supports?.path ?? manifest.roadCandidates?.layers?.supports?.path,
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
  /** Visible solid map geometry, excluding purely photographic overlays and skirts. */
  get collisionSurfaces(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = []
    this.root?.traverseVisible((object) => {
      const mesh = object as THREE.Mesh
      if (
        mesh.isMesh &&
        !mesh.userData.drape &&
        mesh.name !== 'Drape' &&
        !/^skirt(?:_|$)/i.test(mesh.name)
      )
        meshes.push(mesh)
    })
    return meshes
  }
  get loadedCellCount(): number {
    return this.atlas ? this.cells.size : this.root ? 1 : 0
  }
  /** Snapshot for host map browsers; never exposes the scene graph or cache. */
  get mapCells(): { current: string; loaded: string[]; pending: string[] } | null {
    if (!this.atlasBase || !this.root) return null
    const width = planetTileFrame({ z: 15, ...this.atlasBase }).width
    const x = this.atlasBase.x + Math.floor(0.5 + (this.focus?.x ?? -this.pan.x) / width)
    const y = this.atlasBase.y + Math.floor(0.5 + (this.focus?.y ?? -this.pan.y) / width)
    return { current: `${x}/${y}`, loaded: [...this.cells.keys()], pending: [...this.pending] }
  }
  /** Centre a Z15 at the existing miniature anchor, reusing the four-cell cache. */
  async navigateCell(x: number, y: number): Promise<void> {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= 32768 || y >= 32768)
      throw new RangeError('Invalid Z15 coordinates')
    if (!this.root || !this.atlasBase) return
    const width = planetTileFrame({ z: 15, ...this.atlasBase }).width
    const next = new THREE.Vector2(-(x - this.atlasBase.x) * width, -(y - this.atlasBase.y) * width)
    const delta = next.clone().sub(this.pan)
    if (delta.x) this.travel.x = -Math.sign(delta.x)
    if (delta.y) this.travel.y = -Math.sign(delta.y)
    this.root.position.add(
      new THREE.Vector3(delta.x / this.denominator, 0, delta.y / this.denominator).applyQuaternion(
        this.root.quaternion,
      ),
    )
    this.pan.copy(next)
    this.focus = null
    this.selectQuarters()
    await this.loadNeighborhood()
  }
  private denominator = 100
  get scaleDenominator(): number {
    return this.denominator
  }
  /** Change presentation scale without reloading cells or altering map metres. */
  setScale(denominator: number): void {
    if (!Number.isFinite(denominator) || denominator <= 0)
      throw new RangeError('Map scale denominator must be positive and finite')
    this.denominator = denominator
    this.root?.scale.setScalar(1 / denominator)
  }
  private floorOffset = 0
  private neighborhood: Promise<void> | null = null
  private generation = 0
  private fallSpeed = 0
  private atlas = false
  private readonly pan = new THREE.Vector2()
  private focus: THREE.Vector2 | null = null
  private readonly travel = new THREE.Vector2(1, 1)
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
        let manifest = await response.json()
        let pkg: AtlasZ15Package | undefined
        if (manifest.z15Package?.file) {
          const response = await fetch(
            this.resolveUrl(new URL(manifest.z15Package.file, source).href),
            { cache: 'no-store' },
          )
          if (!response.ok)
            throw new Error(`No se pudo cargar el paquete Atlas (${response.status})`)
          pkg = validateAtlasZ15Package(await response.json(), manifest.tile)
          manifest = adaptAtlasManifest(manifest, pkg, { relief: 'lidar', photo: 'lo' })
        }
        for (const path of atlasModelPaths(manifest)) {
          content.add((await loader.loadAsync(this.resolveUrl(new URL(path, source).href))).scene)
        }
        if (pkg) {
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
      if (cell) await splitMapQuarters(content)
      if (generation !== this.generation) {
        disposeModel(root)
        return
      }
      this.atlasBase = cell ? { prefix: cell[1], x: Number(cell[2]), y: Number(cell[3]) } : null
      this.atlas = !!this.atlasBase
      this.pan.set(0, 0)
      this.focus = null
      this.cells.clear()
      this.pending.clear()
      if (this.atlas) {
        content.position.x = 0
        content.position.z = 0
        this.floorOffset = content.position.y
        this.cells.set(`${this.atlasBase!.x}/${this.atlasBase!.y}`, content)
      }
      if (this.root) disposeModel(this.root)
      root.scale.setScalar(1 / this.denominator)
      this.root = root
      this.scene.add(root)
      this.selectQuarters()
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
    if (dx) this.travel.x = -Math.sign(dx)
    if (dz) this.travel.y = -Math.sign(dz)
    this.focus = null
    this.pan.x += dx
    this.pan.y += dz
    this.root.position.add(
      new THREE.Vector3(dx / this.denominator, 0, dz / this.denominator).applyQuaternion(
        this.root.quaternion,
      ),
    )
    if (this.atlas) {
      this.selectQuarters()
      void this.loadNeighborhood()
    }
  }
  private quarterWindow(): { x: number; y: number } {
    const base = this.atlasBase!,
      width = planetTileFrame({ z: 15, x: base.x, y: base.y }).width
    return {
      x: base.x * 2 + Math.floor((this.focus?.x ?? -this.pan.x) / (width / 2)),
      y: base.y * 2 + Math.floor((this.focus?.y ?? -this.pan.y) / (width / 2)),
    }
  }
  /** Follow a vehicle or viewer in world space; only request work when crossing a quarter. */
  follow(world: THREE.Vector3): void {
    if (!this.root || !this.atlasBase) return
    const before = this.quarterWindow()
    const local = this.root.worldToLocal(world.clone())
    const previous = this.focus ?? new THREE.Vector2(-this.pan.x, -this.pan.y)
    if (Math.abs(local.x - previous.x) > 0.1) this.travel.x = Math.sign(local.x - previous.x)
    if (Math.abs(local.z - previous.y) > 0.1) this.travel.y = Math.sign(local.z - previous.y)
    this.focus = new THREE.Vector2(local.x, local.z)
    const after = this.quarterWindow()
    if (before.x !== after.x || before.y !== after.y) {
      this.selectQuarters()
      void this.loadNeighborhood()
    }
  }
  private selectQuarters(): void {
    if (!this.atlasBase) return
    const window = this.quarterWindow()
    for (const [key, cell] of this.cells) {
      const [x, y] = key.split('/').map(Number)
      cell.traverse((o) => {
        const q = o.userData.atlasQuarter as number[] | undefined
        if (q)
          o.visible =
            x * 2 + q[0] >= window.x &&
            x * 2 + q[0] <= window.x + 1 &&
            y * 2 + q[1] >= window.y &&
            y * 2 + q[1] <= window.y + 1
      })
    }
  }
  get visibleQuarterCount(): number {
    let count = 0
    this.root?.traverseVisible((o) => {
      if (o.userData.atlasQuarter) count++
    })
    return count
  }
  /** Four resident cells, with a single sequential loader and eviction before decoding. */
  async loadNeighborhood(): Promise<void> {
    if (this.neighborhood) {
      await this.neighborhood
      return this.loadNeighborhood()
    }
    if (!this.atlasBase || !this.root) return
    const root = this.root
    const window = this.quarterWindow()
    const x = Math.floor(window.x / 2) - (window.x % 2 === 0 && this.travel.x < 0 ? 1 : 0),
      y = Math.floor(window.y / 2) - (window.y % 2 === 0 && this.travel.y < 0 ? 1 : 0)
    const desired = [`${x}/${y}`, `${x + 1}/${y}`, `${x}/${y + 1}`, `${x + 1}/${y + 1}`]
    if (desired.every((key) => this.cells.has(key))) {
      this.selectQuarters()
      return
    }
    const work = async () => {
      for (const [key, cell] of this.cells)
        if (!desired.includes(key)) {
          disposeModel(cell)
          this.cells.delete(key)
        }
      for (const key of desired) {
        if (this.root !== root) return
        const [cx, cy] = key.split('/').map(Number)
        await this.ensureCell(cx, cy)
      }
      if (this.root === root)
        this.onStatus?.(
          `Mapa: ${this.visibleQuarterCount}/4 cuartos visibles · ${this.cells.size}/4 Z15 en memoria`,
        )
    }
    this.neighborhood = work()
    try {
      await this.neighborhood
    } finally {
      this.neighborhood = null
    }
  }
  private async ensureCell(requestX?: number, requestY?: number): Promise<void> {
    const root = this.root!
    const base = this.atlasBase!
    const width = planetTileFrame({ z: 15, x: base.x, y: base.y }).width
    const x = requestX ?? base.x + Math.floor(0.5 - this.pan.x / width),
      y = requestY ?? base.y + Math.floor(0.5 - this.pan.y / width)
    const key = `${x}/${y}`
    if (this.cells.has(key) || this.pending.has(key)) return
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
      content.position.set(0, this.floorOffset, 0)
      const neighborWidth = planetTileFrame({ z: 15, x, y }).width
      cell.scale.set(width / neighborWidth, 1, width / neighborWidth)
      cell.position.set((x - base.x) * width, 0, (y - base.y) * width)
      root.add(cell)
      this.cells.set(key, cell)
      temporary.root = null
      this.selectQuarters()
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
    this.focus = null
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
    this.atlasBase = null
    this.atlas = false
    this.focus = null
    this.cells.clear()
    this.pending.clear()
  }
}
