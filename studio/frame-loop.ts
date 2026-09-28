/** One animation owner per runtime. The callback does not schedule itself. */
export class FrameLoop {
  private handle: number | undefined
  private running = false
  constructor(
    private readonly frame: (time: number) => void,
    private readonly request: (callback: FrameRequestCallback) => number = (callback) =>
      requestAnimationFrame(callback),
    private readonly cancel: (handle: number) => void = (handle) => cancelAnimationFrame(handle),
  ) {}
  start(): void {
    if (this.running) return
    this.running = true
    this.handle = this.request(this.tick)
  }
  stop(): void {
    this.running = false
    if (this.handle !== undefined) this.cancel(this.handle)
    this.handle = undefined
  }
  private readonly tick = (time: number): void => {
    this.handle = undefined
    if (!this.running) return
    try {
      this.frame(time)
    } catch (error) {
      this.stop()
      throw error
    }
    if (this.running) this.handle = this.request(this.tick)
  }
}
