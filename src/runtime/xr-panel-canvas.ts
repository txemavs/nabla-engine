import { interfaceTheme as theme } from '../ui/theme.js'
import * as THREE from 'three'

export type XRPanelPage =
  | 'main'
  | 'options'
  | 'radio'
  | 'quality'
  | 'development'
  | 'board'
  | 'target'
  | 'map'
  | 'environment'
  | 'experimental'
export interface XRPanelAction {
  /** Stable key for host-defined menu ordering, independent of the displayed label. */
  id?: string
  label: string
  /** Prepared model image; radio pages use the first three actions as a carousel. */
  preview?: string
  run: () => void
}
export function targetScore(x: number, y: number): number {
  const radius = Math.hypot(x - 512, y - 337)
  return radius > 225 ? 0 : Math.max(1, 10 - Math.floor(radius / 22.5))
}

/** The same layout coordinates drive drawing and pointer activation. */
export function radioActionAt(x: number, y: number): number {
  if (x >= 112 && x < 912 && y >= 90 && y < 310) return 1
  if (x < 24 || x >= 1008) return -1
  const col = Math.floor((x - 24) / 328)
  if ((x - 24) % 328 >= 312) return -1
  if (y >= 320 && y < 396) return col
  if (y >= 410 && y < 576 && (y - 410) % 90 < 76) return 3 + Math.floor((y - 410) / 90) * 3 + col
  return -1
}

