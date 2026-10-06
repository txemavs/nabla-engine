/**
 * Start camera sequence: the views a start in a vehicle runs through before the player takes
 * over, e.g. overhead, then down into the driver's seat for the engine start-up, then out to the
 * chase camera. Hosts set it with `GameRuntimeOptions.startCameras` (`NABLA_BOOT.startCameras`);
 * without it the game starts in the driver view as before. Times are milliseconds.
 */
import type { GameCameraView } from './game-camera.js'

/** View names: host-friendly aliases (`overhead`, `driver`) plus the engine's own names. */
export type StartCameraName = 'overhead' | 'driver' | 'chase' | 'cinematic' | 'map' | 'cockpit'

export interface StartCameraStep {
  view: StartCameraName
  /**
   * When to move on to this step, counted once the previous step has been reached: a hold in
   * milliseconds, or `'engine'` to wait until the engine start-up (starter, needle sweep) has
   * finished. With an `'engine'` step the engine stays off until the camera reaches the step
   * before it, and starts there. Ignored for the first step, which shows from the first frame.
   * Default `START_CAMERA_HOLD_MS`.
   */
  after?: number | 'engine'
  /** Blend into this step, milliseconds (default: the camera's `modeTransitionMs`). */
  transitionMs?: number
}

/** A view name is shorthand for `{ view }`. */
export type StartCameraSequence = readonly (StartCameraName | StartCameraStep)[]

/** Default hold before moving on to the next step, milliseconds. */
export const START_CAMERA_HOLD_MS = 600

export interface ResolvedStartCamera {
  view: GameCameraView
  after: number | 'engine'
  transitionMs: number | null
}

const VIEWS: Readonly<Record<StartCameraName, GameCameraView>> = {
  overhead: 'map',
  map: 'map',
  driver: 'cockpit',
  cockpit: 'cockpit',
  chase: 'chase',
  cinematic: 'cinematic',
}

const nonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

/** Validate a host sequence and map view names to camera views; `undefined` is no sequence. */
export function resolveStartCameras(
  sequence: StartCameraSequence | undefined | null,
): ResolvedStartCamera[] {
  if (sequence == null) return []
  if (!Array.isArray(sequence)) throw new TypeError('startCameras must be an array of views')
  return sequence.map((entry, index) => {
    const step = (
      typeof entry === 'string' ? { view: entry } : (entry ?? {})
    ) as Partial<StartCameraStep>
    const name = step.view
    if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(VIEWS, name))
      throw new RangeError(`startCameras[${index}]: unknown view ${JSON.stringify(name)}`)
    const after = step.after ?? START_CAMERA_HOLD_MS
    if (after !== 'engine' && !nonNegative(after))
      throw new RangeError(`startCameras[${index}].after must be milliseconds or 'engine'`)
    if (step.transitionMs !== undefined && !nonNegative(step.transitionMs))
      throw new RangeError(`startCameras[${index}].transitionMs must be non-negative milliseconds`)
    return { view: VIEWS[name as StartCameraName], after, transitionMs: step.transitionMs ?? null }
  })
}

/** What one frame of the sequence asks the runtime to do. */
export interface StartCameraAction {
  /** Switch to this view (blending over `transitionMs`, null = camera default). */
  view?: GameCameraView
  transitionMs?: number | null
  /** Run the engine start-up now (the engine was held off). */
  startEngine?: boolean
  /** The sequence has finished; the player has the camera. */
  done?: boolean
}

/**
 * Steps through a resolved sequence. Each frame the runtime reports whether the camera has
 * reached the current view (no blend running) and whether the engine is running; the sequencer
 * answers with the next view, the engine start, or done. Pure: no camera or simulation access.
 */
export class StartCameraSequencer {
  /** True when an `'engine'` step holds the engine off until the camera gets there. */
  readonly holdsEngine: boolean
  private readonly engineAt: number
  private index = 0
  private arrivedAt: number | null = null
  private engineStarted = false
  private finished = false

  constructor(readonly steps: readonly ResolvedStartCamera[]) {
    if (!steps.length) throw new RangeError('startCameras needs at least one view')
    const engineStep = steps.findIndex((step, index) => index > 0 && step.after === 'engine')
    this.holdsEngine = engineStep > 0
    this.engineAt = engineStep - 1
  }

  /** The view shown from the first frame. */
  get first(): GameCameraView {
    return this.steps[0].view
  }
  get done(): boolean {
    return this.finished
  }

  update(frame: { now: number; arrived: boolean; engineRunning: boolean }): StartCameraAction {
    if (this.finished) return { done: true }
    const action: StartCameraAction = {}
    if (this.arrivedAt === null) {
      if (!frame.arrived) return action
      this.arrivedAt = frame.now
      if (this.holdsEngine && this.index === this.engineAt && !this.engineStarted) {
        this.engineStarted = true
        // The engine state reported this frame predates the start; decide on the next one.
        return { startEngine: true }
      }
    }
    const next = this.steps[this.index + 1]
    if (!next) {
      this.finished = true
      return { done: true }
    }
    const ready =
      next.after === 'engine'
        ? (!this.holdsEngine || this.engineStarted) && frame.engineRunning
        : frame.now - this.arrivedAt >= next.after
    if (!ready) return action
    this.index++
    this.arrivedAt = null
    return { view: next.view, transitionMs: next.transitionMs }
  }

  /**
   * End now (player input): starts a held engine. `toLast` also asks for the last view, for
   * driving input; C keeps the player's own camera choice.
   */
  skip(toLast = true): StartCameraAction {
    if (this.finished) return { done: true }
    this.finished = true
    const action: StartCameraAction = { done: true }
    if (this.holdsEngine && !this.engineStarted) {
      this.engineStarted = true
      action.startEngine = true
    }
    if (toLast) action.view = this.steps[this.steps.length - 1].view
    return action
  }
}
