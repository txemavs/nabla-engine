/**
 * GPU timing abstraction for frame and per-pass measurements.
 *
 * WebGL2 uses EXT_disjoint_timer_query_webgl2; WebGPU implementations
 * can plug in via the same interface using timestamp queries.
 * Results arrive frames later; the backend tracks in-flight queries.
 */

/** Per-frame GPU timing results; values are milliseconds or undefined when unavailable. */
export interface GpuFrameTimings {
  /** Total GPU frame time in milliseconds. */
  frameMs?: number
  /** Per-pass GPU times in milliseconds. */
  passes: Partial<Record<GpuTimingPass, number>>
}

/** Named render passes that can be individually timed. */
export type GpuTimingPass = 'mirrors' | 'portals' | 'main' | 'post'

/** Query state for async GPU timing readback. */
export interface GpuTimingQuery {
  pass: GpuTimingPass | 'frame'
  frameNumber: number
}

/**
 * Abstract GPU timing backend. Implementations handle the graphics API specifics.
 * Query results are asynchronous; `finish` returns results from previous frames.
 */
export interface GpuTimingBackend {
  /** Whether the backend is available and can record queries. */
  readonly available: boolean
  /** Begin a named timing pass. Call before rendering that pass. */
  beginPass(pass: GpuTimingPass): void
  /** End the current timing pass. Call after rendering that pass. */
  endPass(pass: GpuTimingPass): void
  /** Begin whole-frame timing. Call at frame start. */
  beginFrame(): void
  /** End whole-frame timing. Call at frame end. */
  endFrame(): void
  /**
   * Finish frame timing collection and return results from completed queries.
   * Results may be from earlier frames due to async GPU readback.
   * Returns undefined when no results are ready or timing was disjoint.
   */
  finish(): GpuFrameTimings | undefined
  /** Release all GPU resources. */
  dispose(): void
}

/**
 * WebGL2 GPU timing using EXT_disjoint_timer_query_webgl2.
 *
 * Queries are pooled and reused. Results arrive 2-3 frames later.
 * Disjoint events (GPU power state changes) invalidate affected queries.
 */
interface EXT_disjoint_timer_query_webgl2 {
  readonly TIME_ELAPSED_EXT: GLenum
  readonly GPU_DISJOINT_EXT: GLenum
  readonly QUERY_COUNTER_BITS_EXT: GLenum
  readonly TIMESTAMP_EXT: GLenum
}

export class WebGL2GpuTiming implements GpuTimingBackend {
  readonly available: boolean
  private readonly ext: EXT_disjoint_timer_query_webgl2 | null
  private readonly gl: WebGL2RenderingContext

  private readonly queryPool: WebGLQuery[] = []
  private readonly activeQueries = new Map<GpuTimingPass | 'frame', WebGLQuery>()
  private readonly pendingQueries: Array<{
    query: WebGLQuery
    pass: GpuTimingPass | 'frame'
    frameNumber: number
  }> = []

  private frameNumber = 0
  private readonly results = new Map<number, GpuFrameTimings>()
  private readonly maxPendingFrames = 8

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
    this.available = this.ext !== null
  }

  private acquireQuery(): WebGLQuery | null {
    if (!this.ext) return null
    if (this.queryPool.length > 0) return this.queryPool.pop()!
    return this.gl.createQuery()
  }

  private releaseQuery(query: WebGLQuery): void {
    this.queryPool.push(query)
  }

  beginFrame(): void {
    if (!this.ext) return
    this.frameNumber++
    const query = this.acquireQuery()
    if (!query) return
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query)
    this.activeQueries.set('frame', query)
  }

  endFrame(): void {
    if (!this.ext) return
    const query = this.activeQueries.get('frame')
    if (!query) return
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
    this.activeQueries.delete('frame')
    this.pendingQueries.push({ query, pass: 'frame', frameNumber: this.frameNumber })
  }

  beginPass(pass: GpuTimingPass): void {
    if (!this.ext) return
    if (this.activeQueries.has('frame')) {
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
    }
    const query = this.acquireQuery()
    if (!query) return
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query)
    this.activeQueries.set(pass, query)
  }

  endPass(pass: GpuTimingPass): void {
    if (!this.ext) return
    const query = this.activeQueries.get(pass)
    if (!query) return
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
    this.activeQueries.delete(pass)
    this.pendingQueries.push({ query, pass, frameNumber: this.frameNumber })
    if (this.activeQueries.has('frame')) {
      const frameQuery = this.activeQueries.get('frame')!
      this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, frameQuery)
    }
  }

  finish(): GpuFrameTimings | undefined {
    if (!this.ext) return undefined

    const disjoint = this.gl.getParameter(this.ext.GPU_DISJOINT_EXT)
    if (disjoint) {
      for (const { query } of this.pendingQueries) {
        this.releaseQuery(query)
      }
      this.pendingQueries.length = 0
      this.results.clear()
      return undefined
    }

    const completed: number[] = []
    for (let i = 0; i < this.pendingQueries.length; i++) {
      const { query, pass, frameNumber } = this.pendingQueries[i]
      const available = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE)
      if (!available) continue

      const nanoseconds = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT)
      const ms = nanoseconds / 1_000_000

      let frameResult = this.results.get(frameNumber)
      if (!frameResult) {
        frameResult = { passes: {} }
        this.results.set(frameNumber, frameResult)
      }

      if (pass === 'frame') {
        frameResult.frameMs = ms
      } else {
        frameResult.passes[pass] = ms
      }

      this.releaseQuery(query)
      completed.push(i)
    }

    for (let i = completed.length - 1; i >= 0; i--) {
      this.pendingQueries.splice(completed[i], 1)
    }

    while (this.results.size > this.maxPendingFrames) {
      const oldest = Math.min(...this.results.keys())
      this.results.delete(oldest)
    }

    const availableFrames = [...this.results.keys()].sort((a, b) => a - b)
    if (availableFrames.length === 0) return undefined

    const oldestFrame = availableFrames[0]
    const result = this.results.get(oldestFrame)
    this.results.delete(oldestFrame)
    return result
  }

  dispose(): void {
    for (const query of this.queryPool) {
      this.gl.deleteQuery(query)
    }
    this.queryPool.length = 0

    for (const { query } of this.pendingQueries) {
      this.gl.deleteQuery(query)
    }
    this.pendingQueries.length = 0

    for (const query of this.activeQueries.values()) {
      this.gl.deleteQuery(query)
    }
    this.activeQueries.clear()
    this.results.clear()
  }
}

