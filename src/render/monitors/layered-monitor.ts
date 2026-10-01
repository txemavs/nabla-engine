import {
  BufferGeometry,
  CanvasTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three'
import type { HtmlMonitor } from './html-monitor.js'
import type { MonitorData, MonitorOptions } from './data.js'

type Rect = { id: string; x: number; y: number; width: number; height: number }
export type MonitorLayer = Rect &
  (
    | { kind: 'image'; url: string }
    | { kind: 'panel'; color: string }
    | {
        kind: 'needle'
        url: string
        binding: string
        pivot: [number, number]
        min: number
        max: number
        fromDegrees: number
        toDegrees: number
      }
    | {
        kind: 'text'
        binding: string
        columns: number
        color?: string
        font?: 'mono' | 'sans'
        align?: 'left' | 'center'
        /** 1 keeps the atlas cell. Lower crops side padding so letters sit closer. */
        tracking?: number
      }
    | { kind: 'bar'; binding: string; color: string }
    | { kind: 'html'; url: string; refresh?: MonitorOptions }
  )
export interface MonitorDefinition {
  width: number
  height: number
  layers: MonitorLayer[]
}

/** Pixel-space layered surface: origin at centre, definition coordinates from top left.
 * Transform `root` to mount it on any vehicle, terminal or portal console.
 * PNG alpha is retained. Needles/bars/glyphs change GPU transforms/UVs only.
 */
export class LayeredMonitor {
  readonly root = new Group()
  readonly ready: Promise<void>
  private readonly updates: ((data: MonitorData, now: number) => void)[] = []
  private readonly html: HtmlMonitor[] = []
  private readonly textures = new Set<Texture>()
  private disposed = false
  private secondary?: boolean
  private readonly meshes: Mesh<BufferGeometry, MeshBasicMaterial>[] = []
  constructor(readonly definition: MonitorDefinition) {
    const { width, height, layers } = definition
    if (![width, height].every((v) => Number.isFinite(v) && v > 0))
      throw Error('Invalid monitor size')
    const ids = new Set<string>()
    for (const layer of layers) {
      if (
        ids.has(layer.id) ||
        ![layer.x, layer.y, layer.width, layer.height].every(Number.isFinite) ||
        layer.width <= 0 ||
        layer.height <= 0
      )
        throw Error('Invalid monitor layer: ' + layer.id)
      if (
        layer.kind === 'text' &&
        (!Number.isInteger(layer.columns) ||
          layer.columns < 1 ||
          layer.columns > 128 ||
          (layer.tracking !== undefined &&
            (!Number.isFinite(layer.tracking) || layer.tracking <= 0 || layer.tracking > 1)))
      )
        throw Error('Invalid text columns')
      if (
        layer.kind === 'needle' &&
        (![...layer.pivot, layer.min, layer.max, layer.fromDegrees, layer.toDegrees].every(
          Number.isFinite,
        ) ||
          layer.max <= layer.min)
      )
        throw Error('Invalid needle range')
      ids.add(layer.id)
    }
    const pending: Promise<unknown>[] = []
    const loader = new TextureLoader()
    const imageCache = new Map<string, Texture>()
    const load = (url: string) => {
      const cached = imageCache.get(url)
      if (cached) return cached
      let texture!: Texture
      pending.push(
        new Promise<void>((resolve, reject) => {
          texture = loader.load(
            url,
            () => {
              if (this.disposed) texture.dispose()
              resolve()
            },
            undefined,
            reject,
          )
        }),
      )
      texture.colorSpace = SRGBColorSpace
      texture.minFilter = LinearFilter
      texture.generateMipmaps = false
      this.textures.add(texture)
      imageCache.set(url, texture)
      return texture
    }
    const atlases = new Map<string, CanvasTexture>()
    const make = (w: number, h: number, color: string, map?: Texture) => {
      const mesh = new Mesh(
        new PlaneGeometry(w, h),
        new MeshBasicMaterial({
          color,
          map: map ?? null,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        }),
      )
      this.meshes.push(mesh)
      return mesh
    }
    layers.forEach((layer, order) => {
      const group = new Group()
      group.name = layer.id
      group.position.set(
        layer.x - width / 2 + layer.width / 2,
        height / 2 - layer.y - layer.height / 2,
        order * 0.2,
      )
      this.root.add(group)
      if (layer.kind === 'text') {
        const font = layer.font ?? 'mono'
        let atlas = atlases.get(font)
        if (!atlas) {
          const canvas = document.createElement('canvas')
          canvas.width = 1024
          canvas.height = 512
          const ctx = canvas.getContext('2d')!
          ctx.fillStyle = 'white'
          ctx.font = font === 'sans' ? '700 44px Arial, sans-serif' : 'bold 44px monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          for (let i = 0; i < 96; i++)
            ctx.fillText(
              String.fromCharCode(i + 32),
              (i % 16) * 64 + 32,
              Math.floor(i / 16) * 64 + 32,
            )
          atlas = new CanvasTexture(canvas)
          atlas.colorSpace = SRGBColorSpace
          atlas.generateMipmaps = false
          atlas.minFilter = LinearFilter
          this.textures.add(atlas)
          atlases.set(font, atlas)
        }
        // Batch a full text row in one mesh, instead of one draw call per digit.
        // Tracking crops the same fraction it removes from the advance, so the
        // glyph stays the same size and only the gap shrinks.
        const tracking = layer.tracking ?? 1
        const textWidth =
          (font === 'sans'
            ? Math.min(layer.width, (layer.columns * layer.height) / 2)
            : layer.width) * tracking
        const geometry = new PlaneGeometry(textWidth, layer.height, layer.columns, 1).toNonIndexed()
        const baseUv = geometry.getAttribute('uv').array.slice()
        const textMesh = new Mesh(
          geometry,
          new MeshBasicMaterial({
            map: atlas,
            color: layer.color ?? '#ffffff',
            transparent: true,
            depthWrite: false,
            toneMapped: false,
          }),
        )
        textMesh.renderOrder = order + 1
        this.meshes.push(textMesh)
        group.add(textMesh)
        textMesh.visible = false
        let previous = ''
        this.updates.push((data) => {
          const value = String(data.values[layer.binding] ?? '').slice(0, layer.columns)
          if (value === previous) return
          previous = value
          textMesh.visible = !!value
          textMesh.position.x =
            layer.align === 'center'
              ? ((layer.columns - value.length) * textWidth) / layer.columns / 2
              : layer.tracking !== undefined
                ? (textWidth - layer.width) / 2
                : 0
          const uv = geometry.getAttribute('uv')
          const span = font === 'sans' ? 0.5 : 1
          const origin = font === 'sans' ? 0.25 : 0
          for (let i = 0; i < layer.columns; i++) {
            const code = i < value.length ? value.charCodeAt(i) : 32
            const glyph = code >= 32 && code < 128 ? code - 32 : 31
            const x = (glyph % 16) / 16,
              y = 1 - (Math.floor(glyph / 16) + 1) / 8
            for (let v = 0; v < 6; v++) {
              const index = i * 6 + v
              const local = baseUv[index * 2] * layer.columns - i
              uv.setXY(
                index,
                x + (origin + ((1 - tracking) / 2 + local * tracking) * span) / 16,
                y + baseUv[index * 2 + 1] / 8,
              )
            }
          }
          uv.needsUpdate = true
        })
        return
      }
      let texture: Texture | undefined
      if (layer.kind === 'image' || layer.kind === 'needle') texture = load(layer.url)
      const mesh = make(
        layer.width,
        layer.height,
        layer.kind === 'panel' || layer.kind === 'bar' ? layer.color : '#ffffff',
        texture,
      )
      mesh.renderOrder = order + 1
      group.add(mesh)
      if (layer.kind === 'html') {
        // Optional backend: layered PNG/glyph/needle screens never fetch this module.
        // Keep the plane invisible until it has a texture (no white startup flash).
        mesh.visible = false
        let monitor: HtmlMonitor | undefined
        let latest: { data: MonitorData; now: number } | undefined
        this.updates.push((data, now) => {
          if (monitor) monitor.update(data, now)
          else latest = { data: { values: { ...data.values }, bars: { ...data.bars } }, now }
        })
        pending.push(
          import('./html-monitor.js').then(async ({ HtmlMonitor }) => {
            if (this.disposed) return
            const surface = new HtmlMonitor(layer.url, layer.width, layer.height, layer.refresh)
            this.html.push(surface)
            if (this.secondary !== undefined) surface.setSecondary(this.secondary)
            await surface.ready
            if (this.disposed) return // dispose() already released the in-flight surface.
            monitor = surface
            mesh.material.map = surface.texture
            mesh.material.needsUpdate = true
            mesh.visible = true
            if (latest && this.root.visible) surface.update(latest.data, latest.now)
            latest = undefined
          }),
        )
      }
      if (layer.kind === 'needle') {
        group.position.x = layer.x - width / 2 + layer.pivot[0]
        group.position.y = height / 2 - layer.y - layer.pivot[1]
        mesh.position.set(layer.width / 2 - layer.pivot[0], layer.pivot[1] - layer.height / 2, 0)
        this.updates.push((data) => {
          const raw = Number(data.values[layer.binding])
          const value = Number.isFinite(raw) ? raw : layer.min
          const t = Math.max(0, Math.min(1, (value - layer.min) / (layer.max - layer.min)))
          group.rotation.z =
            (-(layer.fromDegrees + (layer.toDegrees - layer.fromDegrees) * t) * Math.PI) / 180
        })
      }
      if (layer.kind === 'bar')
        this.updates.push((data) => {
          const raw = data.bars[layer.binding]
          const value = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0
          mesh.scale.x = value
          mesh.position.x = (-(1 - value) * layer.width) / 2
        })
    })
    this.ready = Promise.all(pending).then(() => {})
  }
  setSecondary(value: boolean): void {
    this.secondary = value
    this.html.forEach((m) => m.setSecondary(value))
  }
  update(data: MonitorData, now: number): void {
    if (!this.disposed && this.root.visible) this.updates.forEach((update) => update(data, now))
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.root.removeFromParent()
    this.html.forEach((m) => m.dispose())
    this.textures.forEach((t) => t.dispose())
    this.meshes.forEach((m) => {
      m.geometry.dispose()
      m.material.dispose()
    })
  }
}
