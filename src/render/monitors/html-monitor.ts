import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three'

import type { MonitorData, MonitorOptions } from './data.js'
export type { MonitorData, MonitorOptions } from './data.js'

/** Trusted local HTML/CSS templates, rasterised on demand into a depth-tested WebGL surface.
 * Scripts are never executed. Inline styles/fonts only; external resources are not supported.
 */
export class HtmlMonitor {
  readonly canvas = document.createElement('canvas')
  readonly texture: CanvasTexture
  private template?: Element
  private wrapper?: HTMLElement
  private bindings: { node: HTMLElement; key: string; bar: boolean; value: string }[] = []
  private readonly serializer = new XMLSerializer()
  private static rasterBusy = false
  private frameMs = 16.7
  private rasterMs = 0
  private intervalMs = 150
  private renders = 0
  private skipped = 0
  private lastNow?: number
  get diagnostics() {
    return {
      renders: this.renders,
      skipped: this.skipped,
      intervalMs: this.effectiveInterval,
      rasterMs: this.rasterMs,
    }
  }
  get effectiveInterval(): number {
    const pressure =
      this.options.adaptive === false ? 1 : Math.max(1, this.frameMs / 22, this.rasterMs / 8)
    return Math.min(
      5000,
      Math.max(50, this.intervalMs * Math.min(8, pressure) * (this.options.secondary ? 4 : 1)),
    )
  }
  setSecondary(secondary: boolean): void {
    this.options.secondary = secondary
  }
  setInterval(milliseconds: number): void {
    if (Number.isFinite(milliseconds)) this.intervalMs = Math.max(50, Math.min(5000, milliseconds))
  }
  private busy = false
  private disposed = false
  private nextFrame = 0
  private lastPayload = ''
  private readonly abort = new AbortController()
  private readonly options: MonitorOptions
  readonly ready: Promise<void>
  constructor(
    url: string,
    readonly width = 640,
    readonly height = 320,
    options: MonitorOptions = {},
  ) {
    this.options = { ...options }
    this.canvas.width = width
    this.canvas.height = height
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.texture.minFilter = LinearFilter
    this.texture.generateMipmaps = false
    this.ready = fetch(url, { signal: this.abort.signal, cache: 'no-cache' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Monitor template: ${response.status}`)
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html')
        this.template = doc.querySelector('[data-monitor]') ?? undefined
        if (!this.template) throw new Error('Monitor template needs [data-monitor]')
        this.template
          .querySelectorAll('script, iframe, object, embed')
          .forEach((node) => node.remove())
        const templateInterval = Number(this.template.getAttribute('data-update-ms'))
        this.setInterval(this.options.intervalMs ?? (templateInterval > 0 ? templateInterval : 150))
        this.wrapper = document.createElement('div')
        const style = document.createElement('style')
        style.textContent = [...doc.querySelectorAll('style')]
          .map((node) => node.textContent)
          .join('\n')
        this.wrapper.append(style, this.template)
        this.bindings = [
          ...this.template.querySelectorAll<HTMLElement>('[data-value], [data-bar]'),
        ].map((node) => ({
          node,
          key: node.dataset.value ?? node.dataset.bar!,
          bar: node.dataset.bar !== undefined,
          value: '\0',
        }))
      })
      .catch((error) => {
        if (!this.disposed) console.warn('Could not load monitor', url, error)
      })
  }
  update(data: MonitorData, now: number): void {
    if (this.lastNow !== undefined) {
      const elapsed = Math.max(0, Math.min(100, now - this.lastNow))
      this.frameMs += (elapsed - this.frameMs) * 0.04
    }
    this.lastNow = now
    if (
      !this.wrapper ||
      this.disposed ||
      this.busy ||
      now < this.nextFrame ||
      HtmlMonitor.rasterBusy
    )
      return
    this.nextFrame = now + this.effectiveInterval
    // Update only bound values, retaining the DOM and layout template between frames.
    let changed = !this.lastPayload
    for (const binding of this.bindings) {
      const raw = data.bars[binding.key]
      const value = binding.bar
        ? `${Number.isFinite(raw) ? Math.round(Math.max(0, Math.min(1, raw)) * 100) : 0}%`
        : String(data.values[binding.key] ?? '')
      if (value === binding.value) continue
      binding.value = value
      if (binding.bar) binding.node.style.width = value
      else binding.node.textContent = value
      changed = true
    }
    if (!changed) {
      this.skipped++
      return
    }
    const html = this.serializer.serializeToString(this.wrapper)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`
    this.busy = true
    HtmlMonitor.rasterBusy = true
    const started = performance.now()
    const image = new Image()
    image.onload = () => {
      this.busy = false
      HtmlMonitor.rasterBusy = false
      this.rasterMs = this.rasterMs * 0.8 + (performance.now() - started) * 0.2
      if (this.disposed) return
      const ctx = this.canvas.getContext('2d')!
      ctx.clearRect(0, 0, this.width, this.height)
      ctx.drawImage(image, 0, 0)
      this.texture.needsUpdate = true
      this.lastPayload = html
      this.renders++
    }
    image.onerror = () => {
      this.busy = false
      HtmlMonitor.rasterBusy = false
      this.lastPayload = ''
    }
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  }
  dispose(): void {
    this.disposed = true
    this.abort.abort()
    this.texture.dispose()
  }
}
