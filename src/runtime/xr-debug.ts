/**
 * Temporary VR diagnostics (VR play modes only): a small panel fixed to the head, since the DOM
 * HUD is not visible in the headset, plus a console line every 2 s. Dev keys on the PC keyboard:
 * `[` / `]` step the terrain load distance, `;` / `'` the tile budget.
 *
 * Numbers are what the page measures: XR frame cadence (one frame renders both eyes), CPU time of
 * our frame callback, draw calls and triangles of the stereo render, XR framebuffer size. GPU time
 * is not measured (timer queries are not reliable inside the XR compositor).
 */
import * as THREE from 'three'

export interface XRDebugSample {
  time: number
  cpuMs: number
  physicsMs: number
  calls: number
  triangles: number
  framebuffer: [number, number] | null
  tiles: { loaded: number; visible: number; pending: number } | null
  distance: number
  cells: number
}

export interface XRDebugControls {
  setStreaming(options: { distance?: number; cells?: number }): void
  streaming: { distance: number; cells: number }
}

const distances = [250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000]

export class XRDebugPanel {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private readonly canvas = document.createElement('canvas')
  private readonly context: CanvasRenderingContext2D | null
  private readonly texture: THREE.CanvasTexture
  private intervals: number[] = []
  private cpu: number[] = []
  private previous: number | null = null
  private lastPanel = 0
  private lastLog = 0
  private note = ''
  private readonly onKey: (event: KeyboardEvent) => void

  constructor(
    head: THREE.Object3D,
    private readonly controls: XRDebugControls,
  ) {
    this.canvas.width = 512
    this.canvas.height = 224
    this.context = this.canvas.getContext('2d')
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.14),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        fog: false,
      }),
    )
    this.mesh.name = 'XR debug panel'
    // Low in the view, about 0.8 m ahead: readable without blocking the road.
    this.mesh.position.set(0, -0.28, -0.8)
    this.mesh.rotation.x = -0.3
    this.mesh.renderOrder = 10_000
    this.mesh.frustumCulled = false
    head.add(this.mesh)
    this.onKey = (event) => this.key(event)
    window.addEventListener('keydown', this.onKey)
  }

  private key(event: KeyboardEvent): void {
    const { distance, cells } = this.controls.streaming
    try {
      if (event.key === '[' || event.key === ']') {
        const index = distances.findIndex((d) => d >= distance)
        const at = index < 0 ? distances.length - 1 : index
        const next =
          distances[Math.max(0, Math.min(distances.length - 1, at + (event.key === ']' ? 1 : -1)))]
        this.controls.setStreaming({ distance: next })
        this.note = `Distancia ${next} m`
      } else if (event.key === ';' || event.key === "'") {
        const next = Math.max(4, Math.round(cells * (event.key === "'" ? 1.5 : 1 / 1.5)))
        this.controls.setStreaming({ cells: next })
        this.note = `Presupuesto ${next} teselas`
      } else return
    } catch (error) {
      this.note = String(error)
    }
    console.info(`[xr-debug] ${this.note}`)
  }

  sample(s: XRDebugSample): void {
    if (this.previous !== null && s.time > this.previous)
      this.intervals.push(s.time - this.previous)
    this.previous = s.time
    this.cpu.push(s.cpuMs)
    if (s.time - this.lastPanel < 500 || !this.intervals.length) return
    this.lastPanel = s.time
    const mean = (values: number[]) => values.reduce((sum, n) => sum + n, 0) / values.length
    const frame = mean(this.intervals)
    const worst = Math.max(...this.intervals)
    const lines = [
      `XR ${(1000 / frame).toFixed(0)} FPS · ${frame.toFixed(1)} ms (peor ${worst.toFixed(0)})`,
      `CPU ${mean(this.cpu).toFixed(1)} ms · física ${s.physicsMs.toFixed(1)} · GPU n/d`,
      `${s.calls} dibujos · ${(s.triangles / 1000).toFixed(0)}k triángulos`,
      `Z15 ${s.tiles ? `${s.tiles.visible} vis / ${s.tiles.loaded} carg / ${s.tiles.pending} pend` : 'n/d'}`,
      `Dist ${s.distance} m · máx ${s.cells} · FB ${s.framebuffer ? s.framebuffer.join('×') : 'n/d'}`,
      this.note || "[ ] distancia · ; ' teselas",
    ]
    this.intervals = []
    this.cpu = []
    this.draw(lines)
    if (s.time - this.lastLog >= 2000) {
      this.lastLog = s.time
      console.info(`[xr-debug] ${lines.slice(0, 5).join(' | ')}`)
    }
  }

  private draw(lines: string[]): void {
    const c = this.context
    if (!c) return
    c.clearRect(0, 0, this.canvas.width, this.canvas.height)
    c.fillStyle = 'rgba(0,0,0,0.6)'
    c.fillRect(0, 0, this.canvas.width, this.canvas.height)
    c.fillStyle = '#e8f6ff'
    c.font = '22px monospace'
    lines.forEach((line, i) => c.fillText(line, 12, 32 + i * 34))
    this.texture.needsUpdate = true
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey)
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.texture.dispose()
  }
}
