/** One animation owner per runtime. The callback does not schedule itself. */
import { resolveDisplaySettings } from '../config/display.js'
export class FrameLoop {
  private handle: number | undefined
  private running = false
  private intervalMs = 0
  private nextFrame: number | null = null
  /** Inject the frame callback and scheduler; timestamps follow requestAnimationFrame milliseconds. */
  constructor(
    private readonly frame: (time: number) => void,
    private readonly request: (callback: FrameRequestCallback) => number = (callback) =>
      requestAnimationFrame(callback),
    private readonly cancel: (handle: number) => void = (handle) => cancelAnimationFrame(handle),
  ) {}
  /** Limit submissions while retaining browser synchronization; zero follows display cadence. */
  setMaxFps(maxFps: number): void {
    resolveDisplaySettings({ maxFps })
    this.intervalMs = maxFps === 0 ? 0 : 1000 / maxFps
    this.nextFrame = null
  }
  /** Schedule exactly one pending frame; repeated starts do not create parallel loops. */
  start(): void {
    if (this.running) return
    this.running = true
    this.nextFrame = null
    this.handle = this.request(this.tick)
  }
  /** Cancel the pending frame and prevent rescheduling; safe before the first start. */
  stop(): void {
    this.running = false
    this.nextFrame = null
    if (this.handle !== undefined) this.cancel(this.handle)
    this.handle = undefined
  }
  /** Run one frame, stop on callback failure, and respect stop/restart requests made inside it. */
  private readonly tick = (time: number): void => {
    this.handle = undefined
    if (!this.running) return
    try {
      if (!this.intervalMs || this.nextFrame === null || time + 0.1 >= this.nextFrame) {
        if (this.intervalMs) {
          this.nextFrame =
            this.nextFrame === null
              ? time + this.intervalMs
              : this.nextFrame +
                Math.max(1, Math.floor((time - this.nextFrame) / this.intervalMs) + 1) *
                  this.intervalMs
        }
        this.frame(time)
      }
    } catch (error) {
      this.stop()
      throw error
    }
    // A callback may stop and restart the loop. start() already scheduled that frame.
    if (this.running && this.handle === undefined) this.handle = this.request(this.tick)
  }
}
