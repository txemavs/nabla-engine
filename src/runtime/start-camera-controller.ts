import { gameCameraView, setGameCameraView, type GameCameraState } from './game-camera.js'
import {
  resolveStartCameras,
  StartCameraSequencer,
  type StartCameraAction,
  type StartCameraSequence,
} from './start-cameras.js'
import type { Simulation } from '../simulation/simulation.js'

/** Overhead descent damping: preserved across preparation, held starts and gameplay. */
export const START_DESCENT_DAMPING = 1.2
type StartSimulation = {
  player: Pick<Simulation['player'], 'vehicleId'>
  vehicleInfo(id: string): Pick<ReturnType<Simulation['vehicleInfo']>, 'ignition' | 'helm'>
  startEngine(): unknown
  holdEngine(): unknown
}

/** Owns one runtime's start sequence and host hold; no input listeners or simulation lifecycle. */
export class RuntimeStartCameraController {
  private readonly steps
  private sequence: StartCameraSequencer | null = null
  private held: Promise<unknown> | null = null

  constructor(
    sequence: StartCameraSequence | undefined,
    private readonly camera: GameCameraState,
    private readonly report: (status: 'active' | 'none' | 'complete') => void,
  ) {
    this.steps = resolveStartCameras(sequence)
  }

  get active(): boolean {
    return this.sequence !== null
  }
  get first() {
    return this.sequence?.steps[0]
  }

  start(inVehicle: boolean, sim: StartSimulation): void {
    this.sequence = inVehicle && this.steps.length ? new StartCameraSequencer(this.steps) : null
    if (this.sequence) {
      setGameCameraView(this.camera, this.sequence.first, true)
      if (this.sequence.holdsEngine) sim.holdEngine()
    }
    this.report(this.sequence ? 'active' : 'none')
  }

  hold(gate: Promise<unknown>): void {
    const hold = gate.catch(() => undefined)
    this.held = hold
    void hold.then(() => {
      if (this.held === hold) this.held = null
    })
  }

  skip(sim: StartSimulation, finalView = true): void {
    if (this.sequence) this.apply(this.sequence.skip(finalView), sim)
  }

  advance(sim: StartSimulation, now: number): void {
    const sequence = this.sequence
    if (!sequence) return
    const id = sim.player.vehicleId
    if (!id) {
      this.skip(sim, false)
      return
    }
    const info = sim.vehicleInfo(id)
    const first = sequence.steps[0]
    const descending = first.view === 'map' && first.fromHeight !== undefined
    if (this.held) {
      if (descending && sequence.step === 0) {
        this.camera.mapHeight = first.fromHeight!
        this.camera.mapDescentDamping = START_DESCENT_DAMPING
      }
      return
    }
    const settling = descending && sequence.step === 0 && this.camera.mapDescentDamping != null
    this.apply(
      sequence.update({
        now,
        arrived: !settling && !this.camera.transition && !this.camera.entrance,
        engineRunning: info.ignition === 'running' && info.helm !== 'off',
      }),
      sim,
    )
  }

  private apply(action: StartCameraAction, sim: StartSimulation): void {
    if (action.startEngine) sim.startEngine()
    if (action.view && sim.player.vehicleId) {
      const current = gameCameraView(this.camera, true)
      if (action.view !== (current === 'bodycam' ? 'cockpit' : current)) {
        this.camera.nextTransitionMs = action.transitionMs ?? null
        setGameCameraView(this.camera, action.view, true)
      }
    }
    if (action.done) {
      this.sequence = null
      this.report('complete')
    }
  }
}