/** The parts of a `three/webgpu` renderer that timestamp timing reads (three internals). */
export interface TimestampRenderer {
  resolveTimestampsAsync(type?: 'render' | 'compute'): Promise<number | undefined>
  backend?: {
    trackTimestamp?: boolean
    timestampQueryPool?: Record<
      string,
      { queryOffsets: Map<string, number>; timestamps: Map<string, number> } | undefined
    >
  }
}

/**
 * WebGPU GPU timing from three's timestamp queries (`trackTimestamp`). Every render pass writes a
 * begin/end timestamp keyed by a per-call uid; a pass of ours is the set of uids allocated between
 * `beginPass` and `endPass`. One resolve per frame reads them back (skipped while the previous
 * readback is still mapping: those queries ride along with the next one). Frame time is the sum
 * of the passes, so GPU idle gaps between them are not counted (WebGL's frame query includes them).
 */
export class WebGPUGpuTiming implements GpuTimingBackend {
  readonly available: boolean
  private frameNumber = 0
  private readonly open = new Map<GpuTimingPass, Map<string, number>>()
  /** uid → frame and pass, until its duration is read back. */
  private readonly owners = new Map<string, { frameNumber: number; pass: GpuTimingPass }>()
  private readonly frames = new Map<number, { timings: GpuFrameTimings; waiting: number }>()
  private resolving = false
  private readonly maxPendingFrames = 8

  constructor(private readonly renderer: TimestampRenderer) {
    this.available = renderer.backend?.trackTimestamp === true
  }

  private get pool() {
    return this.renderer.backend?.timestampQueryPool?.render
  }

  beginFrame(): void {
    if (!this.available) return
    this.frameNumber++
    this.frames.set(this.frameNumber, { timings: { passes: {} }, waiting: 0 })
  }

  beginPass(pass: GpuTimingPass): void {
    if (!this.available) return
    this.open.set(pass, new Map(this.pool?.queryOffsets ?? []))
  }

  endPass(pass: GpuTimingPass): void {
    const before = this.open.get(pass)
    this.open.delete(pass)
    const frame = this.frames.get(this.frameNumber)
    if (!before || !frame) return
    for (const [uid, offset] of this.pool?.queryOffsets ?? []) {
      if (before.get(uid) === offset) continue
      this.owners.set(uid, { frameNumber: this.frameNumber, pass })
      frame.waiting++
    }
    frame.timings.passes[pass] ??= 0
  }

  endFrame(): void {
    if (!this.available || this.resolving || !this.owners.size) return
    this.resolving = true
    this.renderer
      .resolveTimestampsAsync('render')
      .then(() => {
        for (const [uid, ms] of this.pool?.timestamps ?? []) {
          const owner = this.owners.get(uid)
          if (!owner) continue
          this.owners.delete(uid)
          const frame = this.frames.get(owner.frameNumber)
          if (!frame) continue
          frame.timings.passes[owner.pass] = (frame.timings.passes[owner.pass] ?? 0) + ms
          frame.waiting--
        }
      })
      .catch(() => undefined)
      .finally(() => {
        this.resolving = false
      })
  }

  finish(): GpuFrameTimings | undefined {
    if (!this.available) return undefined
    while (this.frames.size > this.maxPendingFrames) {
      const oldest = Math.min(...this.frames.keys())
      this.frames.delete(oldest)
      for (const [uid, owner] of this.owners)
        if (owner.frameNumber === oldest) this.owners.delete(uid)
    }
    for (const frameNumber of [...this.frames.keys()].sort((a, b) => a - b)) {
      if (frameNumber === this.frameNumber) break
      const frame = this.frames.get(frameNumber)!
      if (frame.waiting > 0) continue
      this.frames.delete(frameNumber)
      const passes = Object.values(frame.timings.passes) as number[]
      if (!passes.length) continue
      frame.timings.frameMs = passes.reduce((sum, ms) => sum + ms, 0)
      return frame.timings
    }
    return undefined
  }

  dispose(): void {
    this.open.clear()
    this.owners.clear()
    this.frames.clear()
  }
}

/** Null implementation for environments without GPU timing support. */
export class NullGpuTiming implements GpuTimingBackend {
  readonly available = false
  beginPass(): void {}
  endPass(): void {}
  beginFrame(): void {}
  endFrame(): void {}
  finish(): undefined {
    return undefined
  }
  dispose(): void {}
}

/**
 * Create a GPU timing backend for the given WebGL2 context.
 * Returns a null implementation if the extension is unavailable.
 */
export function createGpuTiming(gl: WebGL2RenderingContext): GpuTimingBackend {
  const timing = new WebGL2GpuTiming(gl)
  return timing.available ? timing : new NullGpuTiming()
}