/** Small, bounded drawing surface for the shared XR framed display. */
export class XRPanelCanvas {
  readonly canvas = document.createElement('canvas')
  readonly texture: THREE.CanvasTexture
  private lines: [number, number, number, number][] = []
  private hits: { x: number; y: number; score: number }[] = []
  private previous = new Map<XRInputSource, { x: number; y: number }>()
  private revision = 0
  private last = ''
  private images = new Map<string, HTMLImageElement>()
  private pressed = -1
  private until = 0
  constructor() {
    this.canvas.width = 1024
    this.canvas.height = 640
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
  }
  press(index: number): void {
    this.pressed = index
    this.until = performance.now() + 180
  }
  clear(page: XRPanelPage): void {
    if (page === 'board') this.lines = []
    else this.hits = []
    this.previous.clear()
    this.revision++
  }
  endStroke(source: XRInputSource): void {
    this.previous.delete(source)
  }
  retainSources(sources: XRInputSource[]): void {
    for (const source of this.previous.keys())
      if (!sources.includes(source)) this.previous.delete(source)
  }
  endStrokes(): void {
    this.previous.clear()
  }
  stroke(source: XRInputSource, x: number, y: number): void {
    if (y < 90 || y > 590) {
      this.endStroke(source)
      return
    }
    const last = this.previous.get(source) ?? { x, y }
    this.lines.push([last.x, last.y, x, y])
    if (this.lines.length > 4000) this.lines.shift()
    this.previous.set(source, { x, y })
    this.revision++
  }
  shot(x: number, y: number): number {
    const score = targetScore(x, y)
    this.hits.push({ x, y, score })
    if (this.hits.length > 96) this.hits.shift()
    this.revision++
    return score
  }
  draw(page: XRPanelPage, actions: XRPanelAction[], status: string): void {
    if (performance.now() > this.until) this.pressed = -1
    const key = JSON.stringify([
      page,
      actions.map((a) => [a.label, a.preview]),
      status,
      this.revision,
      this.pressed,
    ])
    if (key === this.last) return
    this.last = key
    const c = this.canvas.getContext('2d')!
    c.fillStyle = theme.surface
    c.fillRect(0, 0, 1024, 640)
    c.textAlign = 'left'
    c.font = `${theme.textSize}px Arial`
    c.fillStyle = theme.ink
    c.fillText(page === 'main' ? 'MENÚ PRINCIPAL' : '‹ Volver', 28, 48)
    c.textAlign = 'center'
    c.fillText(
      page === 'board'
        ? 'PIZARRA'
        : page === 'target'
          ? 'DIANA · 1–10'
          : page === 'options'
            ? 'OPCIONES'
            : page === 'radio'
              ? 'RADIOCONTROL'
              : page === 'map'
                ? 'MAPA'
                : page === 'environment'
                  ? 'ENTORNO'
                  : page === 'experimental'
                    ? 'HELICÓPTERO'
                    : 'NABLA',
      630,
      48,
    )
    c.fillStyle = theme.button
    c.fillRect(944, 12, 64, 56)
    c.fillStyle = theme.ink
    c.fillText('X', 976, 49)
    if (['main', 'options', 'radio', 'map', 'environment', 'experimental'].includes(page)) {
      const carousel = page === 'radio' && !!actions[1]?.preview
      if (carousel) {
        const url = actions[1].preview! + '?frame=2'
        let img = this.images.get(url)
        if (!img) {
          img = new Image()
          img.onload = () => {
            this.revision++
          }
          img.src = url
          this.images.set(url, img)
        }
        if (img.complete && img.naturalWidth) {
          const factor = Math.min(800 / img.naturalWidth, 220 / img.naturalHeight)
          const w = img.naturalWidth * factor,
            h = img.naturalHeight * factor
          c.drawImage(img, 512 - w / 2, 200 - h / 2, w, h)
        }
      }
      actions.forEach((action, i) => {
        const x = 24 + (i % 3) * 328,
          y = carousel
            ? i < 3
              ? 320
              : 410 + Math.floor((i - 3) / 3) * 90
            : 94 + Math.floor(i / 3) * 90
        const down = this.pressed === i
        c.fillStyle = down ? theme.selected : theme.button
        c.beginPath()
        c.roundRect(x, y, 312, 76, theme.radius)
        c.fill()
        c.strokeStyle = down ? theme.accent : theme.line
        c.lineWidth = 1
        c.stroke()
        c.fillStyle = theme.ink
        c.font = `${theme.textSize}px Arial`
        c.fillText(action.label, x + 156, y + 47, 294)
      })
      c.font = '18px Arial'
      c.fillText(status, 512, 600, 970)
    } else {
      c.font = '22px Arial'
      c.fillText('Borrar', 862, 48)
      if (page === 'board') {
        c.strokeStyle = '#72f4ff'
        c.lineWidth = 4
        c.lineCap = 'round'
        for (const [x, y, xx, yy] of this.lines) {
          c.beginPath()
          c.moveTo(x, y)
          c.lineTo(xx + 0.01, yy)
          c.stroke()
        }
      } else {
        for (let i = 10; i >= 1; i--) {
          c.beginPath()
          c.arc(512, 337, i * 22.5, 0, Math.PI * 2)
          c.fillStyle =
            i <= 2
              ? '#f4c84a'
              : i <= 4
                ? '#d44942'
                : i <= 6
                  ? '#44a5d4'
                  : i <= 8
                    ? '#202630'
                    : theme.ink
          c.fill()
          c.strokeStyle = '#6f7882'
          c.lineWidth = 1
          c.stroke()
          c.font = '14px Arial'
          c.fillStyle = i === 7 || i === 8 ? '#fff' : '#111'
          c.fillText(String(11 - i), 512 + (i - 0.5) * 22.5, 342)
        }
        for (const hit of this.hits) {
          c.beginPath()
          c.arc(hit.x, hit.y, 5, 0, Math.PI * 2)
          c.fillStyle = '#ff35e5'
          c.fill()
        }
      }
      c.fillStyle = theme.muted
      c.font = '19px Arial'
      c.fillText(
        page === 'board'
          ? 'Dibuja con el dedo o la punta del arma · Agarra el borde para mover'
          : `Último: ${this.hits.at(-1)?.score ?? '—'} · Total: ${this.hits.reduce((sum, h) => sum + h.score, 0)} · ${this.hits.length} impactos`,
        512,
        620,
      )
    }
    this.texture.needsUpdate = true
  }
  dispose(): void {
    for (const img of this.images.values()) img.onload = null
    this.images.clear()
    this.texture.dispose()
  }
}
