/** Bounded, exportable CPU/frame measurements. GPU timing is deliberately not inferred. */
export interface FrameSample {
  time: number
  frame: number
  cpu: number
  physics: number
  calls: number
  triangles: number
  install: number
}
export class PerformanceMonitor {
  private samples: FrameSample[] = []
  add(sample: FrameSample): void {
    if (sample.frame > 0 && sample.frame < 1000) {
      this.samples.push(sample)
      if (this.samples.length > 1800) this.samples.shift()
    }
  }
  reset(): void {
    this.samples = []
  }
  summary(): string {
    if (!this.samples.length) return 'Esperando muestras…'
    const recent = this.samples.slice(-240),
      ordered = recent.map((s) => s.frame).sort((a, b) => a - b)
    const mean = (key: keyof FrameSample) =>
      recent.reduce((sum, s) => sum + s[key], 0) / recent.length
    const percentile = (p: number) => ordered[Math.floor((ordered.length - 1) * p)]
    return `${(1000 / mean('frame')).toFixed(0)} FPS · p95 ${percentile(0.95).toFixed(1)} ms · p99 ${percentile(0.99).toFixed(1)} ms\nCPU ${mean('cpu').toFixed(1)} ms · física ${mean('physics').toFixed(1)} ms · instalación ${mean('install').toFixed(1)} ms\n${mean('calls').toFixed(0)} dibujos · ${(mean('triangles') / 1000).toFixed(0)}k triángulos · ${this.samples.length} muestras`
  }
  csv(): string {
    return (
      'time_ms,frame_ms,cpu_ms,physics_ms,draw_calls,triangles,install_ms\n' +
      this.samples
        .map((s) => [s.time, s.frame, s.cpu, s.physics, s.calls, s.triangles, s.install].join(','))
        .join('\n')
    )
  }
}
