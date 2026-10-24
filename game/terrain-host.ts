/**
 * Host hooks for the terrain game (game/terrain-main.ts). A host registers them from a module
 * that runs before terrain-main.ts (an earlier `<script type="module">` on the page), so it
 * never has to patch the page. Kept on a global symbol so every module copy sees the same host.
 */
import type { GameRuntime, GameRuntimeOptions } from '@nabla/engine/runtime/browser'
import type { SceneDocument } from '@nabla/engine/scene'

export interface TerrainHost {
  /** Optional game-owned pickup; the generic terrain page has no fixed geographic location. */
  weaponPickupLocation?: GameRuntimeOptions['weaponPickupLocation']
  /** Runs right after the runtime is built, before the boot phase. */
  afterRuntime?(runtime: GameRuntime): void
  /** Runs once play() has resolved (ground, physics, resources, GPU warmup and reveal gates complete). */
  afterPlay?(runtime: GameRuntime, scene: SceneDocument): void
}

const HOST = Symbol.for('nabla.terrainHost')
type Holder = { [HOST]?: TerrainHost }

export function setTerrainHost(host: TerrainHost): void {
  ;(globalThis as Holder)[HOST] = host
}

export function terrainHost(): TerrainHost {
  return (globalThis as Holder)[HOST] ?? {}
}
