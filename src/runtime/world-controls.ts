import type { SceneDocument } from '../scene/document.js'
import type { GameRuntime } from './game.js'
import type { Simulation } from '../simulation/simulation.js'
import { simulationDefaults } from '../config/simulation.js'
import { liveSkyClock, skyRate, type SkyClock } from '../planet/sky.js'
import { worldWater } from './water.js'

type GravitySimulation = Pick<Simulation, 'setGravityScale'>

export interface WorldControlsHost {
  document(): SceneDocument
  simulation(): GravitySimulation | null
  readonly recover: GameRuntime['recover']
  roads: NonNullable<GameRuntime['recover']['roads']>
  pavedAreas: NonNullable<GameRuntime['recover']['pavedAreas']>
  assertAlive(): void
}

/** Per-runtime world policy; scene and simulation remain the authoritative owners. */
export class RuntimeWorldControls {
  private worldGravityScale: number

  constructor(
    private readonly host: WorldControlsHost,
    options: { gravityScale?: number; recoverToRoad?: boolean } = {},
  ) {
    this.worldGravityScale = options.gravityScale ?? simulationDefaults.gravityScaleRange.default
    host.recover.snapToRoad = options.recoverToRoad !== false
    host.recover.roads = host.roads
    host.recover.pavedAreas = host.pavedAreas
  }

  /** Apply the pending gravity when a play session creates its simulation. */
  applyGravity(simulation: GravitySimulation): void {
    this.worldGravityScale = simulation.setGravityScale(this.worldGravityScale)
  }

  /** Warmup and reveal each restart an authored accelerated clock at its origin. */
  restartAuthoredClock(): void {
    const clock = this.host.document().sky
    if (clock?.mode === 'live' && clock.origin) this.setSkyClock({ ...clock, since: Date.now() })
  }

  get skyClock(): SkyClock {
    return this.host.document().sky ?? { mode: 'live' }
  }

  setSkyClock(clock: SkyClock): void {
    this.host.assertAlive()
    this.host.document().sky =
      clock.mode === 'fixed'
        ? { mode: 'fixed', at: clock.at }
        : liveSkyClock(
            skyRate(clock),
            clock.since ?? Date.now(),
            clock.origin ? Date.parse(clock.origin) : Date.now(),
          )
  }

  get waterSettings(): SceneDocument['water'] {
    return this.host.document().water
  }

  get sea(): { level: number; state: string } {
    return worldWater(this.host.document().water, this.host.document().sky)
  }

  setWater(water: SceneDocument['water']): void {
    this.host.assertAlive()
    if (water === undefined) delete this.host.document().water
    else this.host.document().water = structuredClone(water)
  }

  get gravityScale(): number {
    return this.worldGravityScale
  }

  setGravityScale(scale: number): number {
    this.host.assertAlive()
    const { min, max, default: fallback } = simulationDefaults.gravityScaleRange
    this.worldGravityScale = Number.isFinite(scale) ? Math.min(max, Math.max(min, scale)) : fallback
    const simulation = this.host.simulation()
    if (simulation) this.worldGravityScale = simulation.setGravityScale(this.worldGravityScale)
    return this.worldGravityScale
  }

  get recoverToRoadEnabled(): boolean {
    return this.host.recover.snapToRoad
  }

  setRecoverToRoadEnabled(enabled: boolean): void {
    this.host.assertAlive()
    this.host.recover.snapToRoad = enabled
  }
}
