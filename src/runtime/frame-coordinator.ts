import { simulationDefaults } from '../config/simulation.js'

/** A desktop frame suspends only at a yielded asynchronous physics result. */
export type FrameSteps = Generator<unknown, void, unknown>

export interface FrameCoordinatorHost {
  disposed(): boolean
  playing(): boolean
  pause(): void
  onError(error: unknown): void
}

/** Coordinates frame continuation and clocks, without scheduling or owning render resources. */
export class RuntimeFrameCoordinator {
  lastTime: number | null = null
  private generation = 0
  private busy = false
  private xrStepPending: Promise<void> | null = null
  private xrStepCarry = 0

  constructor(private readonly host: FrameCoordinatorHost) {}

  /** Invalidate pending continuations before replay or terminal resource release. */
  cancel(): void {
    ++this.generation
    this.busy = false
    this.xrStepPending = null
    this.xrStepCarry = 0
    this.lastTime = null
  }

  get frameBusy(): boolean {
    return this.busy
  }

  desktopTiming(time: number): { frameMs: number; dt: number } {
    const frameMs = this.lastTime === null ? 0 : Math.max(0, time - this.lastTime)
    const dt =
      this.lastTime === null
        ? 0
        : Math.min(simulationDefaults.maxFrameSeconds, Math.max(0, (time - this.lastTime) / 1000))
    this.lastTime = time
    return { frameMs, dt }
  }

  xrTiming(time: number, enabled: boolean): number {
    const dt =
      enabled && this.lastTime !== null
        ? Math.min(simulationDefaults.maxFrameSeconds, Math.max(0, (time - this.lastTime) / 1000))
        : 0
    this.lastTime = enabled ? time : null
    return dt
  }

  /** Inline frames finish synchronously; waiting desktop frames exclude further submissions. */
  drive(steps: FrameSteps, resumed = false, sent?: unknown): void {
    if (this.busy && !resumed) return
    for (let next = steps.next(sent); !next.done; next = steps.next(sent)) {
      const value = next.value
      if (value instanceof Promise) {
        const generation = this.generation
        this.busy = true
        value.then(
          (result: unknown) => {
            if (generation !== this.generation) return
            this.busy = false
            if (this.host.disposed() || !this.host.playing()) return
            try {
              this.drive(steps, true, result)
            } catch (error) {
              this.fail(error)
            }
          },
          (error: unknown) => {
            if (generation !== this.generation) return
            this.busy = false
            if (this.host.disposed() || !this.host.playing()) return
            this.fail(error)
          },
        )
        return
      }
      sent = value
    }
  }

  /** XR must render inside its callback, so pending physics never suspends presentation. */
  stepXR(dt: number, step: (seconds: number) => unknown): void {
    if (!this.xrStepPending) {
      const stepped = step(dt + this.xrStepCarry)
      this.xrStepCarry = 0
      if (stepped instanceof Promise) {
        const generation = this.generation
        this.xrStepPending = stepped.then(
          () => {
            if (generation !== this.generation) return
            this.xrStepPending = null
          },
          (error: unknown) => {
            if (generation !== this.generation) return
            this.xrStepPending = null
            if (this.host.disposed()) return
            this.fail(error)
          },
        )
      }
    } else this.xrStepCarry = Math.min(this.xrStepCarry + dt, simulationDefaults.maxFrameSeconds)
  }

  private fail(error: unknown): void {
    this.host.pause()
    this.host.onError(error)
  }
}

/** Attract uses milliseconds and a separate clock so loading cannot fast-forward its orbit. */
export function advanceAttractFrame(
  state: {
    last: number | null
    orbitSpeed: number
    orbitTarget: number
    elapsed: number
  },
  time: number,
): number {
  const frameMs = state.last === null ? 0 : time - state.last
  state.last = time
  const dt = Math.min(50, Math.max(0, frameMs))
  state.orbitSpeed += (state.orbitTarget - state.orbitSpeed) * (1 - Math.exp(-dt / 450))
  if (state.orbitSpeed < 0.001) state.orbitSpeed = 0
  state.elapsed += dt * state.orbitSpeed
  return frameMs
}
