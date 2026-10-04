/** One animation owner per runtime. The callback does not schedule itself. */
export class FrameLoop {
  private handle: number | undefined
  private running = false
  /** Inject the frame callback and scheduler; timestamps follow requestAnimationFrame milliseconds. */
  constructor(
    private readonly frame: (time: number) => void,
    private readonly request: (callback: FrameRequestCallback) => number = (callback) =>
      requestAnimationFrame(callback),
    private readonly cancel: (handle: number) => void = (handle) => cancelAnimationFrame(handle),
  ) {}
  /** Schedule exactly one pending frame; repeated starts do not create parallel loops. */
  start(): void {
    if (this.running) return
    this.running = true
    this.handle = this.request(this.tick)
  }
  /** Cancel the pending frame and prevent rescheduling; safe before the first start. */
  stop(): void {
    this.running = false
    if (this.handle !== undefined) this.cancel(this.handle)
    this.handle = undefined
  }
  /** Run one frame, stop on callback failure, and respect stop/restart requests made inside it. */
  private readonly tick = (time: number): void => {
    this.handle = undefined
    if (!this.running) return
    try {
      this.frame(time)
    } catch (error) {
      this.stop()
      throw error
    }
    // A callback may stop and restart the loop. start() already scheduled that frame.
    if (this.running && this.handle === undefined) this.handle = this.request(this.tick)
  }
}
