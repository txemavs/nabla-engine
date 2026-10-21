/**
 * `?performanceLog=1` summary to compare inline and worker physics on the same machine. Every
 * second it publishes on the canvas (`data-perf`) and every 5 s logs `[nabla-perf]`:
 * - frameMs: mean interval between frames;
 * - cpuMs: mean main-thread work per frame (the whole frame callback);
 * - physicsMainMs: mean main-thread time spent in the physics step call (inline: the whole
 *   step; worker: only handing it over);
 * - physicsWorkerMs: mean cost of a step on the worker's own thread (0 inline);
 * - mainIdlePct: share of the second the main thread was not running frame work.
 */
export interface PerfSample {
  frameMs: number
  cpuMs: number
  physicsMainMs: number
  physicsWorkerMs: number
}

export interface PerfSummary {
  mode: 'inline' | 'worker'
  fps: number
  frameMs: number
  cpuMs: number
  physicsMainMs: number
  physicsWorkerMs: number
  mainIdlePct: number
}

export class PerfMeter {
  private started: number | null = null
  private sum = { frameMs: 0, cpuMs: 0, physicsMainMs: 0, physicsWorkerMs: 0 }
  private frames = 0
  private lastLog = -Infinity
  latest: PerfSummary | null = null

  constructor(
    private readonly publish: (summary: PerfSummary) => void,
    private readonly log: (line: string) => void = (line) => console.info(line),
  ) {}

  /** Add one frame; returns the summary when a second has been collected. */
  frame(mode: PerfSummary['mode'], sample: PerfSample, now: number): PerfSummary | null {
    this.started ??= now
    this.frames++
    this.sum.frameMs += sample.frameMs
    this.sum.cpuMs += sample.cpuMs
    this.sum.physicsMainMs += sample.physicsMainMs
    this.sum.physicsWorkerMs += sample.physicsWorkerMs
    const span = now - this.started
    if (span < 1000) return null
    const n = this.frames
    const round = (v: number) => Math.round(v * 10) / 10
    const summary: PerfSummary = {
      mode,
      fps: round((n * 1000) / span),
      frameMs: round(this.sum.frameMs / n),
      cpuMs: round(this.sum.cpuMs / n),
      physicsMainMs: round(this.sum.physicsMainMs / n),
      physicsWorkerMs: round(this.sum.physicsWorkerMs / n),
      mainIdlePct: Math.max(0, Math.round(100 - (this.sum.cpuMs / span) * 100)),
    }
    this.latest = summary
    this.publish(summary)
    if (now - this.lastLog >= 5000) {
      this.lastLog = now
      this.log(
        `[nabla-perf] ${mode} · ${summary.fps} fps · frame ${summary.frameMs} ms · main CPU ${summary.cpuMs} ms · physics main ${summary.physicsMainMs} ms · physics worker ${summary.physicsWorkerMs} ms · main idle ${summary.mainIdlePct}%`,
      )
    }
    this.started = now
    this.frames = 0
    this.sum = { frameMs: 0, cpuMs: 0, physicsMainMs: 0, physicsWorkerMs: 0 }
    return summary
  }
}
