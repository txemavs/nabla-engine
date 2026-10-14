/** App callback cadence and CPU submission timings, not compositor FPS or GPU time. */
export class XRStats {
  private previous: number | null = null
  private since: number | null = null
  private intervals: number[] = []
  private cpu: number[] = []
  private physics: number[] = []
  reset(): void {
    this.previous = this.since = null
    this.intervals = []
    this.cpu = []
    this.physics = []
  }
  sample(
    time: number,
    cpu: number,
    physics: number,
    calls: number,
    triangles: number,
  ): string | null {
    if (this.previous !== null && time > this.previous) this.intervals.push(time - this.previous)
    this.previous = time
    this.since ??= time
    this.cpu.push(cpu)
    this.physics.push(physics)
    if (time - this.since < 1000 || !this.intervals.length) return null
    const mean = (values: number[]) => values.reduce((sum, n) => sum + n, 0) / values.length
    const sorted = [...this.intervals].sort((a, b) => a - b)
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]
    const text = `FPS app ${(1000 / mean(this.intervals)).toFixed(0)} · p95 ${p95.toFixed(1)} ms\nCPU ${mean(this.cpu).toFixed(1)} ms · física ${mean(this.physics).toFixed(1)} ms\n${Math.round(triangles).toLocaleString('es-ES')} triángulos · ${calls} dibujos\nCPU de envío; GPU no medida`
    this.since = time
    this.intervals = []
    this.cpu = []
    this.physics = []
    return text
  }
}
